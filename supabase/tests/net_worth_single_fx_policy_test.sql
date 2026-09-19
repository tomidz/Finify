-- The net worth RPCs (0054) value every balance at its month's close rate: the
-- month's last day, or today for the month in progress. The last month of the
-- evolution is the listed accounts' total minus the debts.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@finify.test');

-- A: pesos loaded at 1000 per dollar and worth 1250 at the close of November,
-- an inactive account with a balance, an inactive one emptied by a round trip,
-- and a broker with a lot in euros.
insert into public.accounts (id, user_id, name, account_type, currency, is_active) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Pesos', 'bank', 'ARS', true),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Dólares', 'bank', 'USD', true),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Euros', 'bank', 'EUR', false),
  ('aaaaaaaa-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Cerrada', 'bank', 'USD', false),
  ('aaaaaaaa-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Broker', 'investment_broker', 'USD', true);
insert into public.months (id, user_id, year, month) values
  ('aaaaaaaa-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', 2024, 10),
  ('aaaaaaaa-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', 2024, 11);
insert into public.months (id, user_id, year, month)
select
  'aaaaaaaa-0000-4000-8000-000000000013',
  '11111111-1111-4111-8111-111111111111',
  extract(year from public.app_today())::int,
  extract(month from public.app_today())::int;
