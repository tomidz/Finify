-- Final drift backfill. Two columns were applied to production directly
-- (outside the migration history) and were missing from fresh-install schemas.
-- Both ADDs are idempotent (IF NOT EXISTS), so this is a no-op in prod.

-- transaction_rules.updated_at: 0011 originally created this column but it
-- was apparently dropped in prod. Re-add it nullable with a default so
-- existing rows backfill cleanly.
ALTER TABLE public.transaction_rules
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- transactions.debt_id: links a transaction to a debt for the legacy debt
-- payment flow. Migration was committed empty in the past; column lives
-- only in prod. Recreate so fresh installs match.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS debt_id UUID
    REFERENCES public.debts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_debt_id
  ON public.transactions (debt_id)
  WHERE debt_id IS NOT NULL;
