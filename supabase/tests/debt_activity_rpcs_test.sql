-- record_debt_payment(), record_debt_adjustment() and reverse_debt_activity()
-- (0046) change a debt's monthly balances from the activity's month on, in one
-- database transaction with the payment's expense, and undo exactly that.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency, initial_amount, initial_base_amount, initial_base_currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Banco', 'bank', 'USD', 1000, 1000, 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Pesos', 'bank', 'ARS', 0, 0, 'USD');
insert into public.budget_categories (id, user_id, category_type, name) values
  ('aaaaaaaa-0000-4000-8000-000000000031', '11111111-1111-4111-8111-111111111111', 'essential_expenses', 'Deudas');
insert into public.nw_items (id, user_id, name, side, currency) values
  ('aaaaaaaa-0000-4000-8000-000000000041', '11111111-1111-4111-8111-111111111111', 'Tarjeta', 'liability', 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000042', '11111111-1111-4111-8111-111111111111', 'Préstamo', 'liability', 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000043', '11111111-1111-4111-8111-111111111111', 'Préstamo auto', 'liability', 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000044', '11111111-1111-4111-8111-111111111111', 'Tarjeta saldada', 'liability', 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000045', '11111111-1111-4111-8111-111111111111', 'Préstamo viejo', 'liability', 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000046', '11111111-1111-4111-8111-111111111111', 'Préstamo reciente', 'liability', 'USD'),
  ('bbbbbbbb-0000-4000-8000-000000000041', '22222222-2222-4222-8222-222222222222', 'Ajena', 'liability', 'USD');
insert into public.nw_snapshots (nw_item_id, year, month, amount, amount_base) values
  ('aaaaaaaa-0000-4000-8000-000000000041', 2026, 1, 500, 500),
  ('aaaaaaaa-0000-4000-8000-000000000041', 2026, 3, 400, 400),
  ('aaaaaaaa-0000-4000-8000-000000000043', 2026, 1, 1000, 1000),
  ('aaaaaaaa-0000-4000-8000-000000000044', 2026, 1, 0, 0);

-- Balances written by the previous app, with the time each row was created.
insert into public.nw_snapshots (nw_item_id, year, month, amount, amount_base, created_at) values
  ('aaaaaaaa-0000-4000-8000-000000000042', 2026, 1, 900, 900, '2026-01-01'),
  ('aaaaaaaa-0000-4000-8000-000000000042', 2026, 2, 900, 900, '2026-01-01'),
  -- A February payment recorded in June created February; April was later
  -- carried forward from it, August from May, which already existed.
  ('aaaaaaaa-0000-4000-8000-000000000045', 2026, 1, 1000, 1000, '2026-01-01'),
  ('aaaaaaaa-0000-4000-8000-000000000045', 2026, 2, 900, 900, '2026-06-01 00:00:01+00'),
  ('aaaaaaaa-0000-4000-8000-000000000045', 2026, 4, 900, 900, '2026-06-15'),
  ('aaaaaaaa-0000-4000-8000-000000000045', 2026, 5, 1000, 1000, '2026-01-01'),
  ('aaaaaaaa-0000-4000-8000-000000000045', 2026, 8, 1000, 1000, '2026-08-01'),
  -- A February payment recorded once payments lowered later months.
  ('aaaaaaaa-0000-4000-8000-000000000046', 2026, 1, 1000, 1000, '2026-01-01'),
  ('aaaaaaaa-0000-4000-8000-000000000046', 2026, 2, 900, 900, '2026-07-05 17:30:00.001+00'),
  ('aaaaaaaa-0000-4000-8000-000000000046', 2026, 3, 900, 900, '2026-01-01');

-- Payments recorded before 0046: no stored changes.
insert into public.months (id, user_id, year, month) values
  ('aaaaaaaa-0000-4000-8000-000000000061', '11111111-1111-4111-8111-111111111111', 2026, 1),
  ('aaaaaaaa-0000-4000-8000-000000000062', '11111111-1111-4111-8111-111111111111', 2026, 2);
insert into public.transactions (id, user_id, month_id, category_id, transaction_type, date, description) values
  ('aaaaaaaa-0000-4000-8000-000000000051', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000061',
   'aaaaaaaa-0000-4000-8000-000000000031', 'expense', '2026-01-15', 'Cuota'),
  ('aaaaaaaa-0000-4000-8000-000000000052', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000061',
   'aaaaaaaa-0000-4000-8000-000000000031', 'expense', '2026-01-20', 'Cuota en pesos'),
  ('aaaaaaaa-0000-4000-8000-000000000053', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000061',
   'aaaaaaaa-0000-4000-8000-000000000031', 'expense', '2026-01-25', 'Última cuota'),
  ('aaaaaaaa-0000-4000-8000-000000000054', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000062',
   'aaaaaaaa-0000-4000-8000-000000000031', 'expense', '2026-02-10', 'Cuota vieja'),
  ('aaaaaaaa-0000-4000-8000-000000000055', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000062',
   'aaaaaaaa-0000-4000-8000-000000000031', 'expense', '2026-02-10', 'Cuota reciente');
insert into public.transaction_amounts (transaction_id, account_id, amount, original_currency, exchange_rate, base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000051', 'aaaaaaaa-0000-4000-8000-000000000001', -100, 'USD', 1, -100),
  ('aaaaaaaa-0000-4000-8000-000000000052', 'aaaaaaaa-0000-4000-8000-000000000002', -100000, 'ARS', 0.001, -100),
  ('aaaaaaaa-0000-4000-8000-000000000053', 'aaaaaaaa-0000-4000-8000-000000000001', -100, 'USD', 1, -100),
  ('aaaaaaaa-0000-4000-8000-000000000054', 'aaaaaaaa-0000-4000-8000-000000000001', -100, 'USD', 1, -100),
  ('aaaaaaaa-0000-4000-8000-000000000055', 'aaaaaaaa-0000-4000-8000-000000000001', -100, 'USD', 1, -100);
insert into public.debt_activities (id, nw_item_id, transaction_id, activity_type, date, amount, amount_base, description, created_at) values
  ('aaaaaaaa-0000-4000-8000-000000000071', 'aaaaaaaa-0000-4000-8000-000000000042', 'aaaaaaaa-0000-4000-8000-000000000051',
   'payment', '2026-01-15', 100, 100, 'Cuota', '2026-02-01'),
  ('aaaaaaaa-0000-4000-8000-000000000072', 'aaaaaaaa-0000-4000-8000-000000000042', 'aaaaaaaa-0000-4000-8000-000000000052',
   'payment', '2026-01-20', 100000, 100, 'Cuota en pesos', '2026-02-01'),
  ('aaaaaaaa-0000-4000-8000-000000000073', 'aaaaaaaa-0000-4000-8000-000000000044', 'aaaaaaaa-0000-4000-8000-000000000053',
   'payment', '2026-01-25', 100, 100, 'Última cuota', '2026-02-01'),
  ('aaaaaaaa-0000-4000-8000-000000000074', 'aaaaaaaa-0000-4000-8000-000000000045', 'aaaaaaaa-0000-4000-8000-000000000054',
   'payment', '2026-02-10', 100, 100, 'Cuota vieja', '2026-06-01 00:00:00+00'),
  ('aaaaaaaa-0000-4000-8000-000000000075', 'aaaaaaaa-0000-4000-8000-000000000046', 'aaaaaaaa-0000-4000-8000-000000000055',
   'payment', '2026-02-10', 100, 100, 'Cuota reciente', '2026-07-05 17:30:00+00');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ select public.record_debt_payment(
       'aaaaaaaa-0000-4000-8000-000000000041',
       '{"transaction_type":"expense","date":"2026-02-10","description":"Pago tarjeta","category_id":"aaaaaaaa-0000-4000-8000-000000000031"}',
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-100,"base_amount":-100,"exchange_rate":1}',
       100, 1) $$,
  'a payment is recorded'
);
select results_eq(
  $$ select year * 100 + month, amount, amount_base from public.nw_snapshots
     where nw_item_id = 'aaaaaaaa-0000-4000-8000-000000000041' order by 1 $$,
  $$ values (202601, 500::numeric, 500::numeric), (202602, 400::numeric, 400::numeric), (202603, 300::numeric, 300::numeric) $$,
  'the payment lowers its month, carried in, and every later month'
);
select is(
  (select count(*) from public.debt_activities d
   join public.transactions t on t.id = d.transaction_id and t.deleted_at is null
   where d.nw_item_id = 'aaaaaaaa-0000-4000-8000-000000000041' and d.snapshot_changes is not null),
  1::bigint,
  'the activity is linked to its expense and stores its changes'
);

