-- Fixes to the ledger functions of 0044-0049.
--
-- reverse_debt_activity (0046): a row created after the activity, carried
-- forward from a row the activity changed, inherited the change without being
-- listed in snapshot_changes, so reversing left it. Every row from the
-- activity's month on is now corrected: a listed row by its own change, any
-- other by the change of the nearest listed row before it. Activities recorded
-- before 0046 are reversed on the rows the previous app changed: its own month
-- and the rows later carried forward from it, or, for a payment recorded from
-- 2026-07-05 17:24 UTC on (when payments started lowering later months), every
-- later row. A payment of that kind that may have been clamped at 0 is refused.
--
-- sync_investment_cash (0047) takes an optional p_amount. update_investment
-- and delete_investment move the purchase's existing cash by the change in the
-- lot's cost: after a partial sale, move or adjustment the lot's cost no longer
-- is what the purchase paid, and rebuilding the cash from it credited the
-- difference. Cash rewritten in place (the lot deleted, or edited without
-- changing its account or currency) skips the account type and currency
-- checks when it already is in that account: the previous app wrote cash to
-- any account, in any currency.
--
-- rebuild_opening_balances (0044) first takes the initial balance of any of
-- the caller's accounts that has openings but none stored, as 0044's backfill
-- did: an account written by the previous app version while 0044 deployed.
--
-- The unique index on recurring occurrences (0049) includes the user.
--
-- Rollback: re-run the CREATE OR REPLACE statements of 0044, 0046 and 0047 for
-- these functions (dropping sync_investment_cash(uuid, uuid, numeric, numeric,
-- boolean) first), and recreate transactions_recurring_occurrence_key from 0049.

