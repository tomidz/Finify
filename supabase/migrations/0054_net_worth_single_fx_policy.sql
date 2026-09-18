-- Net worth valued at the month-close rate, like every other balance.
--
-- account_net_worth_year and net_worth_evolution_year added cash up at the base
-- amounts stored when each movement was recorded, while investments and debts
-- took today's rate even for past months. Now every balance of a month is
-- valued at the rate of its close: the month's last day, or today for the
-- month in progress, read with fx_rate_asof within fx_max_age_days. A position
-- or a debt without a rate has no base amount and is marked, as in 0053; a
-- cash balance without one (a currency no provider quotes, like a crypto
-- code) keeps the base amounts stored with its movements, and is marked.
--
--   - app_today(): today in the app's timezone. current_date follows the
--     server's (UTC), where the next day starts at 21:00 in Buenos Aires.
--   - fx_rate_asof(): only the rates of the source the app reads and writes
--     for the pair (dolarapi when the peso is involved, else frankfurter).
--   - user_valued_currencies(): also the currencies of the accounts.
--   - account_net_worth_year: balance_base at the close rate (the stored base
--     amounts without one), balance_book_base with the stored base amounts,
--     balance_fx_missing, balance_fx_rate_date, holdings at the close rate,
--     is_active and close_date. Inactive accounts are listed while they hold
--     a balance or a position.
--   - net_worth_evolution_year: each month's cash (every account, active or
--     not), holdings and debts at that month's close rate; close_date;
--     fx_missing now only for positions and debts left out, and
--     cash_fx_missing for cash counted at its stored base.
--   - budget_summary_vs_actual(_range) and transactions_feed: a movement in
--     another currency at fx_rate_asof on its date (today's for a later one)
--     within fx_max_age_days, else its stored base amount, like the app
--     (was latest_fx_rate, of any source and age).
--   - opening_balances_with_current_base: at the rate of the previous
--     month's close, like the app's period summary.
--   - liabilities_year: the latest snapshot up to the year's latest month, at
--     its close rate, or up to the year's end at that day's rate (today's if
--     earlier) when the year has no months; close_date.
-- The last month of net_worth_evolution_year is the total of
-- account_net_worth_year minus the total of liabilities_year.
-- The return types change, so the three functions are dropped and created.
--
-- Rollback (revert the app first: it reads the new columns):
--   DROP FUNCTION public.account_net_worth_year(integer, text);
--   DROP FUNCTION public.net_worth_evolution_year(integer, text);
--   DROP FUNCTION public.liabilities_year(integer, text);
--   DROP FUNCTION public.app_today();
--   then re-run from 0053 the CREATE FUNCTION of account_net_worth_year,
--   net_worth_evolution_year and liabilities_year, the bodies of
--   user_valued_currencies and fx_rate_asof as CREATE OR REPLACE FUNCTION, and
--   the REVOKE and GRANT for them; budget_summary_vs_actual(_range) from 0034,
--   transactions_feed from 0021 and opening_balances_with_current_base from
--   0013.

CREATE FUNCTION public.app_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
$$;

CREATE OR REPLACE FUNCTION public.fx_rate_asof(
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
      AND fx.source = CASE WHEN 'ARS' IN (p_from, p_to) THEN 'dolarapi' ELSE 'frankfurter' END
      AND fx.rate_date <= p_date
      AND (p_max_age_days IS NULL OR fx.rate_date >= p_date - p_max_age_days)
    ORDER BY fx.rate_date DESC, fx.created_at DESC
    LIMIT 1
  );
$$;

CREATE OR REPLACE FUNCTION public.user_valued_currencies()
RETURNS SETOF text
LANGUAGE sql
STABLE
AS $$
  SELECT currency FROM public.accounts WHERE user_id = auth.uid()
  UNION
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
  close_date date,
  account_id uuid,
  account_name text,
  account_type text,
  currency text,
  currency_symbol text,
  is_active boolean,
  balance numeric,
  balance_base numeric,
  balance_book_base numeric,
  balance_fx_missing boolean,
  balance_fx_rate_date date,
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
  -- The year's latest month.
  period AS (
    SELECT
      m.id AS month_id,
      m.month,
      (make_date(p_year, m.month, 1) + interval '1 month')::date AS next_month_start,
      least((make_date(p_year, m.month, 1) + interval '1 month')::date - 1, public.app_today()) AS close_date
    FROM public.months m
    WHERE m.user_id = auth.uid()
      AND m.year = p_year
    ORDER BY m.month DESC
    LIMIT 1
  ),
  openings AS (
    SELECT
      ob.account_id,
      sum(ob.opening_amount)::numeric AS amount,
      sum(ob.opening_base_amount)::numeric AS base_amount
    FROM public.opening_balances ob
    JOIN period p ON p.month_id = ob.month_id
    GROUP BY ob.account_id
  ),
  movements AS (
    SELECT
      ta.account_id,
      sum(ta.amount)::numeric AS amount,
      sum(ta.base_amount)::numeric AS base_amount
    FROM public.transaction_amounts ta
    JOIN public.transactions t ON t.id = ta.transaction_id
    JOIN period p ON p.month_id = t.month_id
    WHERE t.user_id = auth.uid()
      AND t.deleted_at IS NULL
    GROUP BY ta.account_id
  ),
  -- Lots held at the end of the period, and the cost of what was sold after it.
  holdings AS (
    SELECT i.account_id, i.currency, i.total_cost AS cost
    FROM public.investments i
    JOIN period p ON i.purchase_date < p.next_month_start
    WHERE i.user_id = auth.uid()
    UNION ALL
    SELECT s.account_id, s.currency, s.cost_basis
    FROM public.investment_sales s
    JOIN period p ON s.sale_date >= p.next_month_start
    WHERE s.user_id = auth.uid()
  ),
  rates AS (
    SELECT cu.currency, fx.rate, fx.rate_date
    FROM public.user_valued_currencies() AS cu(currency)
    CROSS JOIN base
    CROSS JOIN period p
    LEFT JOIN LATERAL public.fx_rate_asof(p.close_date, cu.currency, base.code, public.fx_max_age_days(cu.currency, base.code)) fx ON true
  ),
  -- An account with a position without a rate has no base value at all, so
  -- net_worth_evolution_year leaves the same positions out.
  holding_values AS (
    SELECT
      h.account_id,
      sum(h.cost)::numeric AS investment_value,
      sum(CASE WHEN h.cost = 0 THEN 0 ELSE h.cost * r.rate END)::numeric AS investment_value_base,
      bool_or(h.cost <> 0 AND r.rate IS NULL) AS fx_missing,
      min(r.rate_date) FILTER (WHERE h.currency <> base.code AND h.cost <> 0) AS fx_rate_date
    FROM holdings h
    CROSS JOIN base
    LEFT JOIN rates r ON r.currency = h.currency
    GROUP BY h.account_id
  ),
  account_values AS (
    SELECT
      a.id,
      a.name,
      a.account_type,
      a.currency,
      c.symbol AS currency_symbol,
      a.is_active,
      coalesce(o.amount, 0) + coalesce(mv.amount, 0) AS balance,
      coalesce(o.base_amount, 0) + coalesce(mv.base_amount, 0) AS balance_book_base,
      r.rate,
      r.rate_date,
      hv.account_id IS NOT NULL AS holds_positions,
      hv.investment_value,
      hv.investment_value_base,
      hv.fx_missing AS investment_fx_missing,
      hv.fx_rate_date AS investment_fx_rate_date
    FROM public.accounts a
    JOIN public.currencies c ON c.code = a.currency
    LEFT JOIN openings o ON o.account_id = a.id
    LEFT JOIN movements mv ON mv.account_id = a.id
    LEFT JOIN rates r ON r.currency = a.currency
    LEFT JOIN holding_values hv ON hv.account_id = a.id
    WHERE a.user_id = auth.uid()
  )
  SELECT
    p_year AS year,
    p.month,
    p.close_date,
    av.id AS account_id,
    av.name AS account_name,
    av.account_type,
    av.currency,
    av.currency_symbol,
    av.is_active,
    av.balance,
    CASE
      WHEN av.balance = 0 THEN 0
      WHEN av.rate IS NULL THEN av.balance_book_base
      ELSE av.balance * av.rate
    END AS balance_base,
    av.balance_book_base,
    av.balance <> 0 AND av.rate IS NULL AS balance_fx_missing,
    CASE WHEN av.currency <> base.code AND av.balance <> 0 THEN av.rate_date END AS balance_fx_rate_date,
    coalesce(av.investment_value, 0) AS investment_value,
    CASE WHEN av.investment_fx_missing THEN NULL ELSE coalesce(av.investment_value_base, 0) END AS investment_value_base,
    coalesce(av.investment_fx_missing, false) AS investment_fx_missing,
    av.investment_fx_rate_date
  FROM account_values av
  CROSS JOIN period p
  CROSS JOIN base
  WHERE av.is_active
    OR av.balance <> 0
    OR av.holds_positions
  ORDER BY av.account_type, av.name;
$$;

DROP FUNCTION public.net_worth_evolution_year(integer, text);

CREATE FUNCTION public.net_worth_evolution_year(
  p_year integer,
  p_base_currency text DEFAULT NULL
)
RETURNS TABLE (
  month integer,
  close_date date,
  assets numeric,
  liabilities numeric,
  net_worth numeric,
  fx_missing boolean,
  cash_fx_missing boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT public.resolve_base_currency(p_base_currency) AS code
  ),
  months_in_year AS (
    SELECT
      m.id,
      m.month,
      (make_date(p_year, m.month, 1) + interval '1 month')::date AS next_month_start,
      least((make_date(p_year, m.month, 1) + interval '1 month')::date - 1, public.app_today()) AS close_date
    FROM public.months m
    WHERE m.user_id = auth.uid()
      AND m.year = p_year
  ),
  rates AS (
    SELECT miy.month, cu.currency, fx.rate
    FROM months_in_year miy
    CROSS JOIN public.user_valued_currencies() AS cu(currency)
    CROSS JOIN base
    LEFT JOIN LATERAL public.fx_rate_asof(miy.close_date, cu.currency, base.code, public.fx_max_age_days(cu.currency, base.code)) fx ON true
  ),
  openings AS (
    SELECT
      ob.month_id,
      ob.account_id,
      sum(ob.opening_amount)::numeric AS amount,
      sum(ob.opening_base_amount)::numeric AS base_amount
    FROM public.opening_balances ob
    JOIN months_in_year miy ON miy.id = ob.month_id
    GROUP BY ob.month_id, ob.account_id
  ),
  movements AS (
    SELECT
      t.month_id,
      ta.account_id,
      sum(ta.amount)::numeric AS amount,
      sum(ta.base_amount)::numeric AS base_amount
    FROM public.transactions t
    JOIN public.transaction_amounts ta ON ta.transaction_id = t.id
    JOIN months_in_year miy ON miy.id = t.month_id
    WHERE t.user_id = auth.uid()
      AND t.deleted_at IS NULL
    GROUP BY t.month_id, ta.account_id
  ),
  -- Every account, active or not: one without a balance adds nothing.
  balances AS (
    SELECT
      miy.month,
      a.currency,
      coalesce(o.amount, 0) + coalesce(mv.amount, 0) AS balance,
      coalesce(o.base_amount, 0) + coalesce(mv.base_amount, 0) AS book_base
    FROM months_in_year miy
    CROSS JOIN public.accounts a
    LEFT JOIN openings o ON o.month_id = miy.id AND o.account_id = a.id
    LEFT JOIN movements mv ON mv.month_id = miy.id AND mv.account_id = a.id
    WHERE a.user_id = auth.uid()
  ),
  cash_assets AS (
    SELECT
      b.month,
      sum(
        CASE
          WHEN b.balance = 0 THEN 0
          WHEN r.rate IS NULL THEN b.book_base
          ELSE b.balance * r.rate
        END
      )::numeric AS assets,
      bool_or(b.balance <> 0 AND r.rate IS NULL) AS fx_missing
    FROM balances b
    LEFT JOIN rates r ON r.month = b.month AND r.currency = b.currency
    GROUP BY b.month
  ),
  holdings AS (
    SELECT miy.month, h.account_id, h.currency, h.cost
    FROM months_in_year miy
    CROSS JOIN LATERAL (
      SELECT i.account_id, i.currency, i.total_cost AS cost
      FROM public.investments i
      WHERE i.user_id = auth.uid()
        AND i.purchase_date < miy.next_month_start
      UNION ALL
      -- Positions sold after this month still existed during it.
      SELECT s.account_id, s.currency, s.cost_basis
      FROM public.investment_sales s
      WHERE s.user_id = auth.uid()
        AND s.sale_date >= miy.next_month_start
    ) h
  ),
  -- Per account, like account_net_worth_year: a position without a rate
  -- leaves its account's positions out.
  account_holdings AS (
    SELECT
      h.month,
      CASE
        WHEN bool_or(h.cost <> 0 AND r.rate IS NULL) THEN NULL
        ELSE sum(CASE WHEN h.cost = 0 THEN 0 ELSE h.cost * r.rate END)
      END AS value_base,
      bool_or(h.cost <> 0 AND r.rate IS NULL) AS fx_missing
    FROM holdings h
    LEFT JOIN rates r ON r.month = h.month AND r.currency = h.currency
    GROUP BY h.month, h.account_id
  ),
  investment_assets AS (
    SELECT ah.month, sum(ah.value_base)::numeric AS assets, bool_or(ah.fx_missing) AS fx_missing
    FROM account_holdings ah
    GROUP BY ah.month
  ),
  liability_amounts AS (
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
    CROSS JOIN public.nw_items li
    WHERE li.user_id = auth.uid()
      AND li.side = 'liability'
  ),
  liability_totals AS (
    SELECT
      la.month,
      sum(CASE WHEN coalesce(la.amount, 0) = 0 THEN 0 ELSE la.amount * r.rate END)::numeric AS liabilities,
      bool_or(coalesce(la.amount, 0) <> 0 AND r.rate IS NULL) AS fx_missing
    FROM liability_amounts la
    LEFT JOIN rates r ON r.month = la.month AND r.currency = la.currency
    GROUP BY la.month
  )
  SELECT
    miy.month,
    miy.close_date,
    (coalesce(ca.assets, 0) + coalesce(ia.assets, 0))::numeric AS assets,
    coalesce(lt.liabilities, 0)::numeric AS liabilities,
    (coalesce(ca.assets, 0) + coalesce(ia.assets, 0) - coalesce(lt.liabilities, 0))::numeric AS net_worth,
    coalesce(ia.fx_missing, false) OR coalesce(lt.fx_missing, false) AS fx_missing,
    coalesce(ca.fx_missing, false) AS cash_fx_missing
  FROM months_in_year miy
  LEFT JOIN cash_assets ca ON ca.month = miy.month
  LEFT JOIN investment_assets ia ON ia.month = miy.month
  LEFT JOIN liability_totals lt ON lt.month = miy.month
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
  fx_rate_date date,
  close_date date
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT public.resolve_base_currency(p_base_currency) AS code
  ),
  -- The year's latest month; without months, the whole year.
  period AS (
    SELECT
      max(m.month) AS month,
      CASE
        WHEN max(m.month) IS NULL THEN least(make_date(p_year, 12, 31), public.app_today())
        ELSE least((make_date(p_year, max(m.month), 1) + interval '1 month')::date - 1, public.app_today())
      END AS close_date
    FROM public.months m
    WHERE m.user_id = auth.uid()
      AND m.year = p_year
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
    CROSS JOIN period p
    WHERE ns.year < p_year
      OR (ns.year = p_year AND (p.month IS NULL OR ns.month <= p.month))
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
    CASE WHEN i.currency <> base.code AND coalesce(ls.amount, 0) <> 0 THEN fx.rate_date END AS fx_rate_date,
    p.close_date
  FROM items i
  CROSS JOIN base
  CROSS JOIN period p
  LEFT JOIN latest_snapshots ls ON ls.nw_item_id = i.id
  LEFT JOIN LATERAL public.fx_rate_asof(p.close_date, i.currency, base.code, public.fx_max_age_days(i.currency, base.code)) fx ON true
  ORDER BY i.name;
$$;

-- The budget's actuals read the same rates as the app, so both agree on a
-- category.
create or replace function public.budget_summary_vs_actual(
  p_month_id uuid,
  p_base_currency text default null
)
returns table (
  category_id uuid,
  category_name text,
  category_type public.budget_category_type,
  planned_amount numeric,
  actual_amount numeric,
  variance numeric
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(p_base_currency) as code
  ),
  month_ctx as (
    select m.id, make_date(m.year, m.month, 1) as month_start
    from public.months m
    where m.id = p_month_id
      and m.user_id = auth.uid()
  ),
  plans as (
    select
      l.category_id,
      sum(bmp.planned_amount)::numeric as planned_amount
    from public.budget_month_plans bmp
    join public.budget_lines l on l.id = bmp.line_id
    join month_ctx mc on mc.id = bmp.month_id
    where l.user_id = auth.uid()
    group by l.category_id
  ),
  tx_actuals as (
    select
      t.category_id,
      sum(
        case
          when ta.original_currency = base.code then ta.amount
          else coalesce(
            ta.amount * (
              SELECT fx.rate
              FROM public.fx_rate_asof(least(t.date, public.app_today()), ta.original_currency, base.code, public.fx_max_age_days(ta.original_currency, base.code)) fx
            ),
            ta.base_amount
          )
        end
      )::numeric as signed_amount
    from public.transactions t
    join month_ctx mc on mc.id = t.month_id
    cross join base
    join lateral (
      select ta.*
      from public.transaction_amounts ta
      where ta.transaction_id = t.id
      order by ta.created_at asc
      limit 1
    ) ta on true
    where t.user_id = auth.uid()
      and t.deleted_at is null
      and t.transaction_type <> 'transfer'
      and t.category_id is not null
    group by t.category_id
  )
  select
    bc.id as category_id,
    bc.name as category_name,
    bc.category_type,
    coalesce(plans.planned_amount, 0) as planned_amount,
    case
      when bc.category_type = 'income' then coalesce(tx_actuals.signed_amount, 0)
      else -coalesce(tx_actuals.signed_amount, 0)
    end as actual_amount,
    coalesce(plans.planned_amount, 0) - case
      when bc.category_type = 'income' then coalesce(tx_actuals.signed_amount, 0)
      else -coalesce(tx_actuals.signed_amount, 0)
    end as variance
  from public.budget_categories bc
  left join plans on plans.category_id = bc.id
  left join tx_actuals on tx_actuals.category_id = bc.id
  where bc.user_id = auth.uid()
  order by bc.display_order asc, bc.name asc;
$$;

create or replace function public.budget_summary_vs_actual_range(
  p_start_month_id uuid,
  p_end_month_id uuid,
  p_base_currency text default null
)
returns table (
  category_id uuid,
  category_name text,
  category_type public.budget_category_type,
  planned_amount numeric,
  actual_amount numeric,
  variance numeric
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(p_base_currency) as code
  ),
  bounds as (
    select
      least(sm.year * 100 + sm.month, em.year * 100 + em.month) as start_code,
      greatest(sm.year * 100 + sm.month, em.year * 100 + em.month) as end_code
    from public.months sm
    join public.months em on em.id = p_end_month_id and em.user_id = auth.uid()
    where sm.id = p_start_month_id
      and sm.user_id = auth.uid()
  ),
  months_in_range as (
    select m.id
    from public.months m
    join bounds b on (m.year * 100 + m.month) between b.start_code and b.end_code
    where m.user_id = auth.uid()
  ),
  plans as (
    select
      l.category_id,
      sum(bmp.planned_amount)::numeric as planned_amount
    from public.budget_month_plans bmp
    join public.budget_lines l on l.id = bmp.line_id
    join months_in_range mir on mir.id = bmp.month_id
    where l.user_id = auth.uid()
    group by l.category_id
  ),
  tx_actuals as (
    select
      t.category_id,
      sum(
        case
          when ta.original_currency = base.code then ta.amount
          else coalesce(
            ta.amount * (
              SELECT fx.rate
              FROM public.fx_rate_asof(least(t.date, public.app_today()), ta.original_currency, base.code, public.fx_max_age_days(ta.original_currency, base.code)) fx
            ),
            ta.base_amount
          )
        end
      )::numeric as signed_amount
    from public.transactions t
    join months_in_range mir on mir.id = t.month_id
    cross join base
    join lateral (
      select ta.*
      from public.transaction_amounts ta
      where ta.transaction_id = t.id
      order by ta.created_at asc
      limit 1
    ) ta on true
    where t.user_id = auth.uid()
      and t.deleted_at is null
      and t.transaction_type <> 'transfer'
      and t.category_id is not null
    group by t.category_id
  )
  select
    bc.id as category_id,
    bc.name as category_name,
    bc.category_type,
    coalesce(plans.planned_amount, 0) as planned_amount,
    case
      when bc.category_type = 'income' then coalesce(tx_actuals.signed_amount, 0)
      else -coalesce(tx_actuals.signed_amount, 0)
    end as actual_amount,
    coalesce(plans.planned_amount, 0) - case
      when bc.category_type = 'income' then coalesce(tx_actuals.signed_amount, 0)
      else -coalesce(tx_actuals.signed_amount, 0)
    end as variance
  from public.budget_categories bc
  left join plans on plans.category_id = bc.id
  left join tx_actuals on tx_actuals.category_id = bc.id
  where bc.user_id = auth.uid()
  order by bc.display_order asc, bc.name asc;
$$;

-- The transactions list and the opening balances read the same rates too.
create or replace function public.transactions_feed(
  p_month_id uuid,
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null,
  p_transaction_type public.transaction_type default null,
  p_account_id uuid default null,
  p_category_id uuid default null,
  p_category_type public.budget_category_type default null
)
returns table (
  id uuid,
  user_id uuid,
  month_id uuid,
  category_id uuid,
  transaction_type public.transaction_type,
  date date,
  description text,
  notes text,
  fee numeric,
  created_at timestamptz,
  updated_at timestamptz,
  category_name text,
  category_type public.budget_category_type,
  amounts jsonb
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(null) as code
  ),
  filtered as (
    select
      t.id,
      t.user_id,
      t.month_id,
      t.category_id,
      t.transaction_type,
      t.date,
      t.description,
      t.notes,
      t.fee,
      t.created_at,
      t.updated_at,
      bc.name as category_name,
      bc.category_type
    from public.transactions t
    left join public.budget_categories bc on bc.id = t.category_id
    where t.user_id = auth.uid()
      and t.month_id = p_month_id
      and t.deleted_at is null
      and (p_transaction_type is null or t.transaction_type = p_transaction_type)
      and (p_account_id is null or exists (
        select 1
        from public.transaction_amounts ta
        where ta.transaction_id = t.id
          and ta.account_id = p_account_id
      ))
      and (p_category_id is null or t.category_id = p_category_id)
      and (p_category_type is null or bc.category_type = p_category_type)
      and (
        coalesce(nullif(trim(p_search), ''), '') = ''
        or lower(t.description) like '%' || lower(trim(p_search)) || '%'
        or lower(coalesce(bc.name, '')) like '%' || lower(trim(p_search)) || '%'
        or exists (
          select 1
          from public.transaction_amounts ta
          join public.accounts a on a.id = ta.account_id
          where ta.transaction_id = t.id
            and lower(a.name) like '%' || lower(trim(p_search)) || '%'
        )
      )
    order by t.date desc, t.created_at desc
    offset greatest(p_offset, 0)
    limit greatest(p_limit, 1)
  )
  select
    f.id, f.user_id, f.month_id, f.category_id, f.transaction_type,
    f.date, f.description, f.notes, f.fee, f.created_at, f.updated_at,
    f.category_name, f.category_type,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ta.id,
            'transaction_id', ta.transaction_id,
            'account_id', ta.account_id,
            'amount', ta.amount,
            'original_currency', ta.original_currency,
            'exchange_rate', ta.exchange_rate,
            'base_amount', ta.base_amount,
            'created_at', ta.created_at,
            'account_name', a.name,
            'account_currency_symbol', c.symbol,
            'current_base_amount',
              case
                when ta.original_currency = base.code then ta.amount
                else coalesce(
                  ta.amount * (
                  SELECT fx.rate
                  FROM public.fx_rate_asof(least(f.date, public.app_today()), ta.original_currency, base.code, public.fx_max_age_days(ta.original_currency, base.code)) fx
                ),
                  ta.base_amount
                )
              end
          )
          order by ta.created_at asc
        )
        from public.transaction_amounts ta
        join public.accounts a on a.id = ta.account_id
        join public.currencies c on c.code = ta.original_currency
        cross join base
        where ta.transaction_id = f.id
      ),
      '[]'::jsonb
    ) as amounts
  from filtered f
  order by f.date desc, f.created_at desc;
