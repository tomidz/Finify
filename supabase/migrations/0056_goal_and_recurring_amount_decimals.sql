-- Savings goals and recurring templates keep the amounts the user types, up to
-- 8 decimals like the ledger: a crypto amount was rounded to 2 decimals, and a
-- small target could be stored as 0.
--
-- numeric(24, 8) holds every value numeric(18, 2) held (16 integer digits), so
-- no stored amount changes and none can overflow. Compatible with the code
-- already deployed, which sends at most 2 decimals.
--
-- Rollback:
--   (the columns stay numeric(24, 8): narrowing them back would round stored
--   amounts.)
-- destructive-ok: amount columns widen from numeric(18,2) to numeric(24,8), which keeps every stored value.

ALTER TABLE public.savings_goals
  ALTER COLUMN target_amount TYPE numeric(24, 8),
  ALTER COLUMN current_amount TYPE numeric(24, 8);

ALTER TABLE public.recurring_transactions
  ALTER COLUMN amount TYPE numeric(24, 8),
  ALTER COLUMN base_amount TYPE numeric(24, 8);
