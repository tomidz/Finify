-- Position adjustments create lots with zero cost basis (e.g. interest in
-- kind, airdrops, reconciliation). Relax the checks to allow cost >= 0;
-- quantity must remain > 0.
ALTER TABLE public.investments
  DROP CONSTRAINT IF EXISTS investments_price_per_unit_check;
ALTER TABLE public.investments
  ADD CONSTRAINT investments_price_per_unit_check CHECK (price_per_unit >= 0);

ALTER TABLE public.investments
  DROP CONSTRAINT IF EXISTS investments_total_cost_check;
ALTER TABLE public.investments
  ADD CONSTRAINT investments_total_cost_check CHECK (total_cost >= 0);
