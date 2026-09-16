-- register_recurring_occurrence() (0049) creates one live transaction per
-- occurrence of a recurring template, however many times it is called.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency, initial_amount, initial_base_amount, initial_base_currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Banco', 'bank', 'USD', 0, 0, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Otra', 'bank', 'USD', 0, 0, 'USD');
insert into public.budget_categories (id, user_id, category_type, name) values
  ('aaaaaaaa-0000-4000-8000-000000000031', '11111111-1111-4111-8111-111111111111', 'essential_expenses', 'Servicios');
insert into public.recurring_transactions (id, user_id, description, type, category_id, account_id, amount, currency, recurrence, start_date) values
  ('aaaaaaaa-0000-4000-8000-000000000041', '11111111-1111-4111-8111-111111111111', 'Internet', 'expense',
   'aaaaaaaa-0000-4000-8000-000000000031', 'aaaaaaaa-0000-4000-8000-000000000001', 50, 'USD', 'monthly', '2026-01-01'),
  ('aaaaaaaa-0000-4000-8000-000000000042', '11111111-1111-4111-8111-111111111111', 'Hosting', 'expense',
   'aaaaaaaa-0000-4000-8000-000000000031', 'aaaaaaaa-0000-4000-8000-000000000001', 20, 'EUR', 'monthly', '2026-01-01');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ select public.register_recurring_occurrence('aaaaaaaa-0000-4000-8000-000000000041', '2026-03-05',
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-50,"base_amount":-50,"exchange_rate":1}') $$,
  'an occurrence is registered'
);
select is(
  public.register_recurring_occurrence('aaaaaaaa-0000-4000-8000-000000000041', '2026-03-05',
    '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-50,"base_amount":-50,"exchange_rate":1}'),
  (select id from public.transactions where recurring_id = 'aaaaaaaa-0000-4000-8000-000000000041'),
  'registering it again returns the same transaction'
);
select results_eq(
  $$ select count(*), min(description), min(occurrence_date)
     from public.transactions where recurring_id = 'aaaaaaaa-0000-4000-8000-000000000041' $$,
  $$ values (1::bigint, 'Internet'::text, '2026-03-05'::date) $$,
  'there is one transaction for the occurrence, built from the template'
);

select throws_ok(
  $$ select public.register_recurring_occurrence('aaaaaaaa-0000-4000-8000-000000000042', '2026-03-05',
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-20,"base_amount":-22,"exchange_rate":1.1}') $$,
  'P0001', 'La recurrente está en EUR y su cuenta en USD: corregí la recurrente.',
  'a template in another currency than its account is refused'
);
select throws_ok(
  $$ select public.register_recurring_occurrence('aaaaaaaa-0000-4000-8000-000000000041', '2026-04-05',
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000002","amount":-50,"base_amount":-50}') $$,
  'P0001', 'La cuenta no es la de la recurrente',
  'the leg must use the template''s account'
);

do $$ begin
  perform public.set_ledger_transaction_deleted(
    (select id from public.transactions where recurring_id = 'aaaaaaaa-0000-4000-8000-000000000041'), true);
end $$;
select lives_ok(
  $$ select public.register_recurring_occurrence('aaaaaaaa-0000-4000-8000-000000000041', '2026-03-05',
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-50,"base_amount":-50}') $$,
  'a deleted occurrence can be registered again'
);
select results_eq(
  $$ select count(*) filter (where deleted_at is null), count(*)
     from public.transactions where recurring_id = 'aaaaaaaa-0000-4000-8000-000000000041' $$,
  $$ values (1::bigint, 2::bigint) $$,
  'one live transaction and the deleted one'
);
select throws_ok(
  $$ select public.set_ledger_transaction_deleted(
       (select id from public.transactions
        where recurring_id = 'aaaaaaaa-0000-4000-8000-000000000041' and deleted_at is not null), false) $$,
  '23505', null,
  'restoring the deleted one would register the occurrence twice'
);

reset role;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select public.register_recurring_occurrence('aaaaaaaa-0000-4000-8000-000000000041', '2026-05-05',
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-50,"base_amount":-50}') $$,
  'P0001', 'Recurrente no encontrada',
  'another user cannot register A''s template'
);

select * from finish();
rollback;
