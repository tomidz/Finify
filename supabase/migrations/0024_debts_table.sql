-- Debts table: tracks user liabilities (loans, mortgages, etc.) linked to a
-- net-worth item snapshot stream. Created here because earlier migrations
-- skipped it (the table was added directly in production); this migration
-- backfills the missing DDL so fresh environments match prod.

CREATE TABLE IF NOT EXISTS public.debts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  original_amount NUMERIC NOT NULL CHECK (original_amount > 0),
  currency        TEXT NOT NULL REFERENCES public.currencies(code),
  nw_item_id      UUID REFERENCES public.nw_items(id) ON DELETE SET NULL,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own debts" ON public.debts;
CREATE POLICY "Users own debts" ON public.debts
  FOR ALL USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_debts_user
  ON public.debts (user_id);
CREATE INDEX IF NOT EXISTS idx_debts_active
  ON public.debts (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_debts_currency
  ON public.debts (currency);
CREATE INDEX IF NOT EXISTS idx_debts_nw_item_id
  ON public.debts (nw_item_id);

DROP TRIGGER IF EXISTS trg_debts_updated_at ON public.debts;
CREATE TRIGGER trg_debts_updated_at
  BEFORE UPDATE ON public.debts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
