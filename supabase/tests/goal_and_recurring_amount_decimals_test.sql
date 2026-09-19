-- Savings goal and recurring amounts (0056) keep 8 decimals, like the ledger,
-- so a crypto amount is stored as typed.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

-- With 4 arguments col_type_is reads (table, column, type, description): the
-- schema form needs the description too.
select col_type_is('public', 'savings_goals', 'target_amount', 'numeric(24,8)', 'goal target keeps 8 decimals');
select col_type_is('public', 'savings_goals', 'current_amount', 'numeric(24,8)', 'goal progress keeps 8 decimals');
select col_type_is('public', 'recurring_transactions', 'amount', 'numeric(24,8)', 'recurring amount keeps 8 decimals');
select col_type_is('public', 'recurring_transactions', 'base_amount', 'numeric(24,8)', 'recurring base keeps 8 decimals');

select * from finish();
rollback;
