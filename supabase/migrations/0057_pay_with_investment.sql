-- pay_with_investment(p_sale, p_cash_rate, p_header, p_legs): una compra pagada
-- con una tenencia, como la tarjeta de un exchange que debita stablecoins.
-- Encadena la venta del lote (record_investment_sale, que acredita el neto en
-- la caja de la cuenta) y el gasto que consume ese neto
-- (save_ledger_transaction) dentro de una sola transacción: si el gasto falla,
-- la venta tampoco queda hecha.
--
-- Cada función encadenada valida su propio dueño, sus montos y sus
-- invariantes; acá no se repite ninguna validación para que no se separen de
-- las suyas con el tiempo.
--
-- Rollback:
--   DROP FUNCTION public.pay_with_investment(jsonb, numeric, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.pay_with_investment(
  p_sale jsonb,
  p_cash_rate numeric DEFAULT NULL,
  p_header jsonb DEFAULT NULL,
  p_legs jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale_id uuid;
  v_transaction_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  v_sale_id := public.record_investment_sale(p_sale, p_cash_rate);
  v_transaction_id := public.save_ledger_transaction(p_header, p_legs);

  RETURN jsonb_build_object('sale_id', v_sale_id, 'transaction_id', v_transaction_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pay_with_investment(jsonb, numeric, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_with_investment(jsonb, numeric, jsonb, jsonb) TO authenticated, service_role;
