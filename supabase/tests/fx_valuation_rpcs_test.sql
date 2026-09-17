-- fx_rate_asof() (0053) finds a cached rate with its date, and the net worth
-- RPCs leave out, and mark, what has no recent rate instead of valuing it 1:1.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency, initial_amount, initial_base_amount, initial_base_currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Broker EUR', 'investment_broker', 'USD', 0, 0, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Broker CHF', 'investment_broker', 'USD', 0, 0, 'USD');
insert into public.months (user_id, year, month) values
  ('11111111-1111-4111-8111-111111111111', 2026, 1);
insert into public.investments (user_id, account_id, asset_name, ticker, asset_type, quantity, price_per_unit, total_cost, currency, purchase_date) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'SAP', 'SAP', 'stock', 1, 100, 100, 'EUR', '2026-01-05'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000002', 'Nestle', 'NESN', 'stock', 1, 50, 50, 'CHF', '2026-01-05');
insert into public.nw_items (id, user_id, name, side, currency) values
  ('aaaaaaaa-0000-4000-8000-000000000041', '11111111-1111-4111-8111-111111111111', 'Préstamo EUR', 'liability', 'EUR'),
  ('aaaaaaaa-0000-4000-8000-000000000042', '11111111-1111-4111-8111-111111111111', 'Tarjeta GBP', 'liability', 'GBP');
insert into public.nw_snapshots (nw_item_id, year, month, amount, amount_base) values
  ('aaaaaaaa-0000-4000-8000-000000000041', 2026, 1, 200, 210),
  ('aaaaaaaa-0000-4000-8000-000000000042', 2026, 1, 30, 38);
-- EUR has a recent rate; CHF none, and GBP one too old to value at today's
-- rate. A rate dated in the future is not used.
insert into public.fx_rates (rate_date, from_currency, to_currency, rate, source) values
  (current_date - 3, 'EUR', 'USD', 1.1, 'frankfurter'),
  (current_date + 1, 'EUR', 'USD', 1.2, 'frankfurter'),
  (current_date - 10, 'GBP', 'USD', 1.3, 'frankfurter');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select results_eq(
  $$ select rate from public.fx_rate_asof('2026-01-10', 'USD', 'USD') $$,
  $$ values (1::numeric) $$,
  'a currency converts to itself at 1'
);
select results_eq(
  $$ select rate, rate_date from public.fx_rate_asof(current_date, 'EUR', 'USD') $$,
  $$ values (1.1::numeric, current_date - 3) $$,
  'the latest rate on or before the date comes with its date'
);
select is_empty(
  $$ select * from public.fx_rate_asof(current_date, 'EUR', 'USD', 2) $$,
  'a rate older than the maximum age is not returned'
);

select results_eq(
  $$ select investment_value, investment_value_base, investment_fx_missing, investment_fx_rate_date
     from public.account_net_worth_year(2026) where account_name = 'Broker EUR' $$,
  $$ values (100::numeric, 110::numeric, false, current_date - 3) $$,
  'a lot with a rate is valued at it, with the rate''s date'
);
select results_eq(
  $$ select investment_value, investment_value_base, investment_fx_missing
     from public.account_net_worth_year(2026) where account_name = 'Broker CHF' $$,
  $$ values (50::numeric, null::numeric, true) $$,
  'a lot without a rate has no base value, and is marked'
);

select results_eq(
  $$ select name, amount_base, fx_missing from public.liabilities_year(2026) order by name $$,
  $$ values ('Préstamo EUR'::text, 220::numeric, false), ('Tarjeta GBP'::text, null::numeric, true) $$,
  'a debt without a recent rate has no base amount, and is marked, rather than its stored or unconverted amount'
);

select results_eq(
  $$ select c from public.user_valued_currencies() c order by 1 $$,
  $$ values ('CHF'::text), ('EUR'::text), ('GBP'::text) $$,
  'the currencies to value are those of the lots, sales and debts'
);

select results_eq(
  $$ select assets, liabilities, fx_missing from public.net_worth_evolution_year(2026) where month = 1 $$,
  $$ values (110::numeric, 220::numeric, true) $$,
  'the month leaves out what has no rate and is marked'
);

reset role;
set local request.jwt.claims = '';
set local role anon;
select throws_ok(
  $$ select * from public.fx_rate_asof(current_date, 'EUR', 'USD') $$,
  '42501', null,
  'a signed-out caller cannot look rates up'
);

select * from finish();
rollback;
