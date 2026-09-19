-- Swap one asset for another inside an account (USDT for BTC in an exchange)
-- without moving the account's cash. Until now a swap had to be recorded as a
-- sale and a purchase, each moving the full amount through the account's fiat
-- cash, which never held it.
--
-- swap_investment_lots(p_swap) sells the asset given at the swap's market
-- value, realizing its gain or loss, and buys the asset received at that same
-- value, all in one database transaction. Returns the new lot's id. p_swap:
--   account_id, date, value (market value of the swap, in the assets' currency),
--   given: {asset_name, ticker, isin, asset_type, currency, quantity},
--   received: {asset_name, ticker, isin, asset_type, currency, quantity},
--   fee_quantity (optional) and fee_asset ('given' or 'received'), notes.
-- A fee in the asset given leaves with it and is part of the sale's cost
-- basis; a fee in the asset received is not received. Both assets are in the
-- same currency.
--
-- investment_sales.swap_lot_id links a swap's sale to the lot it bought. It is
-- not a foreign key: the lot can later be sold or deleted, and the sale is
-- still a swap. delete_investment_sale undoes a swap whole, deleting the lot
-- bought, and refuses once that lot was sold, moved or its cost edited.
-- delete_investment refuses a lot bought by a swap that can still be undone.
--
-- Rollback:
--   DROP FUNCTION public.swap_investment_lots(jsonb);
--   re-run the CREATE OR REPLACE of delete_investment_sale from 0047 and of
--   delete_investment from 0050;
--   ALTER TABLE public.investment_sales DROP COLUMN swap_lot_id;

ALTER TABLE public.investment_sales ADD COLUMN swap_lot_id uuid;

CREATE OR REPLACE FUNCTION public.swap_investment_lots(p_swap jsonb)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_given jsonb := p_swap->'given';
  v_received jsonb := p_swap->'received';
  v_account_id uuid;
  v_date date;
  v_value numeric;
  v_given_quantity numeric;
  v_received_quantity numeric;
  v_fee numeric;
  v_fee_asset text := coalesce(p_swap->>'fee_asset', 'given');
  v_currency text := v_given->>'currency';
  v_disposed numeric;
  v_kept numeric;
  v_cost_basis numeric;
  v_lot_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_account_id := (p_swap->>'account_id')::uuid;
    v_date := (p_swap->>'date')::date;
    v_value := (p_swap->>'value')::numeric;
    v_given_quantity := (v_given->>'quantity')::numeric;
    v_received_quantity := (v_received->>'quantity')::numeric;
    v_fee := coalesce((p_swap->>'fee_quantity')::numeric, 0);
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Datos del intercambio inválidos';
  END;

  IF v_account_id IS NULL OR v_date IS NULL OR v_given IS NULL OR v_received IS NULL THEN
    RAISE EXCEPTION 'Datos del intercambio inválidos';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = v_account_id AND a.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'Cuenta no encontrada';
  END IF;
  IF v_value IS NULL OR v_value <= 0 THEN
    RAISE EXCEPTION 'El valor del intercambio debe ser mayor a 0';
  END IF;
  IF v_given_quantity IS NULL OR v_given_quantity <= 0
     OR v_received_quantity IS NULL OR v_received_quantity <= 0 THEN
    RAISE EXCEPTION 'Las cantidades deben ser mayores a 0';
  END IF;
  IF v_fee < 0 OR v_fee_asset NOT IN ('given', 'received')
     OR (v_fee_asset = 'received' AND v_fee >= v_received_quantity) THEN
    RAISE EXCEPTION 'Comisión inválida';
  END IF;
  IF v_currency IS NULL OR v_currency IS DISTINCT FROM v_received->>'currency' THEN
    RAISE EXCEPTION 'Los dos activos tienen que estar en la misma moneda';
  END IF;
  IF v_given->>'asset_type' = v_received->>'asset_type'
     AND coalesce(nullif(btrim(v_given->>'ticker'), ''), btrim(v_given->>'asset_name'))
       = coalesce(nullif(btrim(v_received->>'ticker'), ''), btrim(v_received->>'asset_name')) THEN
    RAISE EXCEPTION 'Elegí un activo distinto para recibir';
  END IF;

  v_disposed := v_given_quantity + CASE WHEN v_fee_asset = 'given' THEN v_fee ELSE 0 END;
  v_kept := v_received_quantity - CASE WHEN v_fee_asset = 'received' THEN v_fee ELSE 0 END;

  -- Locks the holding and checks there is enough of it.
  v_cost_basis := public.reduce_investment_lots(
    v_account_id,
    v_given->>'asset_name',
    coalesce(v_given->>'ticker', ''),
    v_given->>'asset_type',
    v_currency,
    v_disposed
  );

  INSERT INTO public.investments (
    user_id, account_id, asset_name, ticker, isin, asset_type, quantity,
    price_per_unit, total_cost, currency, purchase_date, notes
  )
  VALUES (
    v_user,
    v_account_id,
    v_received->>'asset_name',
    v_received->>'ticker',
    v_received->>'isin',
    v_received->>'asset_type',
    v_kept,
    v_value / v_kept,
    v_value,
    v_currency,
    v_date,
    coalesce(nullif(btrim(p_swap->>'notes'), ''), 'Intercambio de ' || (v_given->>'asset_name'))
  )
  RETURNING id INTO v_lot_id;

  INSERT INTO public.investment_sales (
    user_id, account_id, asset_name, ticker, isin, asset_type, quantity_sold,
    price_per_unit, total_proceeds, fees, tax, cost_basis, realized_pnl,
    currency, sale_date, notes, swap_lot_id
  )
  VALUES (
    v_user,
    v_account_id,
    v_given->>'asset_name',
    v_given->>'ticker',
    v_given->>'isin',
    v_given->>'asset_type',
    v_disposed,
    v_value / v_disposed,
    v_value,
    0,
    0,
    v_cost_basis,
    v_value - v_cost_basis,
    v_currency,
    v_date,
    coalesce(nullif(btrim(p_swap->>'notes'), ''), 'Intercambio por ' || (v_received->>'asset_name')),
    v_lot_id
  );

  RETURN v_lot_id;
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

  -- A swap's lot still holds everything the swap bought only while its cost
  -- is the swap's value and it is in the same account.
  IF v_sale.swap_lot_id IS NOT NULL THEN
    DELETE FROM public.investments i
    WHERE i.id = v_sale.swap_lot_id
      AND i.user_id = v_user
      AND i.account_id = v_sale.account_id
      AND i.total_cost = v_sale.total_proceeds;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lo que recibiste en este intercambio ya se vendió, transfirió o editó: el intercambio no se puede deshacer.';
    END IF;
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

  IF EXISTS (
    SELECT 1 FROM public.investment_sales s
    WHERE s.user_id = v_user
      AND s.swap_lot_id = p_id
      AND s.account_id = v_lot.account_id
      AND s.total_proceeds = v_lot.total_cost
  ) THEN
    RAISE EXCEPTION 'Este activo viene de un intercambio. Para deshacerlo, eliminá el intercambio en el historial de ventas.';
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

REVOKE EXECUTE ON FUNCTION public.swap_investment_lots(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_investment_lots(jsonb) TO authenticated, service_role;
