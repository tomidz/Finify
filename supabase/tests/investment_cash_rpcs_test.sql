-- The investment functions of 0047 write lots, sales and position transfers
-- together with the cash they move, or nothing.
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency, initial_amount, initial_base_amount, initial_base_currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Broker', 'investment_broker', 'USD', 10000, 10000, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Broker EUR', 'investment_broker', 'EUR', 0, 0, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Banco', 'bank', 'USD', 0, 0, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Broker 2', 'investment_broker', 'USD', 0, 0, 'USD');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ select public.create_investment(
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","asset_name":"Acme","ticker":"ACME","asset_type":"stock",
         "quantity":10,"price_per_unit":100,"total_cost":1000,"currency":"USD","purchase_date":"2026-04-10"}',
       1) $$,
  'a purchase with cash is created'
);
select results_eq(
  $$ select m.month, ta.amount
     from public.transactions t
     join public.transaction_amounts ta on ta.transaction_id = t.id
     join public.months m on m.id = t.month_id
     where t.source_investment_id = (select id from public.investments where ticker = 'ACME') $$,
  $$ values (4, -1000::numeric) $$,
  'the purchase debits its cost in its month'
);

select lives_ok(
  $$ select public.update_investment(
       (select id from public.investments where ticker = 'ACME'),
       '{"purchase_date":"2026-03-15","total_cost":1200}',
       1) $$,
  'the purchase is moved to an earlier month with a new cost'
);
select results_eq(
  $$ select m.month, ta.amount
     from public.transactions t
     join public.transaction_amounts ta on ta.transaction_id = t.id
     join public.months m on m.id = t.month_id
     where t.source_investment_id = (select id from public.investments where ticker = 'ACME') $$,
  $$ values (3, -1200::numeric) $$,
  'its cash follows it to the new month and cost'
);
select is(
  (select ob.opening_amount from public.opening_balances ob join public.months m on m.id = ob.month_id
   where m.month = 4 and ob.account_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  8800::numeric,
  'the next month opens without the moved cash'
);

select throws_ok(
  $$ select public.update_investment(
       (select id from public.investments where ticker = 'ACME'),
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000002"}',
       1) $$,
  'P0001', 'La cuenta está en EUR y la inversión en USD: la caja no se puede mover en otra moneda. Registrá el movimiento de caja a mano.',
  'a purchase with cash cannot move to an account in another currency'
);
select is(
  (select account_id from public.investments where ticker = 'ACME'),
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
  'the refused move leaves the lot where it was'
);
select throws_ok(
  $$ select public.update_investment(
       (select id from public.investments where ticker = 'ACME'),
       '{"total_cost":1300}') $$,
  'P0001', 'Falta el tipo de cambio para actualizar la caja de esta compra',
  'changing what the cash depends on needs a rate'
);
select lives_ok(
  $$ select public.update_investment(
       (select id from public.investments where ticker = 'ACME'),
       '{"notes":"largo plazo"}') $$,
  'an edit that does not touch the cash needs no rate'
);

select lives_ok(
  $$ select public.record_investment_sale(
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","asset_name":"Acme","ticker":"ACME","asset_type":"stock",
         "quantity_sold":4,"price_per_unit":150,"total_proceeds":600,"fees":10,"tax":0,"currency":"USD","sale_date":"2026-04-20"}',
       1) $$,
  'a sale with cash is recorded'
);
select results_eq(
  $$ select cost_basis, realized_pnl from public.investment_sales $$,
  $$ values (480::numeric, 110::numeric) $$,
  'its cost basis is the cost the reduction removed'
);
select results_eq(
  $$ select quantity, total_cost from public.investments where ticker = 'ACME' $$,
  $$ values (6::numeric, 720::numeric) $$,
  'the lot is reduced'
);
select is(
  (select ta.amount from public.transactions t join public.transaction_amounts ta on ta.transaction_id = t.id
   where t.source_investment_sale_id = (select id from public.investment_sales)),
  590::numeric,
  'the sale credits its proceeds net of fees'
);
select throws_ok(
  $$ select public.record_investment_sale(
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","asset_name":"Acme","ticker":"ACME","asset_type":"stock",
         "quantity_sold":100,"price_per_unit":150,"total_proceeds":15000,"currency":"USD","sale_date":"2026-04-21"}',
       1) $$,
  'P0001', null,
  'selling more than the position is refused'
);
select is((select count(*) from public.investment_sales), 1::bigint, 'the refused sale writes nothing');

select lives_ok(
  $$ select public.delete_investment_sale((select id from public.investment_sales)) $$,
  'the sale is deleted'
);
select results_eq(
  $$ select sum(quantity), sum(total_cost),
            (select count(*) from public.transactions where source_investment_sale_id is not null or description like 'Venta:%')
     from public.investments where ticker = 'ACME' $$,
  $$ values (10::numeric, 1200::numeric, 0::bigint) $$,
  'its lot comes back and its credit goes'
);

select lives_ok(
  $$ select public.delete_investment((select id from public.investments where ticker = 'ACME' and quantity = 6)) $$,
  'a purchase with cash is deleted'
);
select is(
  (select count(*) from public.transactions where description = 'Compra: Acme'),
  0::bigint,
  'its cash goes with it'
);

select throws_ok(
  $$ select public.create_investment(
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000003","asset_name":"Bono","asset_type":"bond",
         "quantity":1,"price_per_unit":100,"total_cost":100,"currency":"USD","purchase_date":"2026-04-10"}',
       1) $$,
  'P0001', 'Solo una cuenta de inversión mueve caja al comprar o vender',
  'a bank account does not move cash for a purchase'
);
select is((select count(*) from public.investments where asset_name = 'Bono'), 0::bigint, 'the refused purchase writes no lot');

select lives_ok(
  $$ select public.transfer_investment_position(
       '{"source_account_id":"aaaaaaaa-0000-4000-8000-000000000001","destination_account_id":"aaaaaaaa-0000-4000-8000-000000000004",
         "asset_name":"Acme","ticker":"ACME","asset_type":"stock","currency":"USD","quantity":4,"fee_quantity":0,"transfer_date":"2026-04-25"}',
       5, 1) $$,
  'a position moves with a cash fee'
);
select results_eq(
  $$ select (select sum(quantity) from public.investments where account_id = 'aaaaaaaa-0000-4000-8000-000000000004'),
            (select ta.amount from public.transactions t join public.transaction_amounts ta on ta.transaction_id = t.id
             where t.description = 'Comisión transferencia Acme' and ta.account_id = 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  $$ values (4::numeric, -5::numeric) $$,
  'the destination holds the position and the source pays the fee'
);

select is_empty($$ select * from public.ledger_drift() $$, 'every opening balance matches after all of it');

select * from finish();
rollback;
