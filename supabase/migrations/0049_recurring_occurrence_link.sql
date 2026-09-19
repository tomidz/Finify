-- A transaction registered from a recurring template remembers which
-- occurrence it is, and an occurrence can only be registered once.
--
-- transactions.recurring_id and occurrence_date link the transaction to its
-- template and expected date; a partial unique index keeps one live
-- transaction per occurrence.
--
-- register_recurring_occurrence(p_recurring_id, p_occurrence_date, p_leg):
--   creates the transaction from the template (save_ledger_transaction, 0045)
--   with the leg the app converted, and links it. Registering an occurrence
--   that already has a live transaction returns that transaction instead. The
--   template's currency must be its account's.
--
-- Rollback:
--   DROP FUNCTION public.register_recurring_occurrence(uuid, date, jsonb);
--   DROP INDEX public.transactions_recurring_occurrence_key;
--   ALTER TABLE public.transactions DROP COLUMN occurrence_date;
--   ALTER TABLE public.transactions DROP COLUMN recurring_id;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS recurring_id uuid REFERENCES public.recurring_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS occurrence_date date;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_recurring_occurrence_key
  ON public.transactions (recurring_id, occurrence_date)
  WHERE deleted_at IS NULL AND recurring_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.register_recurring_occurrence(
  p_recurring_id uuid,
  p_occurrence_date date,
  p_leg jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_recurring public.recurring_transactions;
  v_account_currency text;
  v_transaction_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF p_occurrence_date IS NULL THEN
    RAISE EXCEPTION 'Fecha inválida';
  END IF;

  -- Two registrations of the same template run one after the other.
  SELECT * INTO v_recurring
  FROM public.recurring_transactions r
  WHERE r.id = p_recurring_id AND r.user_id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurrente no encontrada';
  END IF;

  SELECT t.id INTO v_transaction_id
  FROM public.transactions t
  WHERE t.recurring_id = p_recurring_id
    AND t.occurrence_date = p_occurrence_date
    AND t.deleted_at IS NULL;
  IF FOUND THEN
    RETURN v_transaction_id;
  END IF;

  IF (p_leg->>'account_id')::uuid IS DISTINCT FROM v_recurring.account_id THEN
    RAISE EXCEPTION 'La cuenta no es la de la recurrente';
  END IF;
  SELECT a.currency INTO v_account_currency
  FROM public.accounts a
  WHERE a.id = v_recurring.account_id;
  IF v_account_currency IS DISTINCT FROM v_recurring.currency THEN
    RAISE EXCEPTION 'La recurrente está en % y su cuenta en %: corregí la recurrente.', v_recurring.currency, v_account_currency;
  END IF;

  v_transaction_id := public.save_ledger_transaction(
    jsonb_build_object(
      'transaction_type', v_recurring.type,
      'date', p_occurrence_date,
      'description', v_recurring.description,
      'category_id', v_recurring.category_id,
      'notes', v_recurring.notes
    ),
    jsonb_build_array(p_leg)
  );

  UPDATE public.transactions t
  SET recurring_id = p_recurring_id,
      occurrence_date = p_occurrence_date
  WHERE t.id = v_transaction_id;

  RETURN v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_recurring_occurrence(uuid, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_recurring_occurrence(uuid, date, jsonb) TO authenticated, service_role;
