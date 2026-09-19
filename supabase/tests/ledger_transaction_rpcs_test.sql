-- save_ledger_transaction() and set_ledger_transaction_deleted() (0045) write a
-- transaction, its legs, its month and the openings from the earliest affected
-- month on in one database transaction, and reject what the ledger cannot
-- hold.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency, initial_amount, initial_base_amount, initial_base_currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Banco A', 'bank', 'USD', 1000, 1000, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Wallet', 'crypto_wallet', 'BTC', 1, 60000, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Exchange', 'crypto_exchange', 'BTC', 0, 0, 'USD'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Banco B', 'bank', 'USD', 0, 0, 'USD');
insert into public.budget_categories (id, user_id, category_type, name) values
  ('aaaaaaaa-0000-4000-8000-000000000031', '11111111-1111-4111-8111-111111111111', 'essential_expenses', 'Supermercado'),
  ('bbbbbbbb-0000-4000-8000-000000000031', '22222222-2222-4222-8222-222222222222', 'essential_expenses', 'Ajena');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"expense","date":"2026-03-10","description":"Super","category_id":"aaaaaaaa-0000-4000-8000-000000000031"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-50,"base_amount":-50,"exchange_rate":1}]') $$,
  'an expense is created'
);
select is(
  (select count(*) from public.months where year = 2026 and month = 3),
  1::bigint,
  'its month is created with it'
);
select is(
  (select ob.opening_amount from public.opening_balances ob join public.months m on m.id = ob.month_id
   where m.year = 2026 and m.month = 3 and ob.account_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  1000::numeric,
  'the new month opens with the account''s initial balance'
);

select throws_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"expense","date":"2026-03-11","description":"Mal","category_id":"aaaaaaaa-0000-4000-8000-000000000031"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":50,"base_amount":50}]') $$,
  'P0001', 'Un gasto tiene que ser negativo',
  'an expense cannot be positive'
);
select throws_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"expense","date":"2026-03-11","description":"Sin categoría"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-5,"base_amount":-5}]') $$,
  'P0001', 'La categoría es obligatoria',
  'an expense needs a category'
);
select throws_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"income","date":"2026-03-11","description":"Ajena","category_id":"aaaaaaaa-0000-4000-8000-000000000031"}',
       '[{"account_id":"bbbbbbbb-0000-4000-8000-000000000001","amount":5,"base_amount":5}]') $$,
  'P0001', 'Cuenta no encontrada',
  'a leg cannot use another user''s account'
);
select throws_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"correction","date":"2026-03-11","description":"Categoría ajena","category_id":"bbbbbbbb-0000-4000-8000-000000000031"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":5,"base_amount":5}]') $$,
  'P0001', 'Categoría no encontrada',
  'a category of another user is rejected, even on a correction'
);
select throws_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"expense","date":"2026-03-11","description":"Signos","category_id":"aaaaaaaa-0000-4000-8000-000000000031"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-5,"base_amount":5}]') $$,
  'P0001', 'El monto base debe tener el mismo signo que el monto',
  'amount and base amount share their sign'
);

select throws_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"transfer","date":"2026-03-12","description":"Redondeada"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000002","amount":-0.12345678,"base_amount":-7407.41},
         {"account_id":"aaaaaaaa-0000-4000-8000-000000000003","amount":0.12,"base_amount":7200}]') $$,
  'P0001', 'En la misma moneda, la cuenta destino recibe exactamente el monto transferido',
  'a same-currency transfer cannot lose units'
);
select throws_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"transfer","date":"2026-03-12","description":"A sí misma"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000002","amount":-0.1,"base_amount":-6000},
         {"account_id":"aaaaaaaa-0000-4000-8000-000000000002","amount":0.1,"base_amount":6000}]') $$,
  'P0001', 'La cuenta origen y destino deben ser diferentes',
  'a transfer needs two different accounts'
);

select lives_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"transfer","date":"2026-03-12","description":"Exacta","fee":"0.00001"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000002","amount":-0.12346678,"base_amount":-7408.01},
         {"account_id":"aaaaaaaa-0000-4000-8000-000000000003","amount":0.12345678,"base_amount":7407.41}]') $$,
  'a same-currency transfer with a crypto fee is created'
);
select is(
  (select fee from public.transactions where description = 'Exacta'),
  0.00001::numeric,
  'the fee keeps its 8 decimals'
);

-- A movement before the first month: openings keep the initial balance.
select lives_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"expense","date":"2025-12-01","description":"Diciembre","category_id":"aaaaaaaa-0000-4000-8000-000000000031"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-20,"base_amount":-20}]') $$,
  'an expense before the first month is created'
);
select results_eq(
  $$ select m.year * 100 + m.month, ob.opening_amount
     from public.opening_balances ob join public.months m on m.id = ob.month_id
     where ob.account_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     order by 1 $$,
  $$ values (202512, 1000::numeric), (202603, 980::numeric) $$,
  'the earlier month opens with the initial balance and later months carry its movement'
);

-- Editing moves the transaction to another month and rebuilds both.
select lives_ok(
  $$ select public.save_ledger_transaction(
       '{"date":"2025-12-20","description":"Super movido","category_id":"aaaaaaaa-0000-4000-8000-000000000031"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-60,"base_amount":-60}]',
       (select id from public.transactions where description = 'Super')) $$,
  'an expense is moved to an earlier month with a new amount'
);
select results_eq(
  $$ select m.year * 100 + m.month, ob.opening_amount
     from public.opening_balances ob join public.months m on m.id = ob.month_id
     where ob.account_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     order by 1 $$,
  $$ values (202512, 1000::numeric), (202603, 920::numeric) $$,
  'both months reflect the edit'
);
select throws_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"income","date":"2025-12-20","description":"Tipo","category_id":"aaaaaaaa-0000-4000-8000-000000000031"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":60,"base_amount":60}]',
       (select id from public.transactions where description = 'Super movido')) $$,
  'P0001', 'No se puede cambiar el tipo de transacción',
  'an edit keeps the type'
);

select lives_ok(
  $$ select public.set_ledger_transaction_deleted((select id from public.transactions where description = 'Diciembre'), true) $$,
  'a transaction is deleted'
);
select is(
  (select ob.opening_amount from public.opening_balances ob join public.months m on m.id = ob.month_id
   where m.year = 2026 and m.month = 3 and ob.account_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  940::numeric,
  'deleting it gives its amount back to later openings'
);
select lives_ok(
  $$ select public.set_ledger_transaction_deleted((select id from public.transactions where description = 'Diciembre'), false) $$,
  'a deleted transaction is restored'
);

select * from finish();
rollback;
