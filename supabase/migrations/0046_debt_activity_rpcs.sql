-- Debt payments, interest and adjustments in one database transaction each,
-- and a way to reverse any of them.
--
-- A debt's balance lives in nw_snapshots: one row per month, carried forward to
-- later months without a row. An activity dated in month M changes the balance
-- from M on: M gets a row (the carried balance if it had none) and every row
-- from M on gets the change. A payment never takes a row below 0. Each
-- activity stores the change it applied to each row in snapshot_changes, so
-- reversing it undoes exactly that.
--
-- record_debt_payment(p_nw_item_id, p_header, p_leg, p_debt_amount, p_debt_rate):
--   the expense (save_ledger_transaction, 0045), the activity and the rows.
--   p_debt_amount is the payment in the debt's currency and p_debt_rate
--   converts the debt's currency to the base currency on the payment date; the
--   app still looks up the rates.
-- record_debt_adjustment(p_nw_item_id, p_activity_type, p_date, p_amount,
--   p_debt_rate, p_amount_base, p_description): interest or an adjustment,
--   which raise the balance of M and of every later row.
-- reverse_debt_activity(p_activity_id): undoes the stored changes, deletes the
--   activity and soft-deletes a payment's expense. Activities recorded before
--   this migration have no stored changes: a payment is undone by its amount
--   from its month on when it was paid from an account in the debt's currency
--   (and refused otherwise), and interest or an adjustment by its amount in
--   its own month, the only row it changed.
--
-- Rollback:
--   DROP FUNCTION public.reverse_debt_activity(uuid);
--   DROP FUNCTION public.record_debt_adjustment(uuid, public.debt_activity_type, date, numeric, numeric, numeric, text);
--   DROP FUNCTION public.record_debt_payment(uuid, jsonb, jsonb, numeric, numeric);
--   DROP FUNCTION public.apply_debt_balance_change(uuid, date, numeric, numeric);
--   ALTER TABLE public.debt_activities DROP COLUMN snapshot_changes;

ALTER TABLE public.debt_activities
  ADD COLUMN IF NOT EXISTS snapshot_changes jsonb;