insert into public.opening_balances (month_id, account_id, opening_amount, opening_base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000001', 1000000, 1000),
  ('aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000002', 500, 500),
  ('aaaaaaaa-0000-4000-8000-000000000011', 'aaaaaaaa-0000-4000-8000-000000000003', 100, 105),
  ('aaaaaaaa-0000-4000-8000-000000000012', 'aaaaaaaa-0000-4000-8000-000000000001', 1200000, 1180),
  ('aaaaaaaa-0000-4000-8000-000000000012', 'aaaaaaaa-0000-4000-8000-000000000002', 400, 400),
  ('aaaaaaaa-0000-4000-8000-000000000012', 'aaaaaaaa-0000-4000-8000-000000000003', 100, 105),
  ('aaaaaaaa-0000-4000-8000-000000000013', 'aaaaaaaa-0000-4000-8000-000000000001', 1000000, 1020),
  ('aaaaaaaa-0000-4000-8000-000000000013', 'aaaaaaaa-0000-4000-8000-000000000002', 400, 400),
  ('aaaaaaaa-0000-4000-8000-000000000013', 'aaaaaaaa-0000-4000-8000-000000000003', 100, 105);
insert into public.transactions (id, user_id, month_id, transaction_type, date, description, deleted_at) values
  ('aaaaaaaa-0000-4000-8000-000000000021', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000011', 'correction', '2024-10-15', 'Ingreso', null),
  ('aaaaaaaa-0000-4000-8000-000000000022', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000011', 'correction', '2024-10-20', 'Gasto', null),
  ('aaaaaaaa-0000-4000-8000-000000000023', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000011', 'correction', '2024-10-25', 'Borrado', now()),
  ('aaaaaaaa-0000-4000-8000-000000000024', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000012', 'correction', '2024-11-10', 'Gasto', null),
  ('aaaaaaaa-0000-4000-8000-000000000025', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000012', 'correction', '2024-11-12', 'Ida', null),
  ('aaaaaaaa-0000-4000-8000-000000000026', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000012', 'correction', '2024-11-13', 'Vuelta', null);
insert into public.transaction_amounts (transaction_id, account_id, amount, original_currency, exchange_rate, base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000021', 'aaaaaaaa-0000-4000-8000-000000000001', 200000, 'ARS', 0.0009, 180),
  ('aaaaaaaa-0000-4000-8000-000000000022', 'aaaaaaaa-0000-4000-8000-000000000002', -100, 'USD', 1, -100),
  ('aaaaaaaa-0000-4000-8000-000000000023', 'aaaaaaaa-0000-4000-8000-000000000001', 999, 'ARS', 0.001, 1),
  ('aaaaaaaa-0000-4000-8000-000000000024', 'aaaaaaaa-0000-4000-8000-000000000001', -200000, 'ARS', 0.0008, -160),
  ('aaaaaaaa-0000-4000-8000-000000000025', 'aaaaaaaa-0000-4000-8000-000000000004', 10, 'USD', 1, 10),
  ('aaaaaaaa-0000-4000-8000-000000000026', 'aaaaaaaa-0000-4000-8000-000000000004', -10, 'USD', 1, -10);
insert into public.investments (user_id, account_id, asset_name, ticker, asset_type, quantity, price_per_unit, total_cost, currency, purchase_date) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000005', 'SAP', 'SAP', 'stock', 1, 200, 200, 'EUR', '2024-11-05');
insert into public.nw_items (id, user_id, name, side, currency) values
  ('aaaaaaaa-0000-4000-8000-000000000041', '11111111-1111-4111-8111-111111111111', 'Préstamo', 'liability', 'EUR');
-- The December snapshot is after the year's latest month.
insert into public.nw_snapshots (nw_item_id, year, month, amount, amount_base) values
  ('aaaaaaaa-0000-4000-8000-000000000041', 2024, 10, 50, 52),
  ('aaaaaaaa-0000-4000-8000-000000000041', 2024, 11, 30, 32),
  ('aaaaaaaa-0000-4000-8000-000000000041', 2024, 12, 999, 1000);

-- B: pounds with a rate older than the window (kept at their stored base),
-- francs with one inside it.
insert into public.accounts (id, user_id, name, account_type, currency) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Libras', 'bank', 'GBP'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Dólares', 'bank', 'USD'),
  ('bbbbbbbb-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'Francos', 'bank', 'CHF');
insert into public.months (id, user_id, year, month) values
  ('bbbbbbbb-0000-4000-8000-000000000011', '22222222-2222-4222-8222-222222222222', 2024, 11);
insert into public.opening_balances (month_id, account_id, opening_amount, opening_base_amount) values
  ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000001', 100, 125),
  ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000002', 50, 50),
  ('bbbbbbbb-0000-4000-8000-000000000011', 'bbbbbbbb-0000-4000-8000-000000000003', 10, 11);

insert into public.fx_rates (rate_date, from_currency, to_currency, rate, source) values
  ('2024-10-31', 'ARS', 'USD', 0.001, 'dolarapi'),
  ('2024-10-31', 'EUR', 'USD', 1.05, 'frankfurter'),
  ('2024-11-30', 'ARS', 'USD', 0.0008, 'dolarapi'),
  ('2024-11-30', 'EUR', 'USD', 1.1, 'frankfurter'),
  ('2024-11-20', 'GBP', 'USD', 1.3, 'frankfurter'),
  ('2024-11-27', 'CHF', 'USD', 1.2, 'frankfurter'),
  -- A rate from a source the app does not read for the pair is ignored.
  ('2024-11-30', 'EUR', 'USD', 9, 'manual');
insert into public.fx_rates (rate_date, from_currency, to_currency, rate, source) values
  (public.app_today(), 'ARS', 'USD', 0.0005, 'dolarapi'),
  (public.app_today(), 'EUR', 'USD', 1.2, 'frankfurter');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select results_eq(
  $$ select close_date, balance, balance_base, balance_book_base, balance_fx_missing, balance_fx_rate_date
     from public.account_net_worth_year(2024) where account_name = 'Pesos' $$,
  $$ values ('2024-11-30'::date, 1000000::numeric, 800::numeric, 1020::numeric, false, '2024-11-30'::date) $$,
  'a peso balance is valued at the close-date rate, not at the base amounts stored with its movements'
);
select results_eq(
  $$ select is_active, balance, balance_base, balance_book_base
     from public.account_net_worth_year(2024) where account_name = 'Euros' $$,
  $$ values (false, 100::numeric, 110::numeric, 105::numeric) $$,
  'an inactive account that still holds a balance is listed, and marked'
);
select is_empty(
  $$ select * from public.account_net_worth_year(2024) where account_name = 'Cerrada' $$,
  'an inactive account without a balance or positions is left out'
);
select results_eq(
  $$ select investment_value, investment_value_base, investment_fx_missing, investment_fx_rate_date
     from public.account_net_worth_year(2024) where account_name = 'Broker' $$,
  $$ values (200::numeric, 220::numeric, false, '2024-11-30'::date) $$,
  'positions are valued at the same close-date rate'
);
select results_eq(
  $$ select amount, amount_base, fx_missing, fx_rate_date, close_date from public.liabilities_year(2024) $$,
  $$ values (30::numeric, 33::numeric, false, '2024-11-30'::date, '2024-11-30'::date) $$,
  'a debt is its latest snapshot up to the year''s latest month, at that month''s close rate'
);
select results_eq(
  $$ select month, close_date, assets, liabilities, net_worth, fx_missing
     from public.net_worth_evolution_year(2024) $$,
  $$ values (10, '2024-10-31'::date, 1705::numeric, 52.5::numeric, 1652.5::numeric, false),
            (11, '2024-11-30'::date, 1530::numeric, 33::numeric, 1497::numeric, false) $$,
  'each past month is valued at the rate of its own close'
);
select is(
  (select net_worth from public.net_worth_evolution_year(2024) order by month desc limit 1),
  (select sum(coalesce(balance_base, 0) + coalesce(investment_value_base, 0)) from public.account_net_worth_year(2024))
    - (select coalesce(sum(amount_base), 0) from public.liabilities_year(2024)),
  'the last month of a past year is the listed accounts'' total minus the debts'
);

select results_eq(
  $$ select close_date, balance_base, balance_fx_rate_date
     from public.account_net_worth_year(extract(year from public.app_today())::int)
     where account_name = 'Pesos' $$,
  $$ values (public.app_today(), 500::numeric, public.app_today()) $$,
  'the month in progress is valued at today''s rate'
);
select results_eq(
  $$ select close_date, assets, liabilities, net_worth, fx_missing
     from public.net_worth_evolution_year(extract(year from public.app_today())::int) $$,
  $$ values (public.app_today(), 1260::numeric, 1198.8::numeric, 61.2::numeric, false) $$,
  'the evolution values the month in progress at today''s rate'
);
select is(
  (select net_worth from public.net_worth_evolution_year(extract(year from public.app_today())::int) order by month desc limit 1),
  (select sum(coalesce(balance_base, 0) + coalesce(investment_value_base, 0))
     from public.account_net_worth_year(extract(year from public.app_today())::int))
    - (select coalesce(sum(amount_base), 0) from public.liabilities_year(extract(year from public.app_today())::int)),
  'the month in progress is the listed accounts'' total minus the debts'
);

select results_eq(
  $$ select rate, source from public.fx_rate_asof('2024-11-30', 'EUR', 'USD', 7) $$,
  $$ values (1.1::numeric, 'frankfurter'::text) $$,
  'only the source the app uses for the pair is read'
);
select results_eq(
  $$ select amount, amount_base, close_date from public.liabilities_year(2023) $$,
  $$ values (0::numeric, 0::numeric, '2023-12-31'::date) $$,
  'a year without months closes on its last day'
);

select results_eq(
  $$ select c from public.user_valued_currencies() c order by 1 $$,
  $$ values ('ARS'::text), ('EUR'::text), ('USD'::text) $$,
  'the currencies to value include those of the accounts'
);

reset role;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
set local role authenticated;

select results_eq(
  $$ select balance, balance_base, balance_fx_missing, balance_fx_rate_date
     from public.account_net_worth_year(2024) where account_name = 'Libras' $$,
  $$ values (100::numeric, 125::numeric, true, null::date) $$,
  'a balance without a rate within the window keeps its stored base amount, and is marked'
);
select results_eq(
  $$ select balance_base, balance_fx_rate_date
     from public.account_net_worth_year(2024) where account_name = 'Francos' $$,
  $$ values (12::numeric, '2024-11-27'::date) $$,
  'an older rate within the window comes with its date'
);
select results_eq(
  $$ select assets, fx_missing, cash_fx_missing from public.net_worth_evolution_year(2024) $$,
  $$ values (187::numeric, false, true) $$,
  'the month keeps a balance without a rate at its stored base amount, and is marked'
);

reset role;
set local request.jwt.claims = '';
set local role anon;
select throws_ok(
  $$ select public.app_today() $$,
  '42501', null,
  'a signed-out caller cannot call app_today'
);

select * from finish();
rollback;
