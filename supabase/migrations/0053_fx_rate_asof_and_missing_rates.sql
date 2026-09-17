-- Exchange rates with their date, and no amount valued without one.
--
-- fx_rate_asof(p_date, p_from, p_to, p_max_age_days) returns the latest cached
-- rate on or before p_date, no older than p_max_age_days when given, with the
-- date it was quoted for and its source. latest_fx_rate stays as it is.
--
-- account_net_worth_year, net_worth_evolution_year and liabilities_year
-- valued an amount without a cached rate at 1:1 (coalesce(rate, 1)) or at its
-- unconverted amount, and took a cached rate of any age. They now take today's
-- rate only if it is at most fx_max_age_days old (7 days, 3 when the peso is
-- involved), like the app, and leave an amount without one out:
--   - account_net_worth_year: investment_value_base is NULL for an account
--     with a lot or sale without a rate; investment_fx_missing marks it and
--     investment_fx_rate_date is the oldest rate the account used.
--   - liabilities_year: amount_base is NULL without a rate; fx_missing marks
--     it and fx_rate_date is the rate's date.
--   - net_worth_evolution_year: a month's totals leave out what has no rate,
--     and fx_missing marks the month.
-- The return types change, so the three functions are dropped and created.
-- user_valued_currencies() lists the currencies those functions convert, so the
-- app can fetch today's rates before reading them.
--
-- Rollback:
--   DROP FUNCTION public.fx_rate_asof(date, text, text, integer);
--   DROP FUNCTION public.fx_max_age_days(text, text);
--   DROP FUNCTION public.user_valued_currencies();
--   DROP FUNCTION public.account_net_worth_year(integer, text);
--   DROP FUNCTION public.net_worth_evolution_year(integer, text);
--   DROP FUNCTION public.liabilities_year(integer, text);
--   then re-run their CREATE OR REPLACE from 0035 (account_net_worth_year,
--   net_worth_evolution_year) and 0027 (liabilities_year), and the REVOKE and
--   GRANT of 0042 for them.

CREATE FUNCTION public.fx_rate_asof(
  p_date date,
  p_from text,
  p_to text,
  p_max_age_days integer DEFAULT NULL
)
RETURNS TABLE (rate numeric, rate_date date, source text)
LANGUAGE sql
STABLE
AS $$
  SELECT 1::numeric, p_date, 'same currency'::text
  WHERE p_from = p_to
  UNION ALL
  (
    SELECT fx.rate, fx.rate_date, fx.source
    FROM public.fx_rates fx
    WHERE p_from <> p_to
      AND fx.from_currency = p_from
      AND fx.to_currency = p_to
      AND fx.rate_date <= p_date
      AND (p_max_age_days IS NULL OR fx.rate_date >= p_date - p_max_age_days)
    ORDER BY fx.rate_date DESC, fx.created_at DESC
    LIMIT 1
  );
$$;

