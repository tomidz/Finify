-- Read-only check of the opening-balance chain.
--
-- For each active account and each month after the caller's first, the stored
-- opening must equal the previous month's stored opening plus the previous
-- month's non-deleted movements, in native and in base currency: the rule
-- recalculateOpeningBalances writes. Returns the months where that link does
-- not hold, and months where an active account has no opening row at all
-- (stored_opening is null) instead of reading that as zero.
--
-- The tolerance absorbs 8-decimal rounding of the stored values, not money.
--
-- Rollback: DROP FUNCTION public.ledger_drift();

CREATE OR REPLACE FUNCTION public.ledger_drift()
RETURNS TABLE (
  account_id uuid,
  account_name text,
  month_id uuid,
  year integer,
  month integer,
  stored_opening numeric,
  derived_opening numeric,
  stored_opening_base numeric,
  derived_opening_base numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH user_months AS (
    SELECT
      m.id,
      m.year,
      m.month,
      lag(m.id) OVER (ORDER BY m.year, m.month) AS previous_month_id
    FROM public.months m
    WHERE m.user_id = (SELECT auth.uid())
  ),
  movements AS (
    SELECT
      t.month_id,
      ta.account_id,
      sum(ta.amount) AS amount,
      sum(ta.base_amount) AS base_amount
    FROM public.transaction_amounts ta
    JOIN public.transactions t ON t.id = ta.transaction_id
    WHERE t.user_id = (SELECT auth.uid())
      AND t.deleted_at IS NULL
    GROUP BY t.month_id, ta.account_id
  ),
  links AS (
    SELECT
      a.id AS account_id,
      a.name AS account_name,
      m.id AS month_id,
      m.year,
      m.month,
      cur.opening_amount AS stored_opening,
      coalesce(prev.opening_amount, 0) + coalesce(mv.amount, 0) AS derived_opening,
      cur.opening_base_amount AS stored_opening_base,
      coalesce(prev.opening_base_amount, 0) + coalesce(mv.base_amount, 0) AS derived_opening_base
    FROM user_months m
    CROSS JOIN public.accounts a
    LEFT JOIN public.opening_balances cur
      ON cur.month_id = m.id AND cur.account_id = a.id
    LEFT JOIN public.opening_balances prev
      ON prev.month_id = m.previous_month_id AND prev.account_id = a.id
    LEFT JOIN movements mv
      ON mv.month_id = m.previous_month_id AND mv.account_id = a.id
    WHERE a.user_id = (SELECT auth.uid())
      AND a.is_active
      AND m.previous_month_id IS NOT NULL
  )
  SELECT
    l.account_id,
    l.account_name,
    l.month_id,
    l.year,
    l.month,
    l.stored_opening,
    l.derived_opening,
    l.stored_opening_base,
    l.derived_opening_base
  FROM links l
  WHERE l.stored_opening IS NULL
     OR abs(l.stored_opening - l.derived_opening) > 0.000001
     OR abs(l.stored_opening_base - l.derived_opening_base) > 0.000001
  ORDER BY l.year, l.month, l.account_name;
$$;

REVOKE EXECUTE ON FUNCTION public.ledger_drift() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ledger_drift() TO authenticated, service_role;