$$;

create or replace function public.opening_balances_with_current_base(
  p_month_id uuid,
  p_base_currency text default null
)
returns table (
  id uuid,
  month_id uuid,
  account_id uuid,
  opening_amount numeric,
  opening_base_amount numeric,
  created_at timestamptz,
  account_name text,
  account_currency text,
  account_currency_symbol text,
  current_opening_base_amount numeric
)
language sql
stable
as $$
  with base as (
    select public.resolve_base_currency(p_base_currency) as code
  ),
  target_month as (
    select m.id, make_date(m.year, m.month, 1) as fx_date
    from public.months m
    where m.id = p_month_id
      and m.user_id = auth.uid()
  )
  select
    ob.id,
    ob.month_id,
    ob.account_id,
    ob.opening_amount,
    ob.opening_base_amount,
    ob.created_at,
    a.name as account_name,
    a.currency as account_currency,
    c.symbol as account_currency_symbol,
    case
      when a.currency = base.code then ob.opening_amount
      else coalesce(
        ob.opening_amount * (
                  SELECT fx.rate
                  FROM public.fx_rate_asof(least(tm.fx_date - 1, public.app_today()), a.currency, base.code, public.fx_max_age_days(a.currency, base.code)) fx
                ),
        ob.opening_base_amount
      )
    end as current_opening_base_amount
  from public.opening_balances ob
  join target_month tm on tm.id = ob.month_id
  join public.accounts a on a.id = ob.account_id and a.user_id = auth.uid()
  join public.currencies c on c.code = a.currency
  cross join base
  order by ob.created_at asc;
$$;

REVOKE EXECUTE ON FUNCTION public.app_today() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_valued_currencies() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.account_net_worth_year(integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.net_worth_evolution_year(integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.liabilities_year(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_today() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_valued_currencies() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_net_worth_year(integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.net_worth_evolution_year(integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.liabilities_year(integer, text) TO authenticated, service_role;