select throws_ok(
  $$ select public.record_debt_payment(
       'bbbbbbbb-0000-4000-8000-000000000041',
       '{"transaction_type":"expense","date":"2026-02-10","description":"Ajena","category_id":"aaaaaaaa-0000-4000-8000-000000000031"}',
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-10,"base_amount":-10}',
       10, 1) $$,
  'P0001', 'Deuda no encontrada',
  'a payment cannot touch another user''s debt'
);
select throws_ok(
  $$ select public.record_debt_payment(
       'aaaaaaaa-0000-4000-8000-000000000041',
       '{"transaction_type":"expense","date":"2026-02-11","description":"Signo","category_id":"aaaaaaaa-0000-4000-8000-000000000031"}',
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":10,"base_amount":10}',
       10, 1) $$,
  'P0001', 'Un gasto tiene que ser negativo',
  'an invalid expense is rejected'
);

select lives_ok(
  $$ select public.record_debt_adjustment('aaaaaaaa-0000-4000-8000-000000000041', 'interest', '2026-02-20', 50, 1) $$,
  'interest is recorded'
);
select results_eq(
  $$ select year * 100 + month, amount from public.nw_snapshots
     where nw_item_id = 'aaaaaaaa-0000-4000-8000-000000000041' order by 1 $$,
  $$ values (202601, 500::numeric), (202602, 450::numeric), (202603, 350::numeric) $$,
  'interest raises its month and every later month'
);

