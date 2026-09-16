-- Initial balance stored on the account, and a rebuild of opening balances
-- computed from it in SQL.
--
-- Until now the initial balance only existed as the opening row of the
-- earliest month, and every later opening was chained from the one before.
-- A new earlier month or a failed partial write could move that anchor. From
-- here on, for every month and every account of the caller (active or not):
--
--   opening = account initial balance + non-deleted legs of all earlier months
--
-- in native and in base currency. This migration adds the columns, fills them
-- from the current openings, adds rebuild_opening_balances() and moves
-- ledger_drift() (0043) to the same rule, for every account.
--
-- Backfill (new columns only; existing rows keep their values): each account's
-- earliest opening row minus the legs of any months before that row. For an
-- account with a row in its user's first month there are none, and the value
-- is that opening.
--
-- Rollback:
--   Re-run the CREATE OR REPLACE FUNCTION public.ledger_drift() of 0043.
--   DROP FUNCTION public.rebuild_opening_balances(uuid);
--   ALTER TABLE public.accounts DROP COLUMN initial_base_currency;
--   ALTER TABLE public.accounts DROP COLUMN initial_base_amount;
--   ALTER TABLE public.accounts DROP COLUMN initial_amount;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS initial_amount numeric(18, 8),
  ADD COLUMN IF NOT EXISTS initial_base_amount numeric(18, 8),
  ADD COLUMN IF NOT EXISTS initial_base_currency text REFERENCES public.currencies(code);

WITH month_codes AS (
  SELECT m.id, m.user_id, m.year * 100 + m.month AS code
  FROM public.months m
),
anchor AS (
  -- Each account's earliest opening row.
  SELECT DISTINCT ON (ob.account_id)
    ob.account_id,
    mc.code,
    ob.opening_amount,
    ob.opening_base_amount
  FROM public.opening_balances ob
  JOIN month_codes mc ON mc.id = ob.month_id
  ORDER BY ob.account_id, mc.code
),
earlier_legs AS (
  SELECT
    ta.account_id,
    sum(ta.amount) AS amount,
    sum(ta.base_amount) AS base_amount
  FROM public.transaction_amounts ta
  JOIN public.transactions t ON t.id = ta.transaction_id
  JOIN month_codes mc ON mc.id = t.month_id
  JOIN anchor an ON an.account_id = ta.account_id
  WHERE t.deleted_at IS NULL
    AND mc.code < an.code
  GROUP BY ta.account_id
)
UPDATE public.accounts a
SET
  initial_amount = an.opening_amount - coalesce(el.amount, 0),
  initial_base_amount = an.opening_base_amount - coalesce(el.base_amount, 0),
  initial_base_currency = (
    SELECT up.base_currency FROM public.user_preferences up WHERE up.user_id = a.user_id
  )
FROM anchor an
LEFT JOIN earlier_legs el ON el.account_id = an.account_id
WHERE an.account_id = a.id
  AND a.initial_amount IS NULL;

