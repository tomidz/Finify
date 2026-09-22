-- pay_with_investment (0057): la venta de la tenencia y el gasto que la
-- consume entran juntos, o no entra ninguno de los dos.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency, initial_amount, initial_base_amount, initial_base_currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Exchange', 'crypto_exchange', 'USD', 0, 0, 'USD');

insert into public.budget_categories (id, user_id, category_type, name) values
  ('aaaaaaaa-0000-4000-8000-000000000031', '11111111-1111-4111-8111-111111111111', 'discretionary_expenses', 'Ropa');

insert into public.investments (id, user_id, account_id, asset_name, ticker, asset_type, quantity, price_per_unit, total_cost, currency, purchase_date) values
  ('aaaaaaaa-0000-4000-8000-000000000021', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001',
   'Tether', 'USDT', 'stablecoin', 100, 1, 100, 'USD', '2026-04-01');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

-- 57,20 USDT se venden a 1 con 0,91 de comisión: entran 56,29 y salen en el gasto.
select lives_ok(
  $$ select public.pay_with_investment(
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","asset_name":"Tether","ticker":"USDT",
         "asset_type":"stablecoin","quantity_sold":57.20,"price_per_unit":1,"total_proceeds":57.20,
         "fees":0.91,"tax":0,"currency":"USD","sale_date":"2026-04-10"}',
       1,
       '{"transaction_type":"expense","date":"2026-04-10","description":"Bershka",
         "category_id":"aaaaaaaa-0000-4000-8000-000000000031","fee":0}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-56.29,"base_amount":-56.29,"exchange_rate":1}]'
     ) $$,
  'a purchase paid with a holding is recorded'
);

select is(
  (select quantity from public.investments where id = 'aaaaaaaa-0000-4000-8000-000000000021'),
  42.80::numeric,
  'the lot is reduced by what was handed over'
);
select is(
  (select round(total_proceeds - fees - tax, 2) from public.investment_sales where ticker = 'USDT'),
  56.29::numeric,
  'the sale nets what the purchase cost'
);
select is(
  (select sum(ta.amount) from public.transaction_amounts ta
   where ta.account_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  0::numeric,
  'the credit of the sale and the expense cancel out in the account'
);
select is(
  (select t.category_id from public.transactions t where t.transaction_type = 'expense'),
  'aaaaaaaa-0000-4000-8000-000000000031'::uuid,
  'the expense keeps its category'
);

-- Una cantidad con los 8 decimales de la columna: el neto acreditado tiene que
-- dar exactamente el gasto, sin dejar un resto en la caja.
select lives_ok(
  $$ select public.pay_with_investment(
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","asset_name":"Tether","ticker":"USDT",
         "asset_type":"stablecoin","quantity_sold":5.00000001,"price_per_unit":1,"total_proceeds":5.00000001,
         "fees":0.50000001,"tax":0,"currency":"USD","sale_date":"2026-04-12"}',
       1,
       '{"transaction_type":"expense","date":"2026-04-12","description":"Kiosco",
         "category_id":"aaaaaaaa-0000-4000-8000-000000000031","fee":0}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-4.50,"base_amount":-4.50,"exchange_rate":1}]'
     ) $$,
  'a payment with eight decimals is recorded'
);
select is(
  (select sum(ta.amount) from public.transaction_amounts ta
   where ta.account_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  0::numeric,
  'the eight-decimal fee leaves no remainder in the account'
);

-- Un gasto sin categoría lo rechaza save_ledger_transaction, y la venta se va con él.
select throws_ok(
  $$ select public.pay_with_investment(
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","asset_name":"Tether","ticker":"USDT",
         "asset_type":"stablecoin","quantity_sold":10,"price_per_unit":1,"total_proceeds":10,
         "fees":0,"tax":0,"currency":"USD","sale_date":"2026-04-11"}',
       1,
       '{"transaction_type":"expense","date":"2026-04-11","description":"Sin categoria","fee":0}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-10,"base_amount":-10,"exchange_rate":1}]'
     ) $$,
  'P0001', 'La categoría es obligatoria',
  'an expense without a category is rejected'
);
select is(
  (select quantity from public.investments where id = 'aaaaaaaa-0000-4000-8000-000000000021'),
  37.79999999::numeric,
  'the rejected payment left the lot untouched'
);
select is(
  (select count(*) from public.investment_sales where sale_date = '2026-04-11'),
  0::bigint,
  'the rejected payment recorded no sale'
);

select * from finish();
rollback;
