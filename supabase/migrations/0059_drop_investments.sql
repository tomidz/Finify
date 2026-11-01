-- Investments are no longer tracked: money sent to a broker is an investment
-- movement entered by hand (0058). This removes what held positions:
--
--   - account_net_worth_year: balances only. Without the investment_* columns
--     the return type changes, so it is dropped and created; an inactive
--     account is listed while it holds a balance.
--   - net_worth_evolution_year: each month's cash minus debts.
--   - user_valued_currencies: accounts and debts.
--   - save_ledger_transaction and set_ledger_transaction_deleted no longer
--     check the link to a lot or a sale: the cash movements those created stay
--     as ordinary investment movements, editable like any other.
--   - The functions that bought, sold, swapped, moved or paid with positions.
--   - transactions.source_investment_id and source_investment_sale_id, and the
--     tables investments, investment_sales and instrument_prices.
--
-- The movements' legs are untouched, so every balance and opening stays as it
-- was.
--
-- Rollback: not by migration. The dropped rows come back only from a backup
-- (docs/runbooks/restore-from-backup.md), after re-running 0010 through 0057
-- for the tables and functions.

CREATE OR REPLACE FUNCTION public.user_valued_currencies()
RETURNS SETOF text
LANGUAGE sql
STABLE
AS $$
  SELECT currency FROM public.accounts WHERE user_id = auth.uid()
  UNION
  SELECT currency FROM public.nw_items WHERE user_id = auth.uid() AND side = 'liability';
$$;

DROP FUNCTION public.account_net_worth_year(integer, text);

CREATE FUNCTION public.account_net_worth_year(
  p_year integer,
  p_base_currency text DEFAULT NULL
)
RETURNS TABLE (
  year integer,
  month integer,
  close_date date,
  account_id uuid,
  account_name text,
  account_type text,
  currency text,
  currency_symbol text,
  is_active boolean,
  balance numeric,
  balance_base numeric,
  balance_book_base numeric,
  balance_fx_missing boolean,
  balance_fx_rate_date date
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT public.resolve_base_currency(p_base_currency) AS code
  ),
  -- The year's latest month.
  period AS (
    SELECT
      m.id AS month_id,
      m.month,
      (make_date(p_year, m.month, 1) + interval '1 month')::date AS next_month_start,
      least((make_date(p_year, m.month, 1) + interval '1 month')::date - 1, public.app_today()) AS close_date
    FROM public.months m
    WHERE m.user_id = auth.uid()
      AND m.year = p_year
    ORDER BY m.month DESC
    LIMIT 1
  ),
  openings AS (
    SELECT
      ob.account_id,
      sum(ob.opening_amount)::numeric AS amount,
      sum(ob.opening_base_amount)::numeric AS base_amount
    FROM public.opening_balances ob
    JOIN period p ON p.month_id = ob.month_id
    GROUP BY ob.account_id
  ),
  movements AS (
    SELECT
      ta.account_id,
      sum(ta.amount)::numeric AS amount,
      sum(ta.base_amount)::numeric AS base_amount
    FROM public.transaction_amounts ta
    JOIN public.transactions t ON t.id = ta.transaction_id
    JOIN period p ON p.month_id = t.month_id
    WHERE t.user_id = auth.uid()
      AND t.deleted_at IS NULL
    GROUP BY ta.account_id
  ),
  rates AS (
    SELECT cu.currency, fx.rate, fx.rate_date
    FROM public.user_valued_currencies() AS cu(currency)
    CROSS JOIN base
    CROSS JOIN period p
    LEFT JOIN LATERAL public.fx_rate_asof(p.close_date, cu.currency, base.code, public.fx_max_age_days(cu.currency, base.code)) fx ON true
  ),
  account_values AS (
    SELECT
      a.id,
      a.name,
      a.account_type,
      a.currency,
      c.symbol AS currency_symbol,
      a.is_active,
      coalesce(o.amount, 0) + coalesce(mv.amount, 0) AS balance,
      coalesce(o.base_amount, 0) + coalesce(mv.base_amount, 0) AS balance_book_base,
      r.rate,
      r.rate_date
    FROM public.accounts a
    JOIN public.currencies c ON c.code = a.currency
    LEFT JOIN openings o ON o.account_id = a.id
    LEFT JOIN movements mv ON mv.account_id = a.id
    LEFT JOIN rates r ON r.currency = a.currency
    WHERE a.user_id = auth.uid()
  )
  SELECT
    p_year AS year,
    p.month,
    p.close_date,
    av.id AS account_id,
    av.name AS account_name,
    av.account_type,
    av.currency,
    av.currency_symbol,
    av.is_active,
    av.balance,
    CASE
      WHEN av.balance = 0 THEN 0
      WHEN av.rate IS NULL THEN av.balance_book_base
      ELSE av.balance * av.rate
    END AS balance_base,
    av.balance_book_base,
    av.balance <> 0 AND av.rate IS NULL AS balance_fx_missing,
    CASE WHEN av.currency <> base.code AND av.balance <> 0 THEN av.rate_date END AS balance_fx_rate_date
  FROM account_values av
  CROSS JOIN period p
  CROSS JOIN base
  WHERE av.is_active
    OR av.balance <> 0
  ORDER BY av.account_type, av.name;
