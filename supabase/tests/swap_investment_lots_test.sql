-- swap_investment_lots() (0051) exchanges one asset for another at market
-- value without touching the account's cash, and deleting the swap's sale
-- undoes it whole.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency, initial_amount, initial_base_amount, initial_base_currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Exchange', 'crypto_exchange', 'USD', 0, 0, 'USD'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Ajena', 'crypto_exchange', 'USD', 0, 0, 'USD');
insert into public.investments (user_id, account_id, asset_name, ticker, asset_type, quantity, price_per_unit, total_cost, currency, purchase_date) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'Tether', 'USDT', 'stablecoin', 10000, 0.95, 9500, 'USD', '2026-01-10');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ select public.swap_investment_lots(
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","date":"2026-08-10","value":6000,
         "given":{"asset_name":"Tether","ticker":"USDT","asset_type":"stablecoin","currency":"USD","quantity":6000},
         "received":{"asset_name":"Bitcoin","ticker":"BTC","asset_type":"crypto","currency":"USD","quantity":0.1},
         "fee_quantity":0.001,"fee_asset":"received"}') $$,
  'USDT is swapped for BTC'
);
select results_eq(
  $$ select quantity, total_cost from public.investments where ticker = 'USDT' $$,
  $$ values (4000::numeric, 3800::numeric) $$,
  'the asset given is reduced'
);
select results_eq(
  $$ select quantity, total_cost from public.investments where ticker = 'BTC' $$,
  $$ values (0.099::numeric, 6000::numeric) $$,
  'the asset received costs the swap''s value, less the fee in units'
);
select results_eq(
  $$ select quantity_sold, total_proceeds, cost_basis, realized_pnl from public.investment_sales $$,
  $$ values (6000::numeric, 6000::numeric, 5700::numeric, 300::numeric) $$,
  'the asset given is sold at the swap''s value, realizing its gain'
);
select is_empty(
  $$ select 1 from public.transactions $$,
  'no cash moves'
);

select lives_ok(
  $$ select public.swap_investment_lots(
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","date":"2026-08-11","value":4200,
         "given":{"asset_name":"Tether","ticker":"USDT","asset_type":"stablecoin","currency":"USD","quantity":3990},
         "received":{"asset_name":"Ether","ticker":"ETH","asset_type":"crypto","currency":"USD","quantity":1},
         "fee_quantity":10,"fee_asset":"given"}') $$,
  'a swap with the fee in the asset given uses up the whole position'
);
select results_eq(
  $$ select (select count(*) from public.investments where ticker = 'USDT'),
            (select cost_basis from public.investment_sales where quantity_sold = 4000) $$,
  $$ values (0::bigint, 3800::numeric) $$,
  'the fee leaves with the asset given and its cost is in the sale'
);

select throws_like(
  $$ select public.swap_investment_lots(
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","date":"2026-08-12","value":100,
         "given":{"asset_name":"Bitcoin","ticker":"BTC","asset_type":"crypto","currency":"USD","quantity":5},
         "received":{"asset_name":"Ether","ticker":"ETH","asset_type":"crypto","currency":"USD","quantity":1}}') $$,
  'No hay cantidad suficiente%',
  'more than the position cannot be swapped'
);
select throws_ok(
  $$ select public.swap_investment_lots(
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","date":"2026-08-12","value":100,
         "given":{"asset_name":"Bitcoin","ticker":"BTC","asset_type":"crypto","currency":"USD","quantity":0.01},
         "received":{"asset_name":"Euro Coin","ticker":"EURC","asset_type":"stablecoin","currency":"EUR","quantity":90}}') $$,
  'P0001', 'Los dos activos tienen que estar en la misma moneda',
  'both assets are in the same currency'
);
select throws_ok(
  $$ select public.swap_investment_lots(
       '{"account_id":"bbbbbbbb-0000-4000-8000-000000000001","date":"2026-08-12","value":100,
         "given":{"asset_name":"Bitcoin","ticker":"BTC","asset_type":"crypto","currency":"USD","quantity":0.01},
         "received":{"asset_name":"Ether","ticker":"ETH","asset_type":"crypto","currency":"USD","quantity":1}}') $$,
  'P0001', 'Cuenta no encontrada',
  'another user''s account cannot be used'
);

select throws_ok(
  $$ select public.delete_investment((select id from public.investments where ticker = 'BTC')) $$,
  'P0001', 'Este activo viene de un intercambio. Para deshacerlo, eliminá el intercambio en el historial de ventas.',
  'the lot a swap bought is not deleted on its own'
);

do $$ begin
  perform public.record_investment_sale(
    '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","asset_name":"Ether","ticker":"ETH","asset_type":"crypto",
      "quantity_sold":0.5,"price_per_unit":4400,"total_proceeds":2200,"currency":"USD","sale_date":"2026-08-20"}');
end $$;
select throws_ok(
  $$ select public.delete_investment_sale((select id from public.investment_sales where notes = 'Intercambio por Ether')) $$,
  'P0001', 'Lo que recibiste en este intercambio ya se vendió, transfirió o editó: el intercambio no se puede deshacer.',
  'a swap whose lot was partly sold cannot be undone'
);
select lives_ok(
  $$ select public.delete_investment((select id from public.investments where ticker = 'ETH')) $$,
  'what is left of that lot can be deleted'
);

select lives_ok(
  $$ select public.delete_investment_sale((select id from public.investment_sales where notes = 'Intercambio por Bitcoin')) $$,
  'deleting a swap''s sale undoes the swap'
);
select results_eq(
  $$ select (select count(*) from public.investments where ticker = 'BTC'),
            (select sum(quantity) from public.investments where ticker = 'USDT'),
            (select sum(total_cost) from public.investments where ticker = 'USDT') $$,
  $$ values (0::bigint, 6000::numeric, 5700::numeric) $$,
  'the lot bought goes and the asset given comes back at its cost'
);

select * from finish();
rollback;
