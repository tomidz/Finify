-- Adds action_account_id to transaction_rules so a rule can route a matched
-- transaction to a specific account. The migration file was originally empty
-- (column was applied directly in production); this restores the DDL so fresh
-- environments match prod.

ALTER TABLE public.transaction_rules
  ADD COLUMN IF NOT EXISTS action_account_id UUID
    REFERENCES public.accounts(id) ON DELETE SET NULL;
