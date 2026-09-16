-- Index matching how rates are looked up: by currency pair, newest date first.
--
-- latest_fx_rate() and the app's range resolver filter on
-- (from_currency, to_currency, rate_date <= x) ordered by rate_date desc,
-- created_at desc. Only single-column indexes and UNIQUE(rate_date, from,
-- to, source) existed, so every lookup scanned and sorted.
--
-- Rollback: DROP INDEX public.idx_fx_rates_pair_date;

CREATE INDEX IF NOT EXISTS idx_fx_rates_pair_date
  ON public.fx_rates (from_currency, to_currency, rate_date DESC, created_at DESC);
