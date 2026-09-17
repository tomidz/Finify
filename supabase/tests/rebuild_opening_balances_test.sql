-- rebuild_opening_balances() (0044): every opening is the account's initial
-- balance plus the non-deleted legs of all earlier months, for active and
-- inactive accounts, whatever month gets created before the first one.
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency, is_active, initial_amount, initial_base_amount, initial_base_currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Banco A', 'bank', 'USD', true, 1000, 1000, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Caja vieja', 'cash', 'USD', false, 50, 50, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Sin saldo inicial', 'bank', 'USD', true, null, null, null);
insert into public.months (id, user_id, year, month) values
  ('aaaaaaaa-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', 2026, 1),
  ('aaaaaaaa-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', 2026, 2),
  ('aaaaaaaa-0000-4000-8000-000000000013', '11111111-1111-4111-8111-111111111111', 2026, 3);
insert into public.transactions (id, user_id, month_id, transaction_type, date, description) values
  ('aaaaaaaa-0000-4000-8000-000000000021', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000011', 'expense', '2026-01-10', 'Enero'),
  ('aaaaaaaa-0000-4000-8000-000000000022', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000012', 'expense', '2026-02-10', 'Febrero'),
  ('aaaaaaaa-0000-4000-8000-000000000023', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000012', 'income', '2026-02-11', 'Caja'),
  ('aaaaaaaa-0000-4000-8000-000000000024', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000012', 'expense', '2026-02-12', 'Borrado');
insert into public.transaction_amounts (transaction_id, account_id, amount, original_currency, exchange_rate, base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000021', 'aaaaaaaa-0000-4000-8000-000000000001', -10, 'USD', 1, -10),
  ('aaaaaaaa-0000-4000-8000-000000000022', 'aaaaaaaa-0000-4000-8000-000000000001', -5, 'USD', 1, -5),
  ('aaaaaaaa-0000-4000-8000-000000000023', 'aaaaaaaa-0000-4000-8000-000000000002', 5, 'USD', 1, 5),
  ('aaaaaaaa-0000-4000-8000-000000000024', 'aaaaaaaa-0000-4000-8000-000000000001', -999, 'USD', 1, -999);
update public.transactions set deleted_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000024';
-- An account the previous app version wrote: openings but no initial balance.
insert into public.opening_balances (month_id, account_id, opening_amount, opening_base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000003', 300, 300);

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select lives_ok($$ select public.rebuild_opening_balances() $$, 'a full rebuild runs');
select results_eq(
  $$ with bank_openings as (
       select m.year * 100 + m.month as code, ob.opening_amount, ob.opening_base_amount
       from public.opening_balances ob
       join public.months m on m.id = ob.month_id
       where ob.account_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     ) select code, opening_amount, opening_base_amount from bank_openings order by code $$,
  $$ values (202601, 1000::numeric, 1000::numeric), (202602, 990::numeric, 990::numeric), (202603, 985::numeric, 985::numeric) $$,
  'openings are the initial balance plus earlier non-deleted legs'
);
select is(
  (select opening_amount from public.opening_balances
   where account_id = 'aaaaaaaa-0000-4000-8000-000000000002' and month_id = 'aaaaaaaa-0000-4000-8000-000000000013'),
  55::numeric,
  'inactive accounts are rebuilt too'
);
select results_eq(
  $$ select a.initial_amount,
            (select ob.opening_amount from public.opening_balances ob
             where ob.account_id = a.id and ob.month_id = 'aaaaaaaa-0000-4000-8000-000000000013')
     from public.accounts a where a.id = 'aaaaaaaa-0000-4000-8000-000000000003' $$,
  $$ values (300::numeric, 300::numeric) $$,
  'an account without a stored initial balance takes it from its earliest opening'
);
select is_empty($$ select * from public.ledger_drift() $$, 'a rebuilt chain has no drift');

select lives_ok($$ select public.rebuild_opening_balances() $$, 'rebuilding again runs');
select results_eq(
  $$ with bank_openings as (
       select m.year * 100 + m.month as code, ob.opening_amount, ob.opening_base_amount
       from public.opening_balances ob
       join public.months m on m.id = ob.month_id
       where ob.account_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     ) select code, opening_amount from bank_openings order by code $$,
  $$ values (202601, 1000::numeric), (202602, 990::numeric), (202603, 985::numeric) $$,
  'rebuilding twice gives the same openings'
);

-- A movement dated before the first month creates an earlier month.
insert into public.months (id, user_id, year, month) values
  ('aaaaaaaa-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111', 2025, 12);
insert into public.transactions (id, user_id, month_id, transaction_type, date, description) values
  ('aaaaaaaa-0000-4000-8000-000000000020', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000010', 'expense', '2025-12-15', 'Diciembre');
insert into public.transaction_amounts (transaction_id, account_id, amount, original_currency, exchange_rate, base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000020', 'aaaaaaaa-0000-4000-8000-000000000001', -20, 'USD', 1, -20);
do $$ begin perform public.rebuild_opening_balances(); end $$;
select results_eq(
  $$ with bank_openings as (
       select m.year * 100 + m.month as code, ob.opening_amount, ob.opening_base_amount
       from public.opening_balances ob
       join public.months m on m.id = ob.month_id
       where ob.account_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     ) select code, opening_amount from bank_openings order by code $$,
  $$ values (202512, 1000::numeric), (202601, 980::numeric), (202602, 970::numeric), (202603, 965::numeric) $$,
  'an earlier month keeps the initial balance instead of resetting it'
);

-- A partial rebuild leaves earlier months alone.
update public.opening_balances set opening_amount = 1 where month_id = 'aaaaaaaa-0000-4000-8000-000000000011' and account_id = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ begin perform public.rebuild_opening_balances('aaaaaaaa-0000-4000-8000-000000000012'); end $$;
select results_eq(
  $$ with bank_openings as (
       select m.year * 100 + m.month as code, ob.opening_amount, ob.opening_base_amount
       from public.opening_balances ob
       join public.months m on m.id = ob.month_id
       where ob.account_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     ) select code, opening_amount from bank_openings where code in (202601, 202602) order by code $$,
  $$ values (202601, 1::numeric), (202602, 970::numeric) $$,
  'rebuilding from a month rewrites that month onward only'
);

reset role;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$ select public.rebuild_opening_balances('aaaaaaaa-0000-4000-8000-000000000012') $$,
  'P0002', null,
  'another user cannot rebuild from A''s month'
);

reset role;
set local request.jwt.claims = '';
set local role anon;
select throws_ok($$ select public.rebuild_opening_balances() $$, '42501', null, 'a signed-out caller cannot rebuild');

select * from finish();
rollback;
