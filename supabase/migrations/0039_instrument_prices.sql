-- Per-user cache of instrument prices (crypto, stocks, ETFs).
--
-- Valuing investments hit CoinGecko / TwelveData / Yahoo on every page load,
-- one instrument after another and twice per net-worth render. Prices are
-- now read through this cache with a short TTL enforced by the app.
--
-- Per user on purpose: a shared table writable by any authenticated user
-- would let one account change the prices another account sees.
--
-- Rollback: DROP TABLE public.instrument_prices;

CREATE TABLE IF NOT EXISTS public.instrument_prices (
  user_id     UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_key   TEXT           NOT NULL,
  price       NUMERIC(28,10) NOT NULL CHECK (price > 0),
  source      TEXT           NOT NULL CHECK (source IN ('coingecko', 'twelvedata', 'yahoo', 'manual')),
  fetched_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, price_key)
);

ALTER TABLE public.instrument_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "instrument_prices_select" ON public.instrument_prices
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "instrument_prices_insert" ON public.instrument_prices
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "instrument_prices_update" ON public.instrument_prices
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "instrument_prices_delete" ON public.instrument_prices
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.instrument_prices FROM anon;
