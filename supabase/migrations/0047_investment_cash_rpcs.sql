-- Investment lots, sales and position transfers written together with the cash
-- they move, in one database transaction each, with the opening balances
-- rebuilt from the earliest affected month.
--
-- sync_investment_cash(p_investment_id, p_sale_id, p_rate): replaces the cash
--   transaction linked to a purchase (debits its total cost) or to a sale
--   (credits its proceeds net of fees and tax). With p_rate null it only
--   removes it. p_rate converts the account's currency to the base currency on
--   the purchase or sale date; the app still looks it up. Cash only moves on an
--   investment account in the lot's currency.
-- create_investment(p_lot, p_cash_rate), update_investment(p_id, p_changes,
--   p_cash_rate), delete_investment(p_id): the lot and its cash. An edit that
--   changes what the cash depends on (cost, date, account, currency or name)
--   rewrites the cash the purchase already had.
-- record_investment_sale(p_sale, p_cash_rate): the sale, the lot reduction
--   (reduce_investment_lots, whose removed cost becomes the sale's cost basis)
--   and the credit.
-- delete_investment_sale(p_sale_id): the credit goes, a lot with the sale's
--   quantity and cost basis comes back, and the sale goes.
-- transfer_investment_position(p_move, p_fee_cash, p_fee_rate): the lot move
--   (transfer_investment_lots) and the cash fee charged to the source account.
--
-- Rollback:
--   DROP FUNCTION public.transfer_investment_position(jsonb, numeric, numeric);
--   DROP FUNCTION public.delete_investment_sale(uuid);
--   DROP FUNCTION public.record_investment_sale(jsonb, numeric);
--   DROP FUNCTION public.delete_investment(uuid);
--   DROP FUNCTION public.update_investment(uuid, jsonb, numeric);
--   DROP FUNCTION public.create_investment(jsonb, numeric);
--   DROP FUNCTION public.sync_investment_cash(uuid, uuid, numeric);

CREATE OR REPLACE FUNCTION public.sync_investment_cash(
  p_investment_id uuid,
  p_sale_id uuid,
  p_rate numeric
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
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF (p_investment_id IS NULL) = (p_sale_id IS NULL) THEN
    RAISE EXCEPTION 'Indicá una compra o una venta';
  END IF;

  IF p_investment_id IS NOT NULL THEN
    SELECT i.account_id, i.currency, i.purchase_date, 'Compra: ' || i.asset_name, -i.total_cost
    INTO v_account_id, v_currency, v_date, v_description, v_amount
    FROM public.investments i
    WHERE i.id = p_investment_id AND i.user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inversión no encontrada';
    END IF;
  ELSE
    SELECT s.account_id, s.currency, s.sale_date, 'Venta: ' || s.asset_name, s.total_proceeds - s.fees - s.tax
    INTO v_account_id, v_currency, v_date, v_description, v_amount
    FROM public.investment_sales s
    WHERE s.id = p_sale_id AND s.user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Venta no encontrada';
    END IF;
  END IF;

  WITH removed AS (
    DELETE FROM public.transactions t
    WHERE t.user_id = v_user
      AND (t.source_investment_id = p_investment_id OR t.source_investment_sale_id = p_sale_id)
    RETURNING t.month_id
  )
  SELECT array_agg(removed.month_id) INTO v_old_months FROM removed;

  -- A purchase debits and a sale credits; a zero-cost lot or a sale that nets
  -- nothing moves no cash.
  IF p_rate IS NOT NULL
     AND ((p_investment_id IS NOT NULL AND v_amount < 0) OR (p_sale_id IS NOT NULL AND v_amount > 0)) THEN
    IF p_rate <= 0 THEN
      RAISE EXCEPTION 'El tipo de cambio debe ser mayor a 0';
    END IF;

    SELECT * INTO v_account
    FROM public.accounts a
    WHERE a.id = v_account_id AND a.user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cuenta no encontrada';
    END IF;
    IF v_account.account_type NOT IN ('investment_broker', 'crypto_exchange', 'crypto_wallet') THEN
      RAISE EXCEPTION 'Solo una cuenta de inversión mueve caja al comprar o vender';
    END IF;
    IF v_account.currency <> v_currency THEN
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

CREATE OR REPLACE FUNCTION public.create_investment(p_lot jsonb, p_cash_rate numeric DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = (p_lot->>'account_id')::uuid AND a.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'Cuenta no encontrada';
  END IF;

  INSERT INTO public.investments (
    user_id, account_id, asset_name, ticker, isin, asset_type, quantity,
    price_per_unit, total_cost, currency, purchase_date, notes
  )
  VALUES (
    v_user,
    (p_lot->>'account_id')::uuid,
    p_lot->>'asset_name',
    p_lot->>'ticker',
    p_lot->>'isin',
    p_lot->>'asset_type',
    (p_lot->>'quantity')::numeric,
    (p_lot->>'price_per_unit')::numeric,
    (p_lot->>'total_cost')::numeric,
    p_lot->>'currency',
    (p_lot->>'purchase_date')::date,
    p_lot->>'notes'
  )
  RETURNING id INTO v_id;

  IF p_cash_rate IS NOT NULL THEN
    PERFORM public.sync_investment_cash(v_id, NULL, p_cash_rate);
  END IF;

  RETURN v_id;
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

  IF EXISTS (SELECT 1 FROM public.transactions t WHERE t.source_investment_id = p_id)
     AND (v_after.total_cost, v_after.purchase_date, v_after.account_id, v_after.currency, v_after.asset_name)
         IS DISTINCT FROM (v_before.total_cost, v_before.purchase_date, v_before.account_id, v_before.currency, v_before.asset_name) THEN
    IF p_cash_rate IS NULL THEN
      RAISE EXCEPTION 'Falta el tipo de cambio para actualizar la caja de esta compra';
    END IF;
    PERFORM public.sync_investment_cash(p_id, NULL, p_cash_rate);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_investment(p_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.investments i
  WHERE i.id = p_id AND i.user_id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inversión no encontrada';
  END IF;

  PERFORM public.sync_investment_cash(p_id, NULL, NULL);
  DELETE FROM public.investments i WHERE i.id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_investment_sale(p_sale jsonb, p_cash_rate numeric DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_sale public.investment_sales;
  v_cost_basis numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = (p_sale->>'account_id')::uuid AND a.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'Cuenta no encontrada';
  END IF;

  INSERT INTO public.investment_sales (
    user_id, account_id, asset_name, ticker, isin, asset_type, quantity_sold,
    price_per_unit, total_proceeds, fees, tax, cost_basis, realized_pnl,
    currency, sale_date, notes
  )
  VALUES (
    v_user,
    (p_sale->>'account_id')::uuid,
    p_sale->>'asset_name',
    p_sale->>'ticker',
    p_sale->>'isin',
    p_sale->>'asset_type',
    (p_sale->>'quantity_sold')::numeric,
    (p_sale->>'price_per_unit')::numeric,
    (p_sale->>'total_proceeds')::numeric,
    coalesce((p_sale->>'fees')::numeric, 0),
    coalesce((p_sale->>'tax')::numeric, 0),
    0,
    0,
    p_sale->>'currency',
    (p_sale->>'sale_date')::date,
    p_sale->>'notes'
  )
  RETURNING * INTO v_sale;

  -- The cost the reduction removes, under its lock, is the sale's cost basis.
  v_cost_basis := public.reduce_investment_lots(
    v_sale.account_id,
    v_sale.asset_name,
    coalesce(v_sale.ticker, ''),
    v_sale.asset_type,
    v_sale.currency,
    v_sale.quantity_sold
  );

  UPDATE public.investment_sales s
  SET cost_basis = v_cost_basis,
      realized_pnl = s.total_proceeds - s.fees - s.tax - v_cost_basis
  WHERE s.id = v_sale.id;

  IF p_cash_rate IS NOT NULL THEN
    PERFORM public.sync_investment_cash(NULL, v_sale.id, p_cash_rate);
  END IF;

  RETURN v_sale.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_investment_sale(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_sale public.investment_sales;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sale
  FROM public.investment_sales s
  WHERE s.id = p_sale_id AND s.user_id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada';
  END IF;

  PERFORM public.sync_investment_cash(NULL, p_sale_id, NULL);

  -- One lot with the sale's cost basis: the sold lots' own detail is gone.
  INSERT INTO public.investments (
    user_id, account_id, asset_name, ticker, isin, asset_type, quantity,
    price_per_unit, total_cost, currency, purchase_date, notes
  )
  VALUES (
    v_user,
    v_sale.account_id,
    v_sale.asset_name,
    v_sale.ticker,
    v_sale.isin,
    v_sale.asset_type,
    v_sale.quantity_sold,
    v_sale.cost_basis / v_sale.quantity_sold,
    v_sale.cost_basis,
    v_sale.currency,
    v_sale.sale_date,
    'Restaurado al revertir venta del ' || to_char(v_sale.sale_date, 'YYYY-MM-DD')
  );

  DELETE FROM public.investment_sales s WHERE s.id = p_sale_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_investment_position(
  p_move jsonb,
  p_fee_cash numeric DEFAULT 0,
  p_fee_rate numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_date date := (p_move->>'transfer_date')::date;
  v_source public.accounts;
  v_month_id uuid;
  v_transaction_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  PERFORM public.transfer_investment_lots(
    (p_move->>'source_account_id')::uuid,
    (p_move->>'destination_account_id')::uuid,
    p_move->>'asset_name',
    coalesce(p_move->>'ticker', ''),
    p_move->>'asset_type',
    p_move->>'currency',
    (p_move->>'quantity')::numeric,
    coalesce((p_move->>'fee_quantity')::numeric, 0),
    v_date,
    p_move->>'notes'
  );

  IF coalesce(p_fee_cash, 0) <= 0 THEN
    RETURN;
  END IF;
  IF p_fee_rate IS NULL OR p_fee_rate <= 0 THEN
    RAISE EXCEPTION 'El tipo de cambio debe ser mayor a 0';
  END IF;

  SELECT * INTO v_source
  FROM public.accounts a
  WHERE a.id = (p_move->>'source_account_id')::uuid AND a.user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta origen no encontrada';
  END IF;

  INSERT INTO public.months (user_id, year, month)
  VALUES (v_user, extract(year FROM v_date)::integer, extract(month FROM v_date)::integer)
  ON CONFLICT (user_id, year, month) DO NOTHING;
  SELECT m.id INTO v_month_id
  FROM public.months m
  WHERE m.user_id = v_user
    AND m.year = extract(year FROM v_date)::integer
    AND m.month = extract(month FROM v_date)::integer;

  INSERT INTO public.transactions (user_id, month_id, category_id, transaction_type, date, description)
  VALUES (v_user, v_month_id, NULL, 'investment', v_date, 'Comisión transferencia ' || (p_move->>'asset_name'))
  RETURNING id INTO v_transaction_id;

  INSERT INTO public.transaction_amounts (
    transaction_id, account_id, amount, original_currency, exchange_rate, base_amount
  )
  VALUES (v_transaction_id, v_source.id, -p_fee_cash, v_source.currency, p_fee_rate, round(-p_fee_cash * p_fee_rate, 8));

  PERFORM public.rebuild_opening_balances(v_month_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_investment_cash(uuid, uuid, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_investment(jsonb, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_investment(uuid, jsonb, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_investment(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_investment_sale(jsonb, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_investment_sale(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_investment_position(jsonb, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_investment_cash(uuid, uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_investment(jsonb, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_investment(uuid, jsonb, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_investment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_investment_sale(jsonb, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_investment_sale(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_investment_position(jsonb, numeric, numeric) TO authenticated, service_role;
