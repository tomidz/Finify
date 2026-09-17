-- Reclassify investment data the previous app filed under the wrong kind.
--
-- Lots and sales whose ticker (or, without one, name) is a stablecoin code, or
-- a currency code filed as "other" or crypto or held in that same currency,
-- were priced in market data as unrelated securities and showed gains they do
-- not have. They become asset_type 'stablecoin' and 'cash', which the app
-- prices at the exchange rate. A row with an ISIN is a listed instrument, and
-- a stock like NOK held in dollars stays a stock. Lots and sales change
-- together, since a holding is matched by asset type. The codes match
-- src/lib/asset-classes.ts.
--
-- Purchases and sales recorded before the 'investment' transaction type
-- (0028) whose lot or sale was already gone when 0029 backfilled the type are
-- still corrections. They become 'investment', so the budget counts them.
--
-- Changes data. Each row's previous value is kept in
-- data_reclassification_backup for the rollback. Running it twice changes
-- nothing more.
--
-- Rollback:
--   UPDATE public.investments i SET asset_type = b.previous_value
--     FROM public.data_reclassification_backup b
--     WHERE b.table_name = 'investments' AND b.column_name = 'asset_type' AND b.row_id = i.id;
--   UPDATE public.investment_sales s SET asset_type = b.previous_value
--     FROM public.data_reclassification_backup b
--     WHERE b.table_name = 'investment_sales' AND b.column_name = 'asset_type' AND b.row_id = s.id;
--   UPDATE public.transactions t SET transaction_type = b.previous_value::public.transaction_type
--     FROM public.data_reclassification_backup b
--     WHERE b.table_name = 'transactions' AND b.column_name = 'transaction_type' AND b.row_id = t.id;
--   DROP TABLE public.data_reclassification_backup;

CREATE TABLE IF NOT EXISTS public.data_reclassification_backup (
  table_name      text        NOT NULL,
  column_name     text        NOT NULL,
  row_id          uuid        NOT NULL,
  previous_value  text        NOT NULL,
  reclassified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, column_name, row_id)
);

-- Only the migration and a rollback read it.
ALTER TABLE public.data_reclassification_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.data_reclassification_backup FROM anon, authenticated;

WITH codes (code, asset_type) AS (
  VALUES
    ('USD', 'cash'), ('EUR', 'cash'), ('GBP', 'cash'), ('CHF', 'cash'), ('JPY', 'cash'),
    ('CNY', 'cash'), ('ARS', 'cash'), ('BRL', 'cash'), ('CLP', 'cash'), ('COP', 'cash'),
    ('MXN', 'cash'), ('PEN', 'cash'), ('UYU', 'cash'), ('CAD', 'cash'), ('AUD', 'cash'),
    ('NZD', 'cash'), ('DKK', 'cash'), ('SEK', 'cash'), ('NOK', 'cash'), ('PLN', 'cash'),
    ('CZK', 'cash'), ('HUF', 'cash'), ('RON', 'cash'), ('BGN', 'cash'), ('TRY', 'cash'),
    ('ZAR', 'cash'), ('INR', 'cash'), ('HKD', 'cash'), ('SGD', 'cash'), ('KRW', 'cash'),
    ('ILS', 'cash'),
    ('USDT', 'stablecoin'), ('USDC', 'stablecoin'), ('DAI', 'stablecoin'), ('BUSD', 'stablecoin'),
    ('TUSD', 'stablecoin'), ('FDUSD', 'stablecoin'), ('PYUSD', 'stablecoin'), ('USDP', 'stablecoin'),
    ('USDE', 'stablecoin'), ('EURC', 'stablecoin'), ('EURT', 'stablecoin')
),
lots AS (
  SELECT i.id, i.asset_type AS previous_value, c.asset_type
  FROM public.investments i
  JOIN codes c ON c.code = upper(coalesce(nullif(btrim(i.ticker), ''), btrim(i.asset_name)))
  WHERE i.asset_type <> c.asset_type
    AND nullif(btrim(i.isin), '') IS NULL
    AND (c.asset_type = 'stablecoin' OR c.code = upper(i.currency) OR i.asset_type IN ('other', 'crypto'))
),
backed_up AS (
  INSERT INTO public.data_reclassification_backup (table_name, column_name, row_id, previous_value)
  SELECT 'investments', 'asset_type', l.id, l.previous_value FROM lots l
  ON CONFLICT (table_name, column_name, row_id) DO NOTHING
)
UPDATE public.investments i
SET asset_type = l.asset_type,
    updated_at = now()
FROM lots l
WHERE l.id = i.id;

WITH codes (code, asset_type) AS (
  VALUES
    ('USD', 'cash'), ('EUR', 'cash'), ('GBP', 'cash'), ('CHF', 'cash'), ('JPY', 'cash'),
    ('CNY', 'cash'), ('ARS', 'cash'), ('BRL', 'cash'), ('CLP', 'cash'), ('COP', 'cash'),
    ('MXN', 'cash'), ('PEN', 'cash'), ('UYU', 'cash'), ('CAD', 'cash'), ('AUD', 'cash'),
    ('NZD', 'cash'), ('DKK', 'cash'), ('SEK', 'cash'), ('NOK', 'cash'), ('PLN', 'cash'),
    ('CZK', 'cash'), ('HUF', 'cash'), ('RON', 'cash'), ('BGN', 'cash'), ('TRY', 'cash'),
    ('ZAR', 'cash'), ('INR', 'cash'), ('HKD', 'cash'), ('SGD', 'cash'), ('KRW', 'cash'),
    ('ILS', 'cash'),
    ('USDT', 'stablecoin'), ('USDC', 'stablecoin'), ('DAI', 'stablecoin'), ('BUSD', 'stablecoin'),
    ('TUSD', 'stablecoin'), ('FDUSD', 'stablecoin'), ('PYUSD', 'stablecoin'), ('USDP', 'stablecoin'),
    ('USDE', 'stablecoin'), ('EURC', 'stablecoin'), ('EURT', 'stablecoin')
),
sales AS (
  SELECT s.id, s.asset_type AS previous_value, c.asset_type
  FROM public.investment_sales s
  JOIN codes c ON c.code = upper(coalesce(nullif(btrim(s.ticker), ''), btrim(s.asset_name)))
  WHERE s.asset_type <> c.asset_type
    AND nullif(btrim(s.isin), '') IS NULL
    AND (c.asset_type = 'stablecoin' OR c.code = upper(s.currency) OR s.asset_type IN ('other', 'crypto'))
),
backed_up AS (
  INSERT INTO public.data_reclassification_backup (table_name, column_name, row_id, previous_value)
  SELECT 'investment_sales', 'asset_type', x.id, x.previous_value FROM sales x
  ON CONFLICT (table_name, column_name, row_id) DO NOTHING
)
UPDATE public.investment_sales s
SET asset_type = x.asset_type,
    updated_at = now()
FROM sales x
WHERE x.id = s.id;

WITH purchases_and_sales AS (
  SELECT t.id
  FROM public.transactions t
  WHERE t.transaction_type = 'correction'
    AND t.deleted_at IS NULL
    AND (t.description LIKE 'Compra: %' OR t.description LIKE 'Venta: %')
),
backed_up AS (
  INSERT INTO public.data_reclassification_backup (table_name, column_name, row_id, previous_value)
  SELECT 'transactions', 'transaction_type', p.id, 'correction' FROM purchases_and_sales p
  ON CONFLICT (table_name, column_name, row_id) DO NOTHING
)
UPDATE public.transactions t
SET transaction_type = 'investment'
FROM purchases_and_sales p
WHERE p.id = t.id;