CREATE OR REPLACE FUNCTION public.rebuild_opening_balances(p_from_month_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_from_code integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'rebuild_opening_balances: not signed in' USING ERRCODE = '42501';
  END IF;

  IF p_from_month_id IS NOT NULL THEN
    SELECT m.year * 100 + m.month INTO v_from_code
    FROM public.months m
    WHERE m.id = p_from_month_id
      AND m.user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'rebuild_opening_balances: month not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- One rebuild at a time per user: two concurrent ones would each write
  -- openings from their own snapshot of the legs.
  PERFORM pg_advisory_xact_lock(hashtextextended('rebuild_opening_balances:' || v_user::text, 0));

  WITH month_codes AS (
    SELECT m.id, m.year * 100 + m.month AS code
    FROM public.months m
    WHERE m.user_id = v_user
  ),
  anchor AS (
    SELECT DISTINCT ON (ob.account_id)
      ob.account_id, mc.code, ob.opening_amount, ob.opening_base_amount
    FROM public.opening_balances ob
    JOIN month_codes mc ON mc.id = ob.month_id
    JOIN public.accounts a ON a.id = ob.account_id
    WHERE a.user_id = v_user
      AND a.initial_amount IS NULL
    ORDER BY ob.account_id, mc.code
  ),
  earlier_legs AS (
    SELECT ta.account_id, sum(ta.amount) AS amount, sum(ta.base_amount) AS base_amount
    FROM public.transaction_amounts ta
    JOIN public.transactions t ON t.id = ta.transaction_id
    JOIN month_codes mc ON mc.id = t.month_id
    JOIN anchor an ON an.account_id = ta.account_id
    WHERE t.user_id = v_user
      AND t.deleted_at IS NULL
      AND mc.code < an.code
    GROUP BY ta.account_id
  )
  UPDATE public.accounts a
  SET
    initial_amount = an.opening_amount - coalesce(el.amount, 0),
    initial_base_amount = an.opening_base_amount - coalesce(el.base_amount, 0),
    initial_base_currency = (
      SELECT up.base_currency FROM public.user_preferences up WHERE up.user_id = v_user
    )
  FROM anchor an
  LEFT JOIN earlier_legs el ON el.account_id = an.account_id
  WHERE an.account_id = a.id;

  WITH user_months AS (
    SELECT m.id, m.year * 100 + m.month AS code
    FROM public.months m
    WHERE m.user_id = v_user
  ),
  user_accounts AS (
    SELECT
      a.id,
      coalesce(a.initial_amount, 0) AS initial_amount,
      coalesce(a.initial_base_amount, 0) AS initial_base_amount
    FROM public.accounts a
    WHERE a.user_id = v_user
  ),
  movements AS (
    SELECT
      t.month_id,
      ta.account_id,
      sum(ta.amount) AS amount,
      sum(ta.base_amount) AS base_amount
    FROM public.transaction_amounts ta
    JOIN public.transactions t ON t.id = ta.transaction_id
    WHERE t.user_id = v_user
      AND t.deleted_at IS NULL
      AND t.month_id IS NOT NULL
    GROUP BY t.month_id, ta.account_id
  ),
  grid AS (
    SELECT
      um.id AS month_id,
      um.code,
      ua.id AS account_id,
      ua.initial_amount,
      ua.initial_base_amount,
      coalesce(mv.amount, 0) AS amount,
      coalesce(mv.base_amount, 0) AS base_amount
    FROM user_months um
    CROSS JOIN user_accounts ua
    LEFT JOIN movements mv ON mv.month_id = um.id AND mv.account_id = ua.id
  ),
  openings AS (
    SELECT
      g.month_id,
      g.account_id,
      g.code,
      g.initial_amount + coalesce(sum(g.amount) OVER earlier, 0) AS opening_amount,
      g.initial_base_amount + coalesce(sum(g.base_amount) OVER earlier, 0) AS opening_base_amount
    FROM grid g
    WINDOW earlier AS (
      PARTITION BY g.account_id
      ORDER BY g.code
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    )
  )
  INSERT INTO public.opening_balances (month_id, account_id, opening_amount, opening_base_amount)
  SELECT o.month_id, o.account_id, o.opening_amount, o.opening_base_amount
  FROM openings o
  WHERE v_from_code IS NULL OR o.code >= v_from_code
  ON CONFLICT (month_id, account_id) DO UPDATE
    SET opening_amount = excluded.opening_amount,
        opening_base_amount = excluded.opening_base_amount
    WHERE public.opening_balances.opening_amount IS DISTINCT FROM excluded.opening_amount
       OR public.opening_balances.opening_base_amount IS DISTINCT FROM excluded.opening_base_amount;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_debt_activity(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_nw_item_id uuid;
  v_debt_currency text;
  v_activity public.debt_activities;
  v_year integer;
  v_month integer;
  v_account_currency text;
  v_row public.nw_snapshots;
  v_change jsonb;
  v_delta numeric;
  v_delta_base numeric;
  v_amount numeric;
  v_carried boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT d.nw_item_id INTO v_nw_item_id
  FROM public.debt_activities d
  WHERE d.id = p_activity_id;

  SELECT i.currency INTO v_debt_currency
  FROM public.nw_items i
  WHERE i.id = v_nw_item_id AND i.user_id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimiento no encontrado';
  END IF;

  SELECT * INTO v_activity
  FROM public.debt_activities d
  WHERE d.id = p_activity_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimiento no encontrado';
  END IF;

  v_year := extract(year FROM v_activity.date)::integer;
  v_month := extract(month FROM v_activity.date)::integer;

  IF v_activity.snapshot_changes IS NULL AND v_activity.activity_type = 'payment' THEN
    SELECT a.currency INTO v_account_currency
    FROM public.transaction_amounts ta
    JOIN public.accounts a ON a.id = ta.account_id
    WHERE ta.transaction_id = v_activity.transaction_id
    LIMIT 1;
    IF v_account_currency IS DISTINCT FROM v_debt_currency THEN
      RAISE EXCEPTION 'Este pago se hizo desde una cuenta en otra moneda antes de que los pagos se pudieran revertir. Corregí el saldo de la deuda a mano.';
    END IF;
  END IF;

  FOR v_row IN
    SELECT *
    FROM public.nw_snapshots s
    WHERE s.nw_item_id = v_activity.nw_item_id
      AND (s.year, s.month) >= (v_year, v_month)
    ORDER BY s.year, s.month
    FOR UPDATE
  LOOP
    IF v_activity.snapshot_changes IS NOT NULL THEN
      SELECT c.value INTO v_change
      FROM jsonb_array_elements(v_activity.snapshot_changes) AS c
      WHERE (c.value->>'year')::integer = v_row.year
        AND (c.value->>'month')::integer = v_row.month;
      IF FOUND THEN
        v_delta := (v_change->>'amount')::numeric;
        v_delta_base := (v_change->>'amount_base')::numeric;
      END IF;
      -- Not listed: the row was carried forward from the nearest listed row
      -- before it and inherited that change.
      CONTINUE WHEN v_delta IS NULL;
    ELSIF (v_row.year, v_row.month) = (v_year, v_month)
       OR (v_activity.activity_type = 'payment' AND v_activity.created_at >= '2026-07-05 17:24:29+00')
       OR (v_carried AND v_row.created_at > v_activity.created_at) THEN
      -- A later row created after the activity was carried forward from the
      -- row before it, and has the change only if that row does.
      v_carried := true;
      v_delta := CASE WHEN v_activity.activity_type = 'payment' THEN -v_activity.amount ELSE v_activity.amount END;
      v_delta_base := NULL;
      IF v_activity.activity_type = 'payment' AND v_row.amount = 0 THEN
        RAISE EXCEPTION 'Este pago se registró antes de que los pagos se pudieran revertir y dejó la deuda en 0. Corregí el saldo de la deuda con un ajuste.';
      END IF;
    ELSE
      v_carried := false;
      CONTINUE;
    END IF;

    v_amount := greatest(0, round(v_row.amount - v_delta, 4));
    UPDATE public.nw_snapshots s
    SET amount = v_amount,
        amount_base = CASE
          WHEN v_row.amount_base IS NULL THEN NULL
          WHEN v_amount = 0 THEN 0
          WHEN v_delta_base IS NOT NULL THEN v_row.amount_base - v_delta_base
          WHEN v_row.amount > 0 THEN round(v_row.amount_base * v_amount / v_row.amount, 4)
          ELSE v_row.amount_base
        END
    WHERE s.id = v_row.id;
  END LOOP;

  DELETE FROM public.debt_activities d WHERE d.id = v_activity.id;

  -- With the activity gone the expense is no longer a debt payment, so it can
  -- be soft-deleted like any other.
  IF EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = v_activity.transaction_id AND t.deleted_at IS NULL
  ) THEN
    PERFORM public.set_ledger_transaction_deleted(v_activity.transaction_id, true);
  END IF;
END;
$$;

DROP FUNCTION public.sync_investment_cash(uuid, uuid, numeric);

-- p_amount, when given, is the cash to write (signed) instead of the cost or
-- proceeds of the source row. p_in_place says the cash is rewritten for the
-- same account and currency it was written for.
CREATE FUNCTION public.sync_investment_cash(
  p_investment_id uuid,
  p_sale_id uuid,
  p_rate numeric,
  p_amount numeric DEFAULT NULL,
  p_in_place boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_account_id uuid;
  v_currency text;
  v_date date;
  v_description text;
  v_amount numeric;
  v_account public.accounts;
  v_old_months uuid[];
  v_month_id uuid;
  v_transaction_id uuid;
  v_rebuild_from uuid;
  v_kept_in_account boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF (p_investment_id IS NULL) = (p_sale_id IS NULL) THEN
    RAISE EXCEPTION 'Indicá una compra o una venta';
  END IF;

  IF p_investment_id IS NOT NULL THEN
    SELECT i.account_id, i.currency, i.purchase_date, 'Compra: ' || i.asset_name, least(coalesce(p_amount, -i.total_cost), 0)
    INTO v_account_id, v_currency, v_date, v_description, v_amount
    FROM public.investments i
    WHERE i.id = p_investment_id AND i.user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inversión no encontrada';
    END IF;
  ELSE
    SELECT s.account_id, s.currency, s.sale_date, 'Venta: ' || s.asset_name, greatest(coalesce(p_amount, s.total_proceeds - s.fees - s.tax), 0)
    INTO v_account_id, v_currency, v_date, v_description, v_amount
    FROM public.investment_sales s
    WHERE s.id = p_sale_id AND s.user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Venta no encontrada';
    END IF;
  END IF;

  SELECT p_in_place AND coalesce(bool_or(ta.account_id = v_account_id), false) INTO v_kept_in_account
  FROM public.transactions t
  JOIN public.transaction_amounts ta ON ta.transaction_id = t.id
  WHERE t.user_id = v_user
    AND t.deleted_at IS NULL
    AND (t.source_investment_id = p_investment_id OR t.source_investment_sale_id = p_sale_id);

  WITH removed AS (
    DELETE FROM public.transactions t
    WHERE t.user_id = v_user
      AND (t.source_investment_id = p_investment_id OR t.source_investment_sale_id = p_sale_id)
    RETURNING t.month_id
  )
  SELECT array_agg(removed.month_id) INTO v_old_months FROM removed;

  -- A purchase debits and a sale credits; nothing to move writes no cash.
  IF p_rate IS NOT NULL AND v_amount <> 0 THEN
    IF p_rate <= 0 THEN
      RAISE EXCEPTION 'El tipo de cambio debe ser mayor a 0';
    END IF;

    SELECT * INTO v_account
    FROM public.accounts a
    WHERE a.id = v_account_id AND a.user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cuenta no encontrada';
    END IF;
    IF NOT v_kept_in_account
       AND v_account.account_type NOT IN ('investment_broker', 'crypto_exchange', 'crypto_wallet') THEN
      RAISE EXCEPTION 'Solo una cuenta de inversión mueve caja al comprar o vender';
    END IF;
    IF NOT v_kept_in_account AND v_account.currency <> v_currency THEN
      RAISE EXCEPTION 'La cuenta está en % y la inversión en %: la caja no se puede mover en otra moneda. Registrá el movimiento de caja a mano.', v_account.currency, v_currency;
    END IF;

    INSERT INTO public.months (user_id, year, month)
    VALUES (v_user, extract(year FROM v_date)::integer, extract(month FROM v_date)::integer)
    ON CONFLICT (user_id, year, month) DO NOTHING;
    SELECT m.id INTO v_month_id
    FROM public.months m
    WHERE m.user_id = v_user
      AND m.year = extract(year FROM v_date)::integer
      AND m.month = extract(month FROM v_date)::integer;

    INSERT INTO public.transactions (
      user_id, month_id, category_id, transaction_type, date, description,
      source_investment_id, source_investment_sale_id
    )
    VALUES (v_user, v_month_id, NULL, 'investment', v_date, v_description, p_investment_id, p_sale_id)
    RETURNING id INTO v_transaction_id;

    INSERT INTO public.transaction_amounts (
      transaction_id, account_id, amount, original_currency, exchange_rate, base_amount
    )
    VALUES (v_transaction_id, v_account_id, v_amount, v_account.currency, p_rate, round(v_amount * p_rate, 8));
  END IF;

  SELECT m.id INTO v_rebuild_from
  FROM public.months m
  WHERE m.id = ANY (array_append(coalesce(v_old_months, '{}'::uuid[]), v_month_id))
  ORDER BY m.year, m.month
  LIMIT 1;
  IF v_rebuild_from IS NOT NULL THEN
    PERFORM public.rebuild_opening_balances(v_rebuild_from);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_investment(
  p_id uuid,
  p_changes jsonb,
  p_cash_rate numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_before public.investments;
  v_after public.investments;
  v_cash numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_before
  FROM public.investments i
  WHERE i.id = p_id AND i.user_id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inversión no encontrada';
  END IF;
  IF p_changes ? 'account_id' AND NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = (p_changes->>'account_id')::uuid AND a.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'Cuenta no encontrada';
  END IF;

  UPDATE public.investments i
  SET account_id = coalesce((p_changes->>'account_id')::uuid, i.account_id),
      asset_name = coalesce(p_changes->>'asset_name', i.asset_name),
      ticker = coalesce(p_changes->>'ticker', i.ticker),
      isin = coalesce(p_changes->>'isin', i.isin),
      asset_type = coalesce(p_changes->>'asset_type', i.asset_type),
      quantity = coalesce((p_changes->>'quantity')::numeric, i.quantity),
      price_per_unit = coalesce((p_changes->>'price_per_unit')::numeric, i.price_per_unit),
      total_cost = coalesce((p_changes->>'total_cost')::numeric, i.total_cost),
      currency = coalesce(p_changes->>'currency', i.currency),
      purchase_date = coalesce((p_changes->>'purchase_date')::date, i.purchase_date),
      notes = coalesce(p_changes->>'notes', i.notes),
      updated_at = now()
  WHERE i.id = p_id
  RETURNING * INTO v_after;

  SELECT sum(ta.amount) INTO v_cash
  FROM public.transactions t
  JOIN public.transaction_amounts ta ON ta.transaction_id = t.id
  WHERE t.source_investment_id = p_id
    AND t.user_id = v_user
    AND t.deleted_at IS NULL;

  IF v_cash IS NOT NULL
     AND (v_after.total_cost, v_after.purchase_date, v_after.account_id, v_after.currency, v_after.asset_name)
         IS DISTINCT FROM (v_before.total_cost, v_before.purchase_date, v_before.account_id, v_before.currency, v_before.asset_name) THEN
    IF p_cash_rate IS NULL THEN
      RAISE EXCEPTION 'Falta el tipo de cambio para actualizar la caja de esta compra';
    END IF;
    PERFORM public.sync_investment_cash(
      p_id,
      NULL,
      p_cash_rate,
      v_cash - (v_after.total_cost - v_before.total_cost),
      (v_after.account_id, v_after.currency) = (v_before.account_id, v_before.currency)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_investment(p_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_lot public.investments;
  v_cash numeric;
  v_rate numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lot
  FROM public.investments i
  WHERE i.id = p_id AND i.user_id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inversión no encontrada';
  END IF;

  SELECT sum(ta.amount), min(ta.exchange_rate) INTO v_cash, v_rate
  FROM public.transactions t
  JOIN public.transaction_amounts ta ON ta.transaction_id = t.id
  WHERE t.source_investment_id = p_id
    AND t.user_id = v_user
    AND t.deleted_at IS NULL;

  -- The cash of what is left of the lot goes with it; what already left the
  -- lot (sold, moved, adjusted away) stays paid.
  PERFORM public.sync_investment_cash(p_id, NULL, v_rate, coalesce(v_cash, 0) + v_lot.total_cost, true);
  DELETE FROM public.investments i WHERE i.id = p_id;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_recurring_occurrence_key
  ON public.transactions (user_id, recurring_id, occurrence_date)
  WHERE deleted_at IS NULL AND recurring_id IS NOT NULL;
DROP INDEX IF EXISTS public.transactions_recurring_occurrence_key;

REVOKE EXECUTE ON FUNCTION public.sync_investment_cash(uuid, uuid, numeric, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_investment_cash(uuid, uuid, numeric, numeric, boolean) TO authenticated, service_role;