select lives_ok(
  $$ select public.record_debt_payment(
       'aaaaaaaa-0000-4000-8000-000000000041',
       '{"transaction_type":"expense","date":"2026-03-05","description":"Pago grande","category_id":"aaaaaaaa-0000-4000-8000-000000000031"}',
       '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-1000,"base_amount":-1000}',
       1000, 1) $$,
  'a payment larger than the balance is recorded'
);
select is(
  (select amount from public.nw_snapshots
   where nw_item_id = 'aaaaaaaa-0000-4000-8000-000000000041' and year = 2026 and month = 3),
  0::numeric,
  'it takes the balance to 0, not below'
);
select lives_ok(
  $$ select public.reverse_debt_activity((select id from public.debt_activities where description = 'Pago grande')) $$,
  'the larger payment is reversed'
);
select results_eq(
  $$ select year * 100 + month, amount, amount_base from public.nw_snapshots
     where nw_item_id = 'aaaaaaaa-0000-4000-8000-000000000041' order by 1 $$,
  $$ values (202601, 500::numeric, 500::numeric), (202602, 450::numeric, 450::numeric), (202603, 350::numeric, 350::numeric) $$,
  'reversing it restores what it changed, not what it asked for'
);

select lives_ok(
  $$ select public.reverse_debt_activity((select id from public.debt_activities where description = 'Pago tarjeta')) $$,
  'an earlier payment is reversed after later activity'
);
select results_eq(
  $$ select year * 100 + month, amount from public.nw_snapshots
     where nw_item_id = 'aaaaaaaa-0000-4000-8000-000000000041' order by 1 $$,
  $$ values (202601, 500::numeric), (202602, 550::numeric), (202603, 450::numeric) $$,
  'the later interest stays'
);
select is(
  (select deleted_at is not null from public.transactions where description = 'Pago tarjeta'),
  true,
  'the reversed payment''s expense is deleted'
);