-- How old a cached rate may be when valuing at today's rate. The peso moves
-- enough in a few days that an older quote misvalues it.
CREATE FUNCTION public.fx_max_age_days(p_from text, p_to text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_from = 'ARS' OR p_to = 'ARS' THEN 3 ELSE 7 END;
$$;

CREATE FUNCTION public.user_valued_currencies()
RETURNS SETOF text
LANGUAGE sql
STABLE
AS $$
  SELECT currency FROM public.investments WHERE user_id = auth.uid()
  UNION
  SELECT currency FROM public.investment_sales WHERE user_id = auth.uid()
  UNION
  SELECT currency FROM public.nw_items WHERE user_id = auth.uid() AND side = 'liability';
$$;

DROP FUNCTION public.account_net_worth_year(integer, text);

CREATE FUNCTION public.account_net_worth_year(
  p_year integer,
  p_base_currency text DEFAULT NULL
)
RETURNS TABLE (
  year integer,
  month integer,
  account_id uuid,
  account_name text,
  account_type text,
  currency text,
  currency_symbol text,
  balance numeric,
  balance_base numeric,
  investment_value numeric,
  investment_value_base numeric,
  investment_fx_missing boolean,
  investment_fx_rate_date date
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT public.resolve_base_currency(p_base_currency) AS code
  ),
  latest_month AS (
    SELECT m.id, m.month
    FROM public.months m
    WHERE m.user_id = auth.uid()
      AND m.year = p_year
    ORDER BY m.month DESC
    LIMIT 1
  ),
  period_end AS (
    SELECT (make_date(p_year, lm.month, 1) + interval '1 month')::date AS next_month_start
    FROM latest_month lm
  ),
  account_rows AS (
    SELECT a.id, a.name, a.account_type, a.currency, c.symbol AS currency_symbol
    FROM public.accounts a
    JOIN public.currencies c ON c.code = a.currency
    WHERE a.user_id = auth.uid()
      AND a.is_active = true
  ),
  openings AS (
    SELECT
      ob.account_id,
      sum(ob.opening_amount)::numeric AS opening_amount,
      sum(ob.opening_base_amount)::numeric AS opening_base_amount
    FROM public.opening_balances ob
    JOIN latest_month lm ON lm.id = ob.month_id
    GROUP BY ob.account_id
  ),
  movements AS (
    SELECT
      ta.account_id,
      sum(ta.amount)::numeric AS amount,
      sum(ta.base_amount)::numeric AS base_amount
    FROM public.transaction_amounts ta
    JOIN public.transactions t ON t.id = ta.transaction_id
    JOIN latest_month lm ON lm.id = t.month_id
    WHERE t.user_id = auth.uid()
      AND t.deleted_at IS NULL
    GROUP BY ta.account_id
  ),
  -- Lots held at the end of the period, and the cost of what was sold after it.
  holdings AS (
    SELECT i.account_id, i.currency, i.total_cost AS cost
    FROM public.investments i
    CROSS JOIN period_end pe
    WHERE i.user_id = auth.uid()
      AND i.purchase_date < pe.next_month_start
    UNION ALL
    SELECT s.account_id, s.currency, s.cost_basis
    FROM public.investment_sales s
    CROSS JOIN period_end pe
    WHERE s.user_id = auth.uid()
      AND s.sale_date >= pe.next_month_start
  ),
  rates AS (
    SELECT h.currency, fx.rate, fx.rate_date
    FROM (SELECT DISTINCT currency FROM holdings) h
    CROSS JOIN base
    LEFT JOIN LATERAL public.fx_rate_asof(current_date, h.currency, base.code, public.fx_max_age_days(h.currency, base.code)) fx ON true
  ),
  holding_values AS (
    SELECT
      h.account_id,
      sum(h.cost)::numeric AS investment_value,
      sum(h.cost * r.rate)::numeric AS investment_value_base,
      bool_or(r.rate IS NULL) AS fx_missing,
      min(r.rate_date) FILTER (WHERE h.currency <> base.code) AS fx_rate_date
    FROM holdings h
    CROSS JOIN base
    JOIN rates r ON r.currency = h.currency
    GROUP BY h.account_id
  )
  SELECT
    p_year AS year,
    coalesce((SELECT month FROM latest_month), 0) AS month,
    a.id AS account_id,
    a.name AS account_name,
    a.account_type,
    a.currency,
    a.currency_symbol,
    coalesce(o.opening_amount, 0) + coalesce(m.amount, 0) AS balance,
    coalesce(o.opening_base_amount, 0) + coalesce(m.base_amount, 0) AS balance_base,
    coalesce(hv.investment_value, 0) AS investment_value,
    CASE WHEN hv.fx_missing THEN NULL ELSE coalesce(hv.investment_value_base, 0) END AS investment_value_base,
    coalesce(hv.fx_missing, false) AS investment_fx_missing,
    hv.fx_rate_date AS investment_fx_rate_date
  FROM account_rows a
  LEFT JOIN openings o ON o.account_id = a.id
  LEFT JOIN movements m ON m.account_id = a.id
  LEFT JOIN holding_values hv ON hv.account_id = a.id
  WHERE EXISTS (SELECT 1 FROM latest_month)
  ORDER BY a.account_type, a.name;
$$;

DROP FUNCTION public.net_worth_evolution_year(integer, text);

CREATE FUNCTION public.net_worth_evolution_year(
  p_year integer,
  p_base_currency text DEFAULT NULL
)
RETURNS TABLE (
  month integer,
  assets numeric,
  liabilities numeric,
  net_worth numeric,
  fx_missing boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT public.resolve_base_currency(p_base_currency) AS code
  ),
  months_in_year AS (
    SELECT m.id, m.month
    FROM public.months m
    WHERE m.user_id = auth.uid()
      AND m.year = p_year
  ),
  opening_assets AS (
    SELECT ob.month_id, sum(ob.opening_base_amount)::numeric AS assets
    FROM public.opening_balances ob
    JOIN months_in_year miy ON miy.id = ob.month_id
    GROUP BY ob.month_id
  ),
  transaction_assets AS (
    SELECT t.month_id, sum(ta.base_amount)::numeric AS assets
    FROM public.transactions t
    JOIN public.transaction_amounts ta ON ta.transaction_id = t.id
    JOIN months_in_year miy ON miy.id = t.month_id
    WHERE t.user_id = auth.uid()
      AND t.deleted_at IS NULL
    GROUP BY t.month_id
  ),
  cash_assets AS (
    SELECT miy.month, coalesce(oa.assets, 0) + coalesce(ta.assets, 0) AS assets
    FROM months_in_year miy
    LEFT JOIN opening_assets oa ON oa.month_id = miy.id
    LEFT JOIN transaction_assets ta ON ta.month_id = miy.id
  ),
  month_ends AS (
    SELECT miy.month, (make_date(p_year, miy.month, 1) + interval '1 month')::date AS next_month_start
    FROM months_in_year miy
  ),
  liability_items AS (
    SELECT i.id, i.currency
    FROM public.nw_items i
    WHERE i.user_id = auth.uid()
      AND i.side = 'liability'
  ),
  currencies_used AS (
    SELECT currency FROM public.investments WHERE user_id = auth.uid()
    UNION
    SELECT currency FROM public.investment_sales WHERE user_id = auth.uid()
    UNION
    SELECT currency FROM liability_items
  ),
  rates AS (
    SELECT cu.currency, fx.rate
    FROM currencies_used cu
    CROSS JOIN base
    LEFT JOIN LATERAL public.fx_rate_asof(current_date, cu.currency, base.code, public.fx_max_age_days(cu.currency, base.code)) fx ON true
  ),
  investment_assets AS (
    SELECT
      me.month,
      sum(h.cost * r.rate)::numeric AS assets,
      coalesce(bool_or(h.currency IS NOT NULL AND r.rate IS NULL), false) AS fx_missing
    FROM month_ends me
    LEFT JOIN LATERAL (
      SELECT i.currency, i.total_cost AS cost
      FROM public.investments i
      WHERE i.user_id = auth.uid()
        AND i.purchase_date < me.next_month_start
      UNION ALL
      -- Positions sold after this month still existed during it.
      SELECT s.currency, s.cost_basis
      FROM public.investment_sales s
      WHERE s.user_id = auth.uid()
        AND s.sale_date >= me.next_month_start
    ) h ON true
    LEFT JOIN rates r ON r.currency = h.currency
    GROUP BY me.month
  ),
  liability_snapshots AS (
    SELECT
      miy.month,
      li.currency,
      (
        SELECT ns.amount
        FROM public.nw_snapshots ns
        WHERE ns.nw_item_id = li.id
          AND (ns.year < p_year OR (ns.year = p_year AND ns.month <= miy.month))
        ORDER BY ns.year DESC, ns.month DESC
        LIMIT 1
      ) AS amount
    FROM months_in_year miy
    CROSS JOIN liability_items li
  ),
  liabilities AS (
    SELECT
      ls.month,
      sum(ls.amount * r.rate)::numeric AS liabilities,
      coalesce(bool_or(ls.amount IS NOT NULL AND r.rate IS NULL), false) AS fx_missing
    FROM liability_snapshots ls
    JOIN rates r ON r.currency = ls.currency
    GROUP BY ls.month
  )
  SELECT
    miy.month,
    (coalesce(ca.assets, 0) + coalesce(ia.assets, 0))::numeric AS assets,
    coalesce(l.liabilities, 0)::numeric AS liabilities,
    (coalesce(ca.assets, 0) + coalesce(ia.assets, 0) - coalesce(l.liabilities, 0))::numeric AS net_worth,
    coalesce(ia.fx_missing, false) OR coalesce(l.fx_missing, false) AS fx_missing
  FROM months_in_year miy
  LEFT JOIN cash_assets ca ON ca.month = miy.month
  LEFT JOIN investment_assets ia ON ia.month = miy.month
  LEFT JOIN liabilities l ON l.month = miy.month
  ORDER BY miy.month;
$$;

DROP FUNCTION public.liabilities_year(integer, text);

CREATE FUNCTION public.liabilities_year(
  p_year integer,
  p_base_currency text DEFAULT NULL
)
RETURNS TABLE (
  item_id uuid,
  name text,
  currency text,
  currency_symbol text,
  amount numeric,
  amount_base numeric,
  fx_missing boolean,
  fx_rate_date date
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT public.resolve_base_currency(p_base_currency) AS code
  ),
  items AS (
    SELECT i.id, i.name, i.currency, c.symbol AS currency_symbol
    FROM public.nw_items i
    JOIN public.currencies c ON c.code = i.currency
    WHERE i.user_id = auth.uid()
      AND i.side = 'liability'
  ),
  latest_snapshots AS (
    SELECT DISTINCT ON (ns.nw_item_id) ns.nw_item_id, ns.amount
    FROM public.nw_snapshots ns
    JOIN items i ON i.id = ns.nw_item_id
    WHERE ns.year <= p_year
    ORDER BY ns.nw_item_id, ns.year DESC, ns.month DESC
  )
  SELECT
    i.id AS item_id,
    i.name,
    i.currency,
    i.currency_symbol,
    coalesce(ls.amount, 0) AS amount,
    CASE WHEN coalesce(ls.amount, 0) = 0 THEN 0 ELSE ls.amount * fx.rate END AS amount_base,
    coalesce(ls.amount, 0) <> 0 AND fx.rate IS NULL AS fx_missing,
    CASE WHEN i.currency <> base.code AND coalesce(ls.amount, 0) <> 0 THEN fx.rate_date END AS fx_rate_date
  FROM items i
  CROSS JOIN base
  LEFT JOIN latest_snapshots ls ON ls.nw_item_id = i.id
  LEFT JOIN LATERAL public.fx_rate_asof(current_date, i.currency, base.code, public.fx_max_age_days(i.currency, base.code)) fx ON true
  ORDER BY i.name;
$$;

REVOKE EXECUTE ON FUNCTION public.fx_rate_asof(date, text, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fx_max_age_days(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_valued_currencies() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.account_net_worth_year(integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.net_worth_evolution_year(integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.liabilities_year(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fx_rate_asof(date, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fx_max_age_days(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_valued_currencies() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_net_worth_year(integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.net_worth_evolution_year(integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.liabilities_year(integer, text) TO authenticated, service_role;
