-- Performance + security hardening based on Supabase advisor findings.
--   1. Wrap auth.uid() in (SELECT auth.uid()) inside RLS policies so Postgres
--      caches the call once per statement instead of re-evaluating per row.
--   2. Restrict fx_rates INSERT policy to authenticated users (was always-true).
--   3. Add covering indexes for foreign keys missing them.
-- No data changes.

-- ===========================================================================
-- 1) RLS policies: auth.uid() -> (SELECT auth.uid())
-- ===========================================================================

-- accounts
DROP POLICY IF EXISTS "Users can view own accounts" ON public.accounts;
CREATE POLICY "Users can view own accounts" ON public.accounts
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own accounts" ON public.accounts;
CREATE POLICY "Users can insert own accounts" ON public.accounts
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own accounts" ON public.accounts;
CREATE POLICY "Users can update own accounts" ON public.accounts
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can delete own accounts" ON public.accounts;
CREATE POLICY "Users can delete own accounts" ON public.accounts
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- budget_categories
DROP POLICY IF EXISTS "Users own budget_categories" ON public.budget_categories;
CREATE POLICY "Users own budget_categories" ON public.budget_categories
  FOR ALL USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- budget_lines
DROP POLICY IF EXISTS "Users own budget_lines" ON public.budget_lines;
CREATE POLICY "Users own budget_lines" ON public.budget_lines
  FOR ALL USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- budget_month_plans
DROP POLICY IF EXISTS "Users own budget_month_plans" ON public.budget_month_plans;
CREATE POLICY "Users own budget_month_plans" ON public.budget_month_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.budget_lines l
      WHERE l.id = budget_month_plans.line_id
        AND l.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.budget_lines l
      WHERE l.id = budget_month_plans.line_id
        AND l.user_id = (SELECT auth.uid())
    )
  );

-- budget_recurrence_rules
DROP POLICY IF EXISTS "Users own budget_recurrence_rules" ON public.budget_recurrence_rules;
CREATE POLICY "Users own budget_recurrence_rules" ON public.budget_recurrence_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.budget_lines l
      WHERE l.id = budget_recurrence_rules.line_id
        AND l.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.budget_lines l
      WHERE l.id = budget_recurrence_rules.line_id
        AND l.user_id = (SELECT auth.uid())
    )
  );

-- budget_years
DROP POLICY IF EXISTS "Users own budget_years" ON public.budget_years;
CREATE POLICY "Users own budget_years" ON public.budget_years
  FOR ALL USING ((SELECT auth.uid()) = user_id);

-- debt_activities
DROP POLICY IF EXISTS "Users own debt_activities" ON public.debt_activities;
CREATE POLICY "Users own debt_activities" ON public.debt_activities
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.nw_items i
      WHERE i.id = debt_activities.nw_item_id
        AND i.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nw_items i
      WHERE i.id = debt_activities.nw_item_id
        AND i.user_id = (SELECT auth.uid())
    )
  );

-- debts: table is created in 0024_debts_table.sql, which also installs the
-- optimized policy directly. Skipped here.

-- investment_sales
DROP POLICY IF EXISTS "investment_sales_select" ON public.investment_sales;
CREATE POLICY "investment_sales_select" ON public.investment_sales
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "investment_sales_insert" ON public.investment_sales;
CREATE POLICY "investment_sales_insert" ON public.investment_sales
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "investment_sales_update" ON public.investment_sales;
CREATE POLICY "investment_sales_update" ON public.investment_sales
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "investment_sales_delete" ON public.investment_sales;
CREATE POLICY "investment_sales_delete" ON public.investment_sales
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- investments
DROP POLICY IF EXISTS "investments_select" ON public.investments;
CREATE POLICY "investments_select" ON public.investments
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "investments_insert" ON public.investments;
CREATE POLICY "investments_insert" ON public.investments
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "investments_update" ON public.investments;
CREATE POLICY "investments_update" ON public.investments
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "investments_delete" ON public.investments;
CREATE POLICY "investments_delete" ON public.investments
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- months
DROP POLICY IF EXISTS "Users can view own months" ON public.months;
CREATE POLICY "Users can view own months" ON public.months
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own months" ON public.months;
CREATE POLICY "Users can insert own months" ON public.months
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own months" ON public.months;
CREATE POLICY "Users can update own months" ON public.months
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can delete own months" ON public.months;
CREATE POLICY "Users can delete own months" ON public.months
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- nw_items
DROP POLICY IF EXISTS "Users own nw_items" ON public.nw_items;
CREATE POLICY "Users own nw_items" ON public.nw_items
  FOR ALL USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- nw_snapshots
