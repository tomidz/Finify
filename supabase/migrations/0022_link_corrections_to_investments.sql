-- Link auto-deduction / auto-credit correction transactions back to the
-- investment lot or investment_sale that created them, so deletes and edits
-- can reverse the side effect cleanly.

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS source_investment_id UUID
  REFERENCES public.investments(id) ON DELETE SET NULL;

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS source_investment_sale_id UUID
  REFERENCES public.investment_sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_source_investment
  ON public.transactions(source_investment_id)
  WHERE source_investment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_source_investment_sale
  ON public.transactions(source_investment_sale_id)
  WHERE source_investment_sale_id IS NOT NULL;

COMMENT ON COLUMN public.transactions.source_investment_id IS
  'Links a correction transaction back to the investment lot whose auto-deduction created it. Allows reversing on lot edit/delete.';

COMMENT ON COLUMN public.transactions.source_investment_sale_id IS
  'Links a correction transaction back to the investment_sale whose auto-credit created it. Allows reversing on sale edit/delete.';
