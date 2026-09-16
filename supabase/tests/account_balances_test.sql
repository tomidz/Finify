-- account_balances() and account_month_balances() (0048) sum every leg of an
-- account in the database, however many there are.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency, initial_amount, initial_base_amount, initial_base_currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Banco', 'bank', 'USD', 100, 100, 'USD');
insert into public.months (id, user_id, year, month) values
  ('aaaaaaaa-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', 2026, 1),
  ('aaaaaaaa-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', 2026, 2);
insert into public.opening_balances (month_id, account_id, opening_amount, opening_base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000001', 100, 100),
  ('aaaaaaaa-0000-4000-8000-000000000012', 'aaaaaaaa-0000-4000-8000-000000000001', 1101, 2102);

-- More legs than one PostgREST response returns, plus a deleted one.
insert into public.transactions (id, user_id, month_id, transaction_type, date, description, deleted_at)
select
  ('aaaaaaaa-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-0000-4000-8000-000000000011',
  'correction',
  '2026-01-15',
  'Leg ' || n,
  case when n = 1002 then now() end
from generate_series(1001, 2002) as n;
insert into public.transaction_amounts (transaction_id, account_id, amount, original_currency, exchange_rate, base_amount)
select
  ('aaaaaaaa-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'aaaaaaaa-0000-4000-8000-000000000001',
  case when n = 1002 then -500 else 1 end,
  'USD',
  1,
  case when n = 1002 then -500 else 2 end
from generate_series(1001, 2002) as n;

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*) from public.transaction_amounts ta join public.transactions t on t.id = ta.transaction_id where t.deleted_at is null),
  1001::bigint,
  'the account has 1001 live legs'
);
select results_eq(
  $$ select account_id, amount, base_amount from public.account_balances(array['aaaaaaaa-0000-4000-8000-000000000001'::uuid]) $$,
  $$ values ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 1101::numeric, 2102::numeric) $$,
  'the balance is the initial balance plus every live leg'
);
select results_eq(
  $$ select year, month, opening_amount, opening_base_amount, movements, base_movements
     from public.account_month_balances('aaaaaaaa-0000-4000-8000-000000000001') $$,
  $$ values (2026, 2, 1101::numeric, 2102::numeric, 0::numeric, 0::numeric),
            (2026, 1, 100::numeric, 100::numeric, 1001::numeric, 2002::numeric) $$,
  'each month has its opening and its live movements, latest first'
);

reset role;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
set local role authenticated;

select is_empty(
  $$ select * from public.account_balances(array['aaaaaaaa-0000-4000-8000-000000000001'::uuid]) $$,
  'another user gets no balance for the account'
);
select is_empty(
  $$ select * from public.account_month_balances('aaaaaaaa-0000-4000-8000-000000000001') $$,
  'another user gets no history for the account'
);

select * from finish();
rollback;