$$;

CREATE OR REPLACE FUNCTION public.net_worth_evolution_year(
  p_year integer,
  p_base_currency text DEFAULT NULL
)
RETURNS TABLE (
  month integer,
  close_date date,
  assets numeric,
  liabilities numeric,
  net_worth numeric,
  fx_missing boolean,
  cash_fx_missing boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT public.resolve_base_currency(p_base_currency) AS code
  ),
  months_in_year AS (
    SELECT
      m.id,
      m.month,
      least((make_date(p_year, m.month, 1) + interval '1 month')::date - 1, public.app_today()) AS close_date
    FROM public.months m
    WHERE m.user_id = auth.uid()
      AND m.year = p_year
  ),
  rates AS (
    SELECT miy.month, cu.currency, fx.rate
    FROM months_in_year miy
    CROSS JOIN public.user_valued_currencies() AS cu(currency)
    CROSS JOIN base
    LEFT JOIN LATERAL public.fx_rate_asof(miy.close_date, cu.currency, base.code, public.fx_max_age_days(cu.currency, base.code)) fx ON true
  ),
  openings AS (
    SELECT
      ob.month_id,
      ob.account_id,
      sum(ob.opening_amount)::numeric AS amount,
      sum(ob.opening_base_amount)::numeric AS base_amount
    FROM public.opening_balances ob
    JOIN months_in_year miy ON miy.id = ob.month_id
    GROUP BY ob.month_id, ob.account_id
  ),
  movements AS (
    SELECT
      t.month_id,
      ta.account_id,
      sum(ta.amount)::numeric AS amount,
      sum(ta.base_amount)::numeric AS base_amount
    FROM public.transactions t
    JOIN public.transaction_amounts ta ON ta.transaction_id = t.id
    JOIN months_in_year miy ON miy.id = t.month_id
    WHERE t.user_id = auth.uid()
      AND t.deleted_at IS NULL
    GROUP BY t.month_id, ta.account_id
  ),
  -- Every account, active or not: one without a balance adds nothing.
  balances AS (
    SELECT
      miy.month,
      a.currency,
      coalesce(o.amount, 0) + coalesce(mv.amount, 0) AS balance,
      coalesce(o.base_amount, 0) + coalesce(mv.base_amount, 0) AS book_base
    FROM months_in_year miy
    CROSS JOIN public.accounts a
    LEFT JOIN openings o ON o.month_id = miy.id AND o.account_id = a.id
    LEFT JOIN movements mv ON mv.month_id = miy.id AND mv.account_id = a.id
    WHERE a.user_id = auth.uid()
  ),
  cash_assets AS (
    SELECT
      b.month,
      sum(
        CASE
          WHEN b.balance = 0 THEN 0
          WHEN r.rate IS NULL THEN b.book_base
          ELSE b.balance * r.rate
        END
      )::numeric AS assets,
      bool_or(b.balance <> 0 AND r.rate IS NULL) AS fx_missing
    FROM balances b
    LEFT JOIN rates r ON r.month = b.month AND r.currency = b.currency
    GROUP BY b.month
  ),
  liability_amounts AS (
    SELECT
      miy.month,
      li.currency,
      (
        SELECT ns.amount
        FROM public.nw_snapshots ns
        WHERE ns.nw_item_id = li.id
          AND (ns.year < p_year OR (ns.year = p_year AND ns.month <= miy.month))
        ORDER BY ns.year DESC, ns.month DESC
        LIMIT 1
      ) AS amount
    FROM months_in_year miy
    CROSS JOIN public.nw_items li
    WHERE li.user_id = auth.uid()
      AND li.side = 'liability'
  ),
  liability_totals AS (
    SELECT
      la.month,
      sum(CASE WHEN coalesce(la.amount, 0) = 0 THEN 0 ELSE la.amount * r.rate END)::numeric AS liabilities,
      bool_or(coalesce(la.amount, 0) <> 0 AND r.rate IS NULL) AS fx_missing
    FROM liability_amounts la
    LEFT JOIN rates r ON r.month = la.month AND r.currency = la.currency
    GROUP BY la.month
  )
  SELECT
    miy.month,
    miy.close_date,
    coalesce(ca.assets, 0)::numeric AS assets,
    coalesce(lt.liabilities, 0)::numeric AS liabilities,
    (coalesce(ca.assets, 0) - coalesce(lt.liabilities, 0))::numeric AS net_worth,
    coalesce(lt.fx_missing, false) AS fx_missing,
    coalesce(ca.fx_missing, false) AS cash_fx_missing
  FROM months_in_year miy
  LEFT JOIN cash_assets ca ON ca.month = miy.month
  LEFT JOIN liability_totals lt ON lt.month = miy.month
  ORDER BY miy.month;
