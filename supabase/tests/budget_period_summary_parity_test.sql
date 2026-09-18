-- budget_summary_vs_actual and the app's period summary
-- (src/lib/finance/period-summary.ts) count a category's actuals the same way.
-- The same movements, and the same expected figures, are in the "matches the
-- budget" case of period-summary.test.ts: change both together.
begin;
create extension if not exists pgtap with schema extensions;

select plan(2);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency, initial_amount, initial_base_amount, initial_base_currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Banco', 'bank', 'USD', 1000, 1000, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Caja', 'cash', 'USD', 0, 0, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Euros', 'bank', 'EUR', 0, 0, 'USD');
insert into public.months (id, user_id, year, month) values
  ('aaaaaaaa-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', 2026, 9);
insert into public.budget_categories (id, user_id, category_type, name) values
  ('aaaaaaaa-0000-4000-8000-000000000031', '11111111-1111-4111-8111-111111111111', 'income', 'Parity salary'),
  ('aaaaaaaa-0000-4000-8000-000000000032', '11111111-1111-4111-8111-111111111111', 'essential_expenses', 'Parity groceries'),
  ('aaaaaaaa-0000-4000-8000-000000000033', '11111111-1111-4111-8111-111111111111', 'discretionary_expenses', 'Parity fun');
insert into public.transactions (id, user_id, month_id, category_id, transaction_type, date, description, fee) values
  ('aaaaaaaa-0000-4000-8000-000000000021', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000031', 'income', '2026-09-01', 'Sueldo', 0),
  ('aaaaaaaa-0000-4000-8000-000000000022', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000032', 'expense', '2026-09-02', 'Súper', 0),
  ('aaaaaaaa-0000-4000-8000-000000000023', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000032', 'income', '2026-09-03', 'Devolución', 0),
  ('aaaaaaaa-0000-4000-8000-000000000024', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000033', 'expense', '2026-09-04', 'Cine', 0),
  ('aaaaaaaa-0000-4000-8000-000000000025', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000011', null, 'expense', '2026-09-05', 'Sin categoría', 0),
  ('aaaaaaaa-0000-4000-8000-000000000026', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000011', null, 'transfer', '2026-09-06', 'A caja', 5),
  ('aaaaaaaa-0000-4000-8000-000000000027', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000032', 'correction', '2026-09-07', 'Ajuste súper', 0),
  ('aaaaaaaa-0000-4000-8000-000000000028', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000011', null, 'correction', '2026-09-08', 'Ajuste', 0),
  ('aaaaaaaa-0000-4000-8000-000000000029', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000033', 'expense', '2026-09-05', 'Museo', 0);
insert into public.transaction_amounts (transaction_id, account_id, amount, original_currency, exchange_rate, base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000021', 'aaaaaaaa-0000-4000-8000-000000000001', 2000, 'USD', 1, 2000),
  ('aaaaaaaa-0000-4000-8000-000000000022', 'aaaaaaaa-0000-4000-8000-000000000001', -300, 'USD', 1, -300),
  ('aaaaaaaa-0000-4000-8000-000000000023', 'aaaaaaaa-0000-4000-8000-000000000001', 30, 'USD', 1, 30),
  ('aaaaaaaa-0000-4000-8000-000000000024', 'aaaaaaaa-0000-4000-8000-000000000002', -120, 'USD', 1, -120),
  ('aaaaaaaa-0000-4000-8000-000000000025', 'aaaaaaaa-0000-4000-8000-000000000001', -40, 'USD', 1, -40),
  ('aaaaaaaa-0000-4000-8000-000000000026', 'aaaaaaaa-0000-4000-8000-000000000001', -105, 'USD', 1, -105),
  ('aaaaaaaa-0000-4000-8000-000000000026', 'aaaaaaaa-0000-4000-8000-000000000002', 100, 'USD', 1, 100),
  ('aaaaaaaa-0000-4000-8000-000000000027', 'aaaaaaaa-0000-4000-8000-000000000001', -10, 'USD', 1, -10),
  ('aaaaaaaa-0000-4000-8000-000000000028', 'aaaaaaaa-0000-4000-8000-000000000001', 7, 'USD', 1, 7),
  -- Stored at 1.05 when entered; valued at the day's cached rate, 1.2.
  ('aaaaaaaa-0000-4000-8000-000000000029', 'aaaaaaaa-0000-4000-8000-000000000003', -10, 'EUR', 1.05, -10.5);
insert into public.fx_rates (rate_date, from_currency, to_currency, rate, source) values
  ('2026-09-05', 'EUR', 'USD', 1.2, 'frankfurter'),
  ('2026-09-05', 'EUR', 'USD', 9, 'manual');

-- A movement dated after today takes today's rate, like the app.
insert into public.months (id, user_id, year, month)
select 'aaaaaaaa-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111',
  extract(year from public.app_today() + 40)::int, extract(month from public.app_today() + 40)::int;
insert into public.transactions (id, user_id, month_id, category_id, transaction_type, date, description, fee)
select 'aaaaaaaa-0000-4000-8000-000000000030', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000012',
  'aaaaaaaa-0000-4000-8000-000000000033', 'expense', public.app_today() + 40, 'Cuota', 0;
insert into public.transaction_amounts (transaction_id, account_id, amount, original_currency, exchange_rate, base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000030', 'aaaaaaaa-0000-4000-8000-000000000003', -10, 'EUR', 1.05, -10.5);
insert into public.fx_rates (rate_date, from_currency, to_currency, rate, source)
select public.app_today(), 'EUR', 'USD', 1.3, 'frankfurter';

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select results_eq(
  $$ select category_name, actual_amount
     from public.budget_summary_vs_actual('aaaaaaaa-0000-4000-8000-000000000011', 'USD')
     where category_name like 'Parity %'
     order by category_name $$,
  $$ values ('Parity fun'::text, 132::numeric), ('Parity groceries'::text, 280::numeric), ('Parity salary'::text, 2000::numeric) $$,
  'actuals are signed by the category purpose, count any categorized movement but a transfer, and leave out uncategorized ones'
);

select results_eq(
  $$ select actual_amount
     from public.budget_summary_vs_actual('aaaaaaaa-0000-4000-8000-000000000012', 'USD')
     where category_name = 'Parity fun' $$,
  $$ values (13::numeric) $$,
  'a movement dated after today is valued at today''s rate'
);

select * from finish();
rollback;
