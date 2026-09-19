-- Every read RPC the app calls runs for a signed-in user, and none runs for a
-- signed-out caller.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Banco A', 'bank', 'USD');
insert into public.months (id, user_id, year, month) values
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 2026, 1),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 2026, 2);
insert into public.opening_balances (month_id, account_id, opening_amount, opening_base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 1000, 1000),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 990, 990);
insert into public.transactions (id, user_id, month_id, transaction_type, date, description) values
  ('aaaaaaaa-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000002', 'expense', '2026-01-10', 'Supermercado');
insert into public.transaction_amounts (transaction_id, account_id, amount, original_currency, exchange_rate, base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001', -10, 'USD', 1, -10);

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select lives_ok($$ select * from public.account_net_worth_year(2026) $$, 'account_net_worth_year');
select lives_ok($$ select * from public.budget_summary_vs_actual('aaaaaaaa-0000-4000-8000-000000000002') $$, 'budget_summary_vs_actual');
select lives_ok(
  $$ select * from public.budget_summary_vs_actual_range('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000003') $$,
  'budget_summary_vs_actual_range'
);
select lives_ok($$ select public.latest_fx_rate('2026-01-31', 'EUR', 'USD') $$, 'latest_fx_rate');
select lives_ok($$ select * from public.liabilities_year(2026) $$, 'liabilities_year');
select lives_ok($$ select * from public.net_worth_evolution_year(2026) $$, 'net_worth_evolution_year');
select lives_ok($$ select * from public.opening_balances_with_current_base('aaaaaaaa-0000-4000-8000-000000000002') $$, 'opening_balances_with_current_base');
select lives_ok($$ select public.resolve_base_currency() $$, 'resolve_base_currency');
select lives_ok($$ select * from public.transactions_feed('aaaaaaaa-0000-4000-8000-000000000002') $$, 'transactions_feed');
select lives_ok($$ select * from public.usage_counts() $$, 'usage_counts');
select lives_ok($$ select * from public.ledger_drift() $$, 'ledger_drift');

select is(
  (select count(*) from public.transactions_feed('aaaaaaaa-0000-4000-8000-000000000002')),
  1::bigint,
  'the feed returns the month''s transaction'
);
select is(
  (select opening_amount from public.opening_balances_with_current_base('aaaaaaaa-0000-4000-8000-000000000003')),
  990::numeric,
  'opening balances come back for the month'
);

reset role;
set local request.jwt.claims = '';
set local role anon;

select throws_ok($$ select * from public.transactions_feed('aaaaaaaa-0000-4000-8000-000000000002') $$, '42501', null, 'a signed-out caller cannot call RPCs');

select * from finish();
rollback;