$$;

CREATE OR REPLACE FUNCTION public.save_ledger_transaction(p_header jsonb, p_legs jsonb, p_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_existing public.transactions;
  v_type public.transaction_type;
  v_date date;
  v_description text := btrim(coalesce(p_header->>'description', ''));
  v_category_id uuid;
  v_fee numeric;
  v_month_id uuid;
  v_rebuild_from uuid;
  v_transaction public.transactions;
  v_leg jsonb;
  v_amount numeric;
  v_base numeric;
  v_rate numeric;
  v_source jsonb;
  v_destination jsonb;
  v_source_currency text;
  v_destination_currency text;
  v_decimals integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.transactions t
    WHERE t.id = p_id AND t.user_id = v_user AND t.deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transacción no encontrada';
    END IF;
  END IF;

  BEGIN
    v_type := coalesce((p_header->>'transaction_type')::public.transaction_type, v_existing.transaction_type);
    v_date := (p_header->>'date')::date;
    v_category_id := nullif(p_header->>'category_id', '')::uuid;
    v_fee := coalesce(nullif(p_header->>'fee', '')::numeric, 0);
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Datos de la transacción inválidos';
  END;
  IF v_type IS NULL OR v_date IS NULL THEN
    RAISE EXCEPTION 'Datos de la transacción inválidos';
  END IF;
  IF p_id IS NOT NULL AND v_type <> v_existing.transaction_type THEN
    RAISE EXCEPTION 'No se puede cambiar el tipo de transacción';
  END IF;
  IF v_description = '' THEN
    RAISE EXCEPTION 'La descripción es obligatoria';
  END IF;
  IF jsonb_typeof(p_legs) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Montos inválidos';
  END IF;

  FOR v_leg IN SELECT value FROM jsonb_array_elements(p_legs) LOOP
    v_amount := (v_leg->>'amount')::numeric;
    v_base := (v_leg->>'base_amount')::numeric;
    v_rate := coalesce((v_leg->>'exchange_rate')::numeric, 1);
    IF v_amount IS NULL OR v_amount = 0 OR v_base IS NULL OR v_base = 0 THEN
      RAISE EXCEPTION 'El monto no puede ser 0';
    END IF;
    IF sign(v_amount) <> sign(v_base) THEN
      RAISE EXCEPTION 'El monto base debe tener el mismo signo que el monto';
    END IF;
    IF v_rate <= 0 THEN
      RAISE EXCEPTION 'El tipo de cambio debe ser mayor a 0';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = (v_leg->>'account_id')::uuid AND a.user_id = v_user
    ) THEN
      RAISE EXCEPTION 'Cuenta no encontrada';
    END IF;
  END LOOP;

  IF v_type IN ('income', 'expense', 'correction', 'investment') THEN
    IF jsonb_array_length(p_legs) <> 1 THEN
      RAISE EXCEPTION 'Solo se permite una línea para ingreso, gasto, corrección o inversión';
    END IF;
    v_amount := (p_legs->0->>'amount')::numeric;
    IF v_type = 'income' AND v_amount < 0 THEN
      RAISE EXCEPTION 'Un ingreso tiene que ser positivo';
    END IF;
    IF v_type = 'expense' AND v_amount > 0 THEN
      RAISE EXCEPTION 'Un gasto tiene que ser negativo';
    END IF;
    IF v_type IN ('income', 'expense') AND v_category_id IS NULL THEN
      RAISE EXCEPTION 'La categoría es obligatoria';
    END IF;
    IF v_category_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.budget_categories c
      WHERE c.id = v_category_id AND c.user_id = v_user
    ) THEN
      RAISE EXCEPTION 'Categoría no encontrada';
    END IF;
    IF v_fee <> 0 THEN
      RAISE EXCEPTION 'Solo una transferencia tiene comisión';
    END IF;
  ELSIF v_type = 'transfer' THEN
    IF jsonb_array_length(p_legs) <> 2 THEN
      RAISE EXCEPTION 'Una transferencia tiene exactamente dos líneas';
    END IF;
    SELECT value INTO v_source FROM jsonb_array_elements(p_legs) WHERE (value->>'amount')::numeric < 0 LIMIT 1;
    SELECT value INTO v_destination FROM jsonb_array_elements(p_legs) WHERE (value->>'amount')::numeric > 0 LIMIT 1;
    IF v_source IS NULL OR v_destination IS NULL THEN
      RAISE EXCEPTION 'Una transferencia sale de una cuenta y entra en otra';
    END IF;
    IF v_source->>'account_id' = v_destination->>'account_id' THEN
      RAISE EXCEPTION 'La cuenta origen y destino deben ser diferentes';
    END IF;
    IF v_fee < 0 OR v_fee >= abs((v_source->>'amount')::numeric) THEN
      RAISE EXCEPTION 'Comisión inválida';
    END IF;
    v_category_id := NULL;

    SELECT a.currency INTO v_source_currency FROM public.accounts a WHERE a.id = (v_source->>'account_id')::uuid;
    SELECT a.currency INTO v_destination_currency FROM public.accounts a WHERE a.id = (v_destination->>'account_id')::uuid;
    IF v_source_currency = v_destination_currency THEN
      SELECT c.decimals INTO v_decimals FROM public.currencies c WHERE c.code = v_source_currency;
      IF round(abs((v_source->>'amount')::numeric) - v_fee, coalesce(v_decimals, 2))
         <> round((v_destination->>'amount')::numeric, coalesce(v_decimals, 2)) THEN
        RAISE EXCEPTION 'En la misma moneda, la cuenta destino recibe exactamente el monto transferido';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de transacción no admitido';
  END IF;

  -- The month of the date, created if missing.
  INSERT INTO public.months (user_id, year, month)
  VALUES (v_user, extract(year FROM v_date)::integer, extract(month FROM v_date)::integer)
  ON CONFLICT (user_id, year, month) DO NOTHING;
  SELECT m.id INTO v_month_id
  FROM public.months m
  WHERE m.user_id = v_user
    AND m.year = extract(year FROM v_date)::integer
    AND m.month = extract(month FROM v_date)::integer;

  IF p_id IS NULL THEN
    INSERT INTO public.transactions (user_id, month_id, category_id, transaction_type, date, description, notes, fee)
    VALUES (
      v_user, v_month_id, v_category_id, v_type, v_date, v_description,
      nullif(btrim(coalesce(p_header->>'notes', '')), ''), v_fee
    )
    RETURNING * INTO v_transaction;
    v_rebuild_from := v_month_id;
  ELSE
    UPDATE public.transactions t
    SET month_id = v_month_id,
        category_id = v_category_id,
        date = v_date,
        description = v_description,
        notes = nullif(btrim(coalesce(p_header->>'notes', '')), ''),
        fee = v_fee,
        updated_at = now()
    WHERE t.id = p_id
    RETURNING * INTO v_transaction;
    DELETE FROM public.transaction_amounts ta WHERE ta.transaction_id = p_id;

    -- The earlier of the old and the new month: both chains change.
    SELECT m.id INTO v_rebuild_from
    FROM public.months m
    WHERE m.id IN (v_existing.month_id, v_month_id)
    ORDER BY m.year, m.month
    LIMIT 1;
  END IF;

  INSERT INTO public.transaction_amounts (transaction_id, account_id, amount, original_currency, exchange_rate, base_amount)
  SELECT
    v_transaction.id,
    a.id,
    (leg.value->>'amount')::numeric,
    a.currency,
    coalesce((leg.value->>'exchange_rate')::numeric, 1),
    (leg.value->>'base_amount')::numeric
  FROM jsonb_array_elements(p_legs) AS leg
  JOIN public.accounts a ON a.id = (leg.value->>'account_id')::uuid;

  PERFORM public.rebuild_opening_balances(v_rebuild_from);

  RETURN v_transaction.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ledger_transaction_deleted(p_id uuid, p_deleted boolean)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_transaction public.transactions;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_transaction
  FROM public.transactions t
  WHERE t.id = p_id
    AND t.user_id = v_user
    AND (t.deleted_at IS NULL) = p_deleted
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transacción no encontrada';
  END IF;

  IF p_deleted THEN
    IF EXISTS (SELECT 1 FROM public.debt_activities d WHERE d.transaction_id = p_id) THEN
      RAISE EXCEPTION 'Esta transacción es un pago de deuda. Gestionalo desde la página de Deudas para mantener el saldo consistente.';
    END IF;
  END IF;

  UPDATE public.transactions t
  SET deleted_at = CASE WHEN p_deleted THEN now() ELSE NULL END
  WHERE t.id = p_id;

  IF v_transaction.month_id IS NOT NULL THEN
    PERFORM public.rebuild_opening_balances(v_transaction.month_id);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.account_net_worth_year(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_net_worth_year(integer, text) TO authenticated, service_role;

DROP FUNCTION public.pay_with_investment(jsonb, numeric, jsonb, jsonb);
DROP FUNCTION public.create_investment(jsonb, numeric);
DROP FUNCTION public.update_investment(uuid, jsonb, numeric);
DROP FUNCTION public.delete_investment(uuid);
DROP FUNCTION public.record_investment_sale(jsonb, numeric);
DROP FUNCTION public.delete_investment_sale(uuid);
DROP FUNCTION public.reduce_investment_lots(uuid, text, text, text, text, numeric);
DROP FUNCTION public.swap_investment_lots(jsonb);
DROP FUNCTION public.sync_investment_cash(uuid, uuid, numeric, numeric, boolean);
DROP FUNCTION public.transfer_investment_lots(uuid, uuid, text, text, text, text, numeric, numeric, date, text);
DROP FUNCTION public.transfer_investment_position(jsonb, numeric, numeric);

-- destructive-ok: the links point at lots and sales that are dropped below; the movements stay.
ALTER TABLE public.transactions DROP COLUMN source_investment_id;
-- destructive-ok: same as source_investment_id.
ALTER TABLE public.transactions DROP COLUMN source_investment_sale_id;

-- destructive-ok: investments are no longer tracked; rows exported before the drop.
DROP TABLE public.investment_sales;
-- destructive-ok: investments are no longer tracked; rows exported before the drop.
DROP TABLE public.investments;
-- destructive-ok: prices only valued the dropped positions.
DROP TABLE public.instrument_prices;
