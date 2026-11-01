-- save_ledger_transaction() (0058) takes an investment movement entered by
-- hand: one leg of either sign, no fee, no category needed.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency, initial_amount, initial_base_amount, initial_base_currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Banco A', 'bank', 'USD', 1000, 1000, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Banco B', 'bank', 'USD', 0, 0, 'USD');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"investment","date":"2026-03-10","description":"Aporte al broker"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-300,"base_amount":-300,"exchange_rate":1}]') $$,
  'money sent to a broker is saved without a category'
);
select lives_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"investment","date":"2026-03-20","description":"Retiro del broker"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":100,"base_amount":100,"exchange_rate":1}]') $$,
  'money back from a broker is saved positive'
);
select is(
  (select sum(ta.amount) from public.transaction_amounts ta
   join public.transactions t on t.id = ta.transaction_id
   where t.transaction_type = 'investment' and t.deleted_at is null),
  -200::numeric,
  'both movements keep their sign'
);
select throws_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"investment","date":"2026-03-11","description":"Dos líneas"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-10,"base_amount":-10},
         {"account_id":"aaaaaaaa-0000-4000-8000-000000000002","amount":10,"base_amount":10}]') $$,
  'P0001', 'Solo se permite una línea para ingreso, gasto, corrección o inversión',
  'an investment movement has one leg'
);
select throws_ok(
  $$ select public.save_ledger_transaction(
       '{"transaction_type":"investment","date":"2026-03-11","description":"Con comisión","fee":"1"}',
       '[{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-10,"base_amount":-10}]') $$,
  'P0001', 'Solo una transferencia tiene comisión',
  'an investment movement has no fee'
);

select * from finish();
rollback;