CREATE OR REPLACE FUNCTION public.rebuild_opening_balances(p_from_month_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_from_code integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'rebuild_opening_balances: not signed in' USING ERRCODE = '42501';
  END IF;

  IF p_from_month_id IS NOT NULL THEN
    SELECT m.year * 100 + m.month INTO v_from_code
    FROM public.months m
    WHERE m.id = p_from_month_id
      AND m.user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'rebuild_opening_balances: month not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- One rebuild at a time per user: two concurrent ones would each write
  -- openings from their own snapshot of the legs.
  PERFORM pg_advisory_xact_lock(hashtextextended('rebuild_opening_balances:' || v_user::text, 0));

  WITH user_months AS (
    SELECT m.id, m.year * 100 + m.month AS code
    FROM public.months m
    WHERE m.user_id = v_user
  ),
  user_accounts AS (
    SELECT
      a.id,
      coalesce(a.initial_amount, 0) AS initial_amount,
      coalesce(a.initial_base_amount, 0) AS initial_base_amount
    FROM public.accounts a
    WHERE a.user_id = v_user
  ),
  movements AS (
    SELECT
      t.month_id,
      ta.account_id,
      sum(ta.amount) AS amount,
      sum(ta.base_amount) AS base_amount
    FROM public.transaction_amounts ta
    JOIN public.transactions t ON t.id = ta.transaction_id
    WHERE t.user_id = v_user
      AND t.deleted_at IS NULL
      AND t.month_id IS NOT NULL
    GROUP BY t.month_id, ta.account_id
  ),
  grid AS (
    SELECT
      um.id AS month_id,
      um.code,
      ua.id AS account_id,
      ua.initial_amount,
      ua.initial_base_amount,
      coalesce(mv.amount, 0) AS amount,
      coalesce(mv.base_amount, 0) AS base_amount
    FROM user_months um
    CROSS JOIN user_accounts ua
    LEFT JOIN movements mv ON mv.month_id = um.id AND mv.account_id = ua.id
  ),
  openings AS (
    SELECT
      g.month_id,
      g.account_id,
      g.code,
      g.initial_amount + coalesce(sum(g.amount) OVER earlier, 0) AS opening_amount,
      g.initial_base_amount + coalesce(sum(g.base_amount) OVER earlier, 0) AS opening_base_amount
    FROM grid g
    WINDOW earlier AS (
      PARTITION BY g.account_id
      ORDER BY g.code
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    )
  )
  INSERT INTO public.opening_balances (month_id, account_id, opening_amount, opening_base_amount)
  SELECT o.month_id, o.account_id, o.opening_amount, o.opening_base_amount
  FROM openings o
  WHERE v_from_code IS NULL OR o.code >= v_from_code
  ON CONFLICT (month_id, account_id) DO UPDATE
    SET opening_amount = excluded.opening_amount,
        opening_base_amount = excluded.opening_base_amount
    WHERE public.opening_balances.opening_amount IS DISTINCT FROM excluded.opening_amount
       OR public.opening_balances.opening_base_amount IS DISTINCT FROM excluded.opening_base_amount;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rebuild_opening_balances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebuild_opening_balances(uuid) TO authenticated, service_role;

-- Same columns as in 0043; the expected opening now comes from the account.
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
    SELECT m.id, m.year, m.month, m.year * 100 + m.month AS code
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
      AND t.month_id IS NOT NULL
    GROUP BY t.month_id, ta.account_id
  ),
  expected AS (
    SELECT
      a.id AS account_id,
      a.name AS account_name,
      um.id AS month_id,
      um.year,
      um.month,
      coalesce(a.initial_amount, 0) + coalesce(sum(mv.amount) OVER earlier, 0) AS derived_opening,
      coalesce(a.initial_base_amount, 0) + coalesce(sum(mv.base_amount) OVER earlier, 0) AS derived_opening_base
    FROM user_months um
    CROSS JOIN public.accounts a
    LEFT JOIN movements mv ON mv.month_id = um.id AND mv.account_id = a.id
    WHERE a.user_id = (SELECT auth.uid())
    WINDOW earlier AS (
      PARTITION BY a.id
      ORDER BY um.code
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    )
  )
  SELECT
    e.account_id,
    e.account_name,
    e.month_id,
    e.year,
    e.month,
    ob.opening_amount,
    e.derived_opening,
    ob.opening_base_amount,
    e.derived_opening_base
  FROM expected e
  LEFT JOIN public.opening_balances ob
    ON ob.month_id = e.month_id AND ob.account_id = e.account_id
  WHERE ob.id IS NULL
     OR abs(ob.opening_amount - e.derived_opening) > 0.000001
     OR abs(ob.opening_base_amount - e.derived_opening_base) > 0.000001
  ORDER BY e.year, e.month, e.account_name;
$$;
