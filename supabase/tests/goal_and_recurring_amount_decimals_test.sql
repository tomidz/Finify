-- Savings goal and recurring amounts (0056) keep 8 decimals, like the ledger,
-- so a crypto amount is stored as typed.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

select col_type_is('public', 'savings_goals', 'target_amount', 'numeric(24,8)');
select col_type_is('public', 'savings_goals', 'current_amount', 'numeric(24,8)');
select col_type_is('public', 'recurring_transactions', 'amount', 'numeric(24,8)');
select col_type_is('public', 'recurring_transactions', 'base_amount', 'numeric(24,8)');

select * from finish();
rollback;