DROP POLICY IF EXISTS "Users own nw_snapshots" ON public.nw_snapshots;
CREATE POLICY "Users own nw_snapshots" ON public.nw_snapshots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.nw_items i
      WHERE i.id = nw_snapshots.nw_item_id
        AND i.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nw_items i
      WHERE i.id = nw_snapshots.nw_item_id
        AND i.user_id = (SELECT auth.uid())
    )
  );

-- opening_balances
DROP POLICY IF EXISTS "Users can view own opening balances" ON public.opening_balances;
CREATE POLICY "Users can view own opening balances" ON public.opening_balances
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.months m
      WHERE m.id = opening_balances.month_id
        AND m.user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS "Users can insert own opening balances" ON public.opening_balances;
CREATE POLICY "Users can insert own opening balances" ON public.opening_balances
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.months m
      WHERE m.id = opening_balances.month_id
        AND m.user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS "Users can update own opening balances" ON public.opening_balances;
CREATE POLICY "Users can update own opening balances" ON public.opening_balances
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.months m
      WHERE m.id = opening_balances.month_id
        AND m.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.months m
      WHERE m.id = opening_balances.month_id
        AND m.user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS "Users can delete own opening balances" ON public.opening_balances;
CREATE POLICY "Users can delete own opening balances" ON public.opening_balances
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.months m
      WHERE m.id = opening_balances.month_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

-- recurring_transactions
DROP POLICY IF EXISTS "Users can manage own recurring" ON public.recurring_transactions;
CREATE POLICY "Users can manage own recurring" ON public.recurring_transactions
  FOR ALL USING ((SELECT auth.uid()) = user_id);

-- savings_goals
DROP POLICY IF EXISTS "Users can manage own goals" ON public.savings_goals;
CREATE POLICY "Users can manage own goals" ON public.savings_goals
  FOR ALL USING ((SELECT auth.uid()) = user_id);

-- transaction_amounts
DROP POLICY IF EXISTS "Users can view own transaction amounts" ON public.transaction_amounts;
CREATE POLICY "Users can view own transaction amounts" ON public.transaction_amounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_amounts.transaction_id
        AND t.user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS "Users can insert own transaction amounts" ON public.transaction_amounts;
CREATE POLICY "Users can insert own transaction amounts" ON public.transaction_amounts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_amounts.transaction_id
        AND t.user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS "Users can update own transaction amounts" ON public.transaction_amounts;
CREATE POLICY "Users can update own transaction amounts" ON public.transaction_amounts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_amounts.transaction_id
        AND t.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_amounts.transaction_id
        AND t.user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS "Users can delete own transaction amounts" ON public.transaction_amounts;
CREATE POLICY "Users can delete own transaction amounts" ON public.transaction_amounts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_amounts.transaction_id
        AND t.user_id = (SELECT auth.uid())
    )
  );

-- transaction_rules
DROP POLICY IF EXISTS "Users can manage own rules" ON public.transaction_rules;
CREATE POLICY "Users can manage own rules" ON public.transaction_rules
  FOR ALL USING ((SELECT auth.uid()) = user_id);

-- transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
CREATE POLICY "Users can view own transactions" ON public.transactions
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
CREATE POLICY "Users can insert own transactions" ON public.transactions
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
CREATE POLICY "Users can update own transactions" ON public.transactions
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can delete own transactions" ON public.transactions;
CREATE POLICY "Users can delete own transactions" ON public.transactions
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- user_preferences
DROP POLICY IF EXISTS "Users own preferences" ON public.user_preferences;
CREATE POLICY "Users own preferences" ON public.user_preferences
  FOR ALL USING ((SELECT auth.uid()) = user_id);

-- ===========================================================================
-- 2) fx_rates: restrict INSERT to authenticated role (was: WITH CHECK true)
-- ===========================================================================
DROP POLICY IF EXISTS "Allow insert on fx_rates" ON public.fx_rates;
CREATE POLICY "Allow insert on fx_rates" ON public.fx_rates
  FOR INSERT TO authenticated WITH CHECK (true);

-- ===========================================================================
-- 3) Missing FK indexes
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_accounts_currency
  ON public.accounts (currency);

CREATE INDEX IF NOT EXISTS idx_budget_lines_category_id
  ON public.budget_lines (category_id);

CREATE INDEX IF NOT EXISTS idx_budget_recurrence_rules_start_month_id
  ON public.budget_recurrence_rules (start_month_id);
CREATE INDEX IF NOT EXISTS idx_budget_recurrence_rules_end_month_id
  ON public.budget_recurrence_rules (end_month_id);

CREATE INDEX IF NOT EXISTS idx_debt_activities_transaction_id
  ON public.debt_activities (transaction_id);

-- idx_debts_currency / idx_debts_nw_item_id are added in 0024_debts_table.sql

CREATE INDEX IF NOT EXISTS idx_fx_rates_from_currency
  ON public.fx_rates (from_currency);
CREATE INDEX IF NOT EXISTS idx_fx_rates_to_currency
  ON public.fx_rates (to_currency);

CREATE INDEX IF NOT EXISTS idx_investment_sales_currency
  ON public.investment_sales (currency);

CREATE INDEX IF NOT EXISTS idx_investments_account_id
  ON public.investments (account_id);
CREATE INDEX IF NOT EXISTS idx_investments_currency
  ON public.investments (currency);

CREATE INDEX IF NOT EXISTS idx_nw_items_account_id
  ON public.nw_items (account_id);
CREATE INDEX IF NOT EXISTS idx_nw_items_currency
  ON public.nw_items (currency);

CREATE INDEX IF NOT EXISTS idx_recurring_transactions_account_id
  ON public.recurring_transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_category_id
  ON public.recurring_transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_currency
  ON public.recurring_transactions (currency);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_user_id
  ON public.recurring_transactions (user_id);

CREATE INDEX IF NOT EXISTS idx_savings_goals_account_id
  ON public.savings_goals (account_id);
CREATE INDEX IF NOT EXISTS idx_savings_goals_currency
  ON public.savings_goals (currency);
CREATE INDEX IF NOT EXISTS idx_savings_goals_user_id
  ON public.savings_goals (user_id);

CREATE INDEX IF NOT EXISTS idx_transaction_amounts_original_currency
  ON public.transaction_amounts (original_currency);

CREATE INDEX IF NOT EXISTS idx_transaction_rules_action_account_id
  ON public.transaction_rules (action_account_id);
CREATE INDEX IF NOT EXISTS idx_transaction_rules_action_category_id
  ON public.transaction_rules (action_category_id);
CREATE INDEX IF NOT EXISTS idx_transaction_rules_user_id
  ON public.transaction_rules (user_id);

CREATE INDEX IF NOT EXISTS idx_transactions_category_id
  ON public.transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_month_id
  ON public.transactions (month_id);
CREATE INDEX IF NOT EXISTS idx_transactions_savings_goal_id
  ON public.transactions (savings_goal_id);

CREATE INDEX IF NOT EXISTS idx_user_preferences_base_currency
  ON public.user_preferences (base_currency);