-- Adds p_delta to the debt's balance from p_date's month on and returns the
-- change applied to each row: [{year, month, amount, amount_base}].
-- p_rate converts the debt's currency to the base currency.
CREATE OR REPLACE FUNCTION public.apply_debt_balance_change(
  p_nw_item_id uuid,
  p_date date,
  p_delta numeric,
  p_rate numeric
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_year integer := extract(year FROM p_date)::integer;
  v_month integer := extract(month FROM p_date)::integer;
  v_carried public.nw_snapshots;
  v_row public.nw_snapshots;
  v_amount numeric;
  v_base numeric;
  v_changes jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_carried
  FROM public.nw_snapshots s
  WHERE s.nw_item_id = p_nw_item_id
    AND (s.year, s.month) <= (v_year, v_month)
  ORDER BY s.year DESC, s.month DESC
  LIMIT 1;

  INSERT INTO public.nw_snapshots (nw_item_id, year, month, amount, amount_base)
  VALUES (p_nw_item_id, v_year, v_month, coalesce(v_carried.amount, 0), v_carried.amount_base)
  ON CONFLICT (nw_item_id, year, month) DO NOTHING;

  FOR v_row IN
    SELECT *
    FROM public.nw_snapshots s
    WHERE s.nw_item_id = p_nw_item_id
      AND (s.year, s.month) >= (v_year, v_month)
    ORDER BY s.year, s.month
    FOR UPDATE
  LOOP
    v_amount := greatest(0, round(v_row.amount + p_delta, 4));
    -- The activity's month is converted at the activity date; later rows keep
    -- their own rate.
    v_base := CASE
      WHEN (v_row.year, v_row.month) = (v_year, v_month) THEN round(v_amount * p_rate, 4)
      WHEN v_row.amount_base IS NULL THEN NULL
      WHEN v_row.amount > 0 THEN round(v_row.amount_base * v_amount / v_row.amount, 4)
      ELSE round(v_amount * p_rate, 4)
    END;

    UPDATE public.nw_snapshots s
    SET amount = v_amount, amount_base = v_base
    WHERE s.id = v_row.id;

    v_changes := v_changes || jsonb_build_object(
      'year', v_row.year,
      'month', v_row.month,
      'amount', v_amount - v_row.amount,
      'amount_base', v_base - v_row.amount_base
    );
  END LOOP;

  RETURN v_changes;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_debt_payment(
  p_nw_item_id uuid,
  p_header jsonb,
  p_leg jsonb,
  p_debt_amount numeric,
  p_debt_rate numeric
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_transaction_id uuid;
  v_date date;
  v_activity_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  -- One activity at a time per debt: each one reads the rows the last wrote.
  PERFORM 1
  FROM public.nw_items i
  WHERE i.id = p_nw_item_id AND i.user_id = v_user AND i.side = 'liability'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deuda no encontrada';
  END IF;

  IF p_header->>'transaction_type' IS DISTINCT FROM 'expense' THEN
    RAISE EXCEPTION 'Un pago de deuda es un gasto';
  END IF;
  IF p_debt_amount IS NULL OR p_debt_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;
  IF p_debt_rate IS NULL OR p_debt_rate <= 0 THEN
    RAISE EXCEPTION 'El tipo de cambio debe ser mayor a 0';
  END IF;

  v_transaction_id := public.save_ledger_transaction(p_header, jsonb_build_array(p_leg));
  SELECT t.date INTO v_date FROM public.transactions t WHERE t.id = v_transaction_id;

  INSERT INTO public.debt_activities (
    nw_item_id, transaction_id, activity_type, date, amount, amount_base, description, snapshot_changes
  )
  VALUES (
    p_nw_item_id,
    v_transaction_id,
    'payment',
    v_date,
    abs((p_leg->>'amount')::numeric),
    abs((p_leg->>'base_amount')::numeric),
    btrim(p_header->>'description'),
    public.apply_debt_balance_change(p_nw_item_id, v_date, -p_debt_amount, p_debt_rate)
  )
  RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_debt_adjustment(
  p_nw_item_id uuid,
  p_activity_type public.debt_activity_type,
  p_date date,
  p_amount numeric,
  p_debt_rate numeric,
  p_amount_base numeric DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_activity_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.nw_items i
  WHERE i.id = p_nw_item_id AND i.user_id = v_user AND i.side = 'liability'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deuda no encontrada';
  END IF;

  IF p_activity_type IS NULL OR p_activity_type = 'payment' THEN
    RAISE EXCEPTION 'Tipo de actividad no válido';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Fecha inválida';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;
  IF p_debt_rate IS NULL OR p_debt_rate <= 0 THEN
    RAISE EXCEPTION 'El tipo de cambio debe ser mayor a 0';
  END IF;

  INSERT INTO public.debt_activities (
    nw_item_id, transaction_id, activity_type, date, amount, amount_base, description, snapshot_changes
  )
  VALUES (
    p_nw_item_id,
    NULL,
    p_activity_type,
    p_date,
    p_amount,
    coalesce(p_amount_base, round(p_amount * p_debt_rate, 4)),
    nullif(btrim(coalesce(p_description, '')), ''),
    public.apply_debt_balance_change(p_nw_item_id, p_date, p_amount, p_debt_rate)
  )
  RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
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
  v_change jsonb;
  v_row public.nw_snapshots;
  v_amount numeric;
  v_account_currency text;
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

  IF v_activity.snapshot_changes IS NOT NULL THEN
    FOR v_change IN SELECT value FROM jsonb_array_elements(v_activity.snapshot_changes) LOOP
      SELECT * INTO v_row
      FROM public.nw_snapshots s
      WHERE s.nw_item_id = v_activity.nw_item_id
        AND s.year = (v_change->>'year')::integer
        AND s.month = (v_change->>'month')::integer
      FOR UPDATE;
      CONTINUE WHEN NOT FOUND;

      v_amount := greatest(0, v_row.amount - (v_change->>'amount')::numeric);
      UPDATE public.nw_snapshots s
      SET amount = v_amount,
          amount_base = CASE
            WHEN v_row.amount_base IS NULL THEN NULL
            WHEN v_amount = 0 THEN 0
            WHEN v_change->>'amount_base' IS NULL THEN v_row.amount_base
            ELSE v_row.amount_base - (v_change->>'amount_base')::numeric
          END
      WHERE s.id = v_row.id;
    END LOOP;
  ELSIF v_activity.activity_type = 'payment' THEN
    SELECT a.currency INTO v_account_currency
    FROM public.transaction_amounts ta
    JOIN public.accounts a ON a.id = ta.account_id
    WHERE ta.transaction_id = v_activity.transaction_id
    LIMIT 1;
    IF v_account_currency IS DISTINCT FROM v_debt_currency THEN
      RAISE EXCEPTION 'Este pago se hizo desde una cuenta en otra moneda antes de que los pagos se pudieran revertir. Corregí el saldo de la deuda a mano.';
    END IF;

    UPDATE public.nw_snapshots s
    SET amount = round(s.amount + v_activity.amount, 4),
        amount_base = CASE
          WHEN s.amount_base IS NULL THEN NULL
          WHEN s.amount > 0 THEN round(s.amount_base * (s.amount + v_activity.amount) / s.amount, 4)
          ELSE s.amount_base + coalesce(v_activity.amount_base, 0)
        END
    WHERE s.nw_item_id = v_activity.nw_item_id
      AND (s.year, s.month) >= (extract(year FROM v_activity.date)::integer, extract(month FROM v_activity.date)::integer);
  ELSE
    UPDATE public.nw_snapshots s
    SET amount = greatest(0, round(s.amount - v_activity.amount, 4)),
        amount_base = CASE
          WHEN s.amount_base IS NULL OR s.amount <= 0 THEN s.amount_base
          ELSE round(s.amount_base * greatest(0, s.amount - v_activity.amount) / s.amount, 4)
        END
    WHERE s.nw_item_id = v_activity.nw_item_id
      AND s.year = extract(year FROM v_activity.date)::integer
      AND s.month = extract(month FROM v_activity.date)::integer;
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.apply_debt_balance_change(uuid, date, numeric, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_debt_payment(uuid, jsonb, jsonb, numeric, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_debt_adjustment(uuid, public.debt_activity_type, date, numeric, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reverse_debt_activity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_debt_balance_change(uuid, date, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_debt_payment(uuid, jsonb, jsonb, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_debt_adjustment(uuid, public.debt_activity_type, date, numeric, numeric, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_debt_activity(uuid) TO authenticated, service_role;
