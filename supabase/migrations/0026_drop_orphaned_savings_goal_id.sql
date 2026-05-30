-- ============================================================
-- 0026: Drop orphaned transactions.savings_goal_id
-- ============================================================
-- Savings-goal progress is now derived live from the linked account's
-- balance (see getSavingsGoals). The transactions.savings_goal_id column
-- and its index (added in 0012) are no longer referenced by any code.

DROP INDEX IF EXISTS idx_transactions_savings_goal_id;

ALTER TABLE transactions
  DROP COLUMN IF EXISTS savings_goal_id;