-- A later payment creates its month from the one the first payment changed.
do $$ begin
  perform public.record_debt_payment(
    'aaaaaaaa-0000-4000-8000-000000000043',
    '{"transaction_type":"expense","date":"2026-08-10","description":"Cuota agosto","category_id":"aaaaaaaa-0000-4000-8000-000000000031"}',
    '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-100,"base_amount":-100}',
    100, 1);
  perform public.record_debt_payment(
    'aaaaaaaa-0000-4000-8000-000000000043',
    '{"transaction_type":"expense","date":"2026-09-10","description":"Cuota septiembre","category_id":"aaaaaaaa-0000-4000-8000-000000000031"}',
    '{"account_id":"aaaaaaaa-0000-4000-8000-000000000001","amount":-100,"base_amount":-100}',
    100, 1);
end $$;
select lives_ok(
  $$ select public.reverse_debt_activity((select id from public.debt_activities where description = 'Cuota agosto')) $$,
  'the earlier of two payments is reversed'
);
select results_eq(
  $$ select year * 100 + month, amount from public.nw_snapshots
     where nw_item_id = 'aaaaaaaa-0000-4000-8000-000000000043' order by 1 $$,
  $$ values (202601, 1000::numeric), (202608, 1000::numeric), (202609, 900::numeric) $$,
  'the month the later payment created from it is corrected too'
);

select lives_ok(
  $$ select public.reverse_debt_activity('aaaaaaaa-0000-4000-8000-000000000071') $$,
  'a payment recorded before 0046 from an account in the debt''s currency is reversed'
);
select results_eq(
  $$ select year * 100 + month, amount from public.nw_snapshots
     where nw_item_id = 'aaaaaaaa-0000-4000-8000-000000000042' order by 1 $$,
  $$ values (202601, 1000::numeric), (202602, 900::numeric) $$,
  'its amount goes back on its month, not on a later month that already existed'
);
select lives_ok(
  $$ select public.reverse_debt_activity('aaaaaaaa-0000-4000-8000-000000000074') $$,
  'a backdated payment recorded before payments lowered later months is reversed'
);
select results_eq(
  $$ select year * 100 + month, amount from public.nw_snapshots
     where nw_item_id = 'aaaaaaaa-0000-4000-8000-000000000045' order by 1 $$,
  $$ values (202601, 1000::numeric), (202602, 1000::numeric), (202604, 1000::numeric), (202605, 1000::numeric), (202608, 1000::numeric) $$,
  'it goes back on its month and the months carried forward from it, up to a month that already existed'
);
select lives_ok(
  $$ select public.reverse_debt_activity('aaaaaaaa-0000-4000-8000-000000000075') $$,
  'a backdated payment recorded once payments lowered later months is reversed'
);
select results_eq(
  $$ select year * 100 + month, amount from public.nw_snapshots
     where nw_item_id = 'aaaaaaaa-0000-4000-8000-000000000046' order by 1 $$,
  $$ values (202601, 1000::numeric), (202602, 1000::numeric), (202603, 1000::numeric) $$,
  'it goes back on every month from its own on'
);
select throws_ok(
  $$ select public.reverse_debt_activity('aaaaaaaa-0000-4000-8000-000000000072') $$,
  'P0001', 'Este pago se hizo desde una cuenta en otra moneda antes de que los pagos se pudieran revertir. Corregí el saldo de la deuda a mano.',
  'a payment recorded before 0046 from an account in another currency is refused'
);
select throws_ok(
  $$ select public.reverse_debt_activity('aaaaaaaa-0000-4000-8000-000000000073') $$,
  'P0001', 'Este pago se registró antes de que los pagos se pudieran revertir y dejó la deuda en 0. Corregí el saldo de la deuda con un ajuste.',
  'a payment recorded before 0046 that may have been clamped at 0 is refused'
);

reset role;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select public.reverse_debt_activity('aaaaaaaa-0000-4000-8000-000000000072') $$,
  'P0001', 'Movimiento no encontrado',
  'another user cannot reverse it'
);

reset role;
set local request.jwt.claims = '';
set local role anon;
select throws_ok(
  $$ select public.reverse_debt_activity('aaaaaaaa-0000-4000-8000-000000000072') $$,
  '42501', null,
  'a signed-out caller cannot reverse anything'
);

select * from finish();
rollback;
