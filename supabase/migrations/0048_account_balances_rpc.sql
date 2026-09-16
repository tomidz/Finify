-- Account balances summed in the database. Summing legs in the app read at
-- most one response's worth of rows, so an account with more legs than
-- PostgREST returns got a wrong balance.
--
-- account_balances(p_account_ids): for each of the caller's accounts in the
--   list, its initial balance plus every non-deleted leg, in native and in base
--   currency.
-- account_month_balances(p_account_id): for each of the caller's months, the
--   account's stored opening and its non-deleted movements, latest month first.
--
-- Rollback:
--   DROP FUNCTION public.account_month_balances(uuid);
--   DROP FUNCTION public.account_balances(uuid[]);

CREATE OR REPLACE FUNCTION public.account_balances(p_account_ids uuid[])
RETURNS TABLE (
  account_id uuid,
  amount numeric,
  base_amount numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH movements AS (
    SELECT ta.account_id, sum(ta.amount) AS amount, sum(ta.base_amount) AS base_amount
    FROM public.transaction_amounts ta
    JOIN public.transactions t ON t.id = ta.transaction_id
    WHERE ta.account_id = ANY (p_account_ids)
      AND t.user_id = (SELECT auth.uid())
      AND t.deleted_at IS NULL
    GROUP BY ta.account_id
  )
  SELECT
    a.id,
    coalesce(a.initial_amount, 0) + coalesce(mv.amount, 0),
    coalesce(a.initial_base_amount, 0) + coalesce(mv.base_amount, 0)
  FROM public.accounts a
  LEFT JOIN movements mv ON mv.account_id = a.id
  WHERE a.id = ANY (p_account_ids)
    AND a.user_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.account_month_balances(p_account_id uuid)
RETURNS TABLE (
  year integer,
  month integer,
  opening_amount numeric,
  opening_base_amount numeric,
  movements numeric,
  base_movements numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH movements AS (
    SELECT t.month_id, sum(ta.amount) AS amount, sum(ta.base_amount) AS base_amount
    FROM public.transaction_amounts ta
    JOIN public.transactions t ON t.id = ta.transaction_id
    WHERE ta.account_id = p_account_id
      AND t.user_id = (SELECT auth.uid())
      AND t.deleted_at IS NULL
    GROUP BY t.month_id
  )
  SELECT
    m.year,
    m.month,
    coalesce(ob.opening_amount, 0),
    coalesce(ob.opening_base_amount, 0),
    coalesce(mv.amount, 0),
    coalesce(mv.base_amount, 0)
  FROM public.months m
  JOIN public.accounts a ON a.id = p_account_id AND a.user_id = m.user_id
  LEFT JOIN public.opening_balances ob ON ob.month_id = m.id AND ob.account_id = a.id
  LEFT JOIN movements mv ON mv.month_id = m.id
  WHERE m.user_id = (SELECT auth.uid())
  ORDER BY m.year DESC, m.month DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.account_balances(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.account_month_balances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_balances(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_month_balances(uuid) TO authenticated, service_role;
