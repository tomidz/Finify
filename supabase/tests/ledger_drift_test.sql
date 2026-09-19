-- ledger_drift() reports the months whose stored opening differs from the
-- account's initial balance plus the non-deleted legs of all earlier months.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency, initial_amount, initial_base_amount, initial_base_currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Banco A', 'bank', 'USD', 1000, 1000, 'USD');
insert into public.months (id, user_id, year, month) values
  ('aaaaaaaa-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', 2026, 1),
  ('aaaaaaaa-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', 2026, 2),
  ('aaaaaaaa-0000-4000-8000-000000000013', '11111111-1111-4111-8111-111111111111', 2026, 3);
insert into public.opening_balances (month_id, account_id, opening_amount, opening_base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000001', 1000, 1000),
  ('aaaaaaaa-0000-4000-8000-000000000012', 'aaaaaaaa-0000-4000-8000-000000000001', 990, 990),
  ('aaaaaaaa-0000-4000-8000-000000000013', 'aaaaaaaa-0000-4000-8000-000000000001', 985, 985);
insert into public.transactions (id, user_id, month_id, transaction_type, date, description) values
  ('aaaaaaaa-0000-4000-8000-000000000021', '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000011', 'expense', '2026-01-10', 'Enero'),
  ('aaaaaaaa-0000-4000-8000-000000000022', '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000012', 'expense', '2026-02-10', 'Febrero');
insert into public.transaction_amounts (transaction_id, account_id, amount, original_currency, exchange_rate, base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000021', 'aaaaaaaa-0000-4000-8000-000000000001', -10, 'USD', 1, -10),
  ('aaaaaaaa-0000-4000-8000-000000000022', 'aaaaaaaa-0000-4000-8000-000000000001', -5, 'USD', 1, -5);

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select is_empty($$ select * from public.ledger_drift() $$, 'openings that follow the rule have no drift');

update public.transactions set deleted_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000021';
select results_eq(
  $$ select month, stored_opening, derived_opening from public.ledger_drift() $$,
  $$ values (2, 990::numeric, 1000::numeric), (3, 985::numeric, 995::numeric) $$,
  'a deleted movement no longer counts for any later opening'
);
update public.transactions set deleted_at = null where id = 'aaaaaaaa-0000-4000-8000-000000000021';

update public.opening_balances set opening_amount = 900, opening_base_amount = 900
where month_id = 'aaaaaaaa-0000-4000-8000-000000000013';
select results_eq(
  $$ select month, stored_opening, derived_opening, stored_opening_base, derived_opening_base from public.ledger_drift() $$,
  $$ values (3, 900::numeric, 985::numeric, 900::numeric, 985::numeric) $$,
  'a stored opening off the rule shows up with the expected value'
);

update public.accounts set is_active = false where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select results_eq(
  $$ select month, stored_opening, derived_opening from public.ledger_drift() $$,
  $$ values (3, 900::numeric, 985::numeric) $$,
  'inactive accounts are checked too'
);
update public.accounts set is_active = true where id = 'aaaaaaaa-0000-4000-8000-000000000001';
update public.opening_balances set opening_amount = 985, opening_base_amount = 985
where month_id = 'aaaaaaaa-0000-4000-8000-000000000013';

-- A new initial balance whose rebuild did not run: the first month is off too.
update public.accounts set initial_amount = 1200, initial_base_amount = 1200
where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select results_eq(
  $$ select month, stored_opening, derived_opening from public.ledger_drift() $$,
  $$ values (1, 1000::numeric, 1200::numeric), (2, 990::numeric, 1190::numeric), (3, 985::numeric, 1185::numeric) $$,
  'an initial balance that openings do not reflect shows up in every month'
);
update public.accounts set initial_amount = 1000, initial_base_amount = 1000
where id = 'aaaaaaaa-0000-4000-8000-000000000001';

delete from public.opening_balances where month_id = 'aaaaaaaa-0000-4000-8000-000000000012';
select results_eq(
  $$ select month, stored_opening, derived_opening from public.ledger_drift() $$,
  $$ values (2, null::numeric, 990::numeric) $$,
  'a missing opening row is reported as missing, not as zero'
);

reset role;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
set local role authenticated;

select is_empty($$ select * from public.ledger_drift() $$, 'another user sees none of it');

select * from finish();
rollback;
