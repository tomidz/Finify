-- The investment functions of 0047 write lots, sales and position transfers
-- together with the cash they move, or nothing.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency, initial_amount, initial_base_amount, initial_base_currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Broker', 'investment_broker', 'USD', 10000, 10000, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Broker EUR', 'investment_broker', 'EUR', 0, 0, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Banco', 'bank', 'USD', 0, 0, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Broker 2', 'investment_broker', 'USD', 0, 0, 'USD');

-- The previous app paid a purchase from any account; this lot has since been
-- partly sold, so its cost (100) is less than what it paid (300).
insert into public.months (id, user_id, year, month) values
  ('aaaaaaaa-0000-4000-8000-000000000061', '11111111-1111-4111-8111-111111111111', 2026, 4);
insert into public.investments (id, user_id, account_id, asset_name, ticker, asset_type, quantity, price_per_unit, total_cost, currency, purchase_date) values
  ('aaaaaaaa-0000-4000-8000-000000000021', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000003',
   'Bono viejo', 'BONO', 'bond', 1, 100, 100, 'USD', '2026-04-05');
insert into public.transactions (id, user_id, month_id, transaction_type, date, description, source_investment_id) values
  ('aaaaaaaa-0000-4000-8000-000000000022', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000061',
   'investment', '2026-04-05', 'Compra: Bono viejo', 'aaaaaaaa-0000-4000-8000-000000000021');
insert into public.transaction_amounts (transaction_id, account_id, amount, original_currency, exchange_rate, base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000022', 'aaaaaaaa-0000-4000-8000-000000000003', -300, 'USD', 1, -300);

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
select throws_ok(
  $$ select public.update_investment(
       (select id from public.investments where ticker = 'ACME'),
       '{"currency":"EUR"}',
       1) $$,
  'P0001', 'La cuenta está en USD y la inversión en EUR: la caja no se puede mover en otra moneda. Registrá el movimiento de caja a mano.',
  'a purchase with cash cannot change to another currency than its account''s'
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
select throws_like(
  $$ select public.record_investment_sale(
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","asset_name":"Acme","ticker":"ACME","asset_type":"stock",
         "quantity_sold":100,"price_per_unit":150,"total_proceeds":15000,"currency":"USD","sale_date":"2026-04-21"}',
       1) $$,
  'No hay cantidad suficiente%',
  'selling more than the position is refused'
);

-- After the sale the lot's cost (720) is no longer what the purchase paid.
select lives_ok(
  $$ select public.update_investment(
       (select id from public.investments where ticker = 'ACME'),
       '{"asset_name":"Acme Corp"}',
       1) $$,
  'the partly sold lot is renamed'
);
select is(
  (select sum(ta.amount) from public.transactions t join public.transaction_amounts ta on ta.transaction_id = t.id
   where t.source_investment_id = (select id from public.investments where ticker = 'ACME')),
  -1200::numeric,
  'the purchase still paid what it paid'
);

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
  (select sum(ta.amount) from public.transactions t join public.transaction_amounts ta on ta.transaction_id = t.id
   where t.description like 'Compra: Acme%'),
  -480::numeric,
  'the cash of what was left goes with it, and the restored 4 units stay paid'
);
select lives_ok(
  $$ select public.delete_investment('aaaaaaaa-0000-4000-8000-000000000021') $$,
  'a partly sold purchase the previous app paid from a bank account is deleted'
);
select is(
  (select sum(ta.amount) from public.transactions t join public.transaction_amounts ta on ta.transaction_id = t.id
   where t.description = 'Compra: Bono viejo' and ta.account_id = 'aaaaaaaa-0000-4000-8000-000000000003'),
  -200::numeric,
  'the cash of what was left of it goes back in that account'
);

select throws_ok(
  $$ select public.create_investment(
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000003","asset_name":"Bono","asset_type":"bond",
         "quantity":1,"price_per_unit":100,"total_cost":100,"currency":"USD","purchase_date":"2026-04-10"}',
       1) $$,
  'P0001', 'Solo una cuenta de inversión mueve caja al comprar o vender',
  'a bank account does not move cash for a purchase'
);

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
