-- Lot reduction (0038) and transfer (0042) run as the caller and only touch
-- the caller's holdings: a partial sale keeps the proportional cost, selling
-- the whole position removes its lots, and a transfer only lands in an
-- account the caller owns.
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Broker A', 'investment_broker', 'USD'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Broker A2', 'investment_broker', 'USD'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Broker B', 'investment_broker', 'USD');

-- 3 units for 480: two lots.
insert into public.investments (user_id, account_id, asset_name, ticker, asset_type, quantity, price_per_unit, total_cost, currency, purchase_date) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'Apple', 'AAPL', 'stock', 2, 150, 300, 'USD', '2026-01-05'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'Apple', 'AAPL', 'stock', 1, 180, 180, 'USD', '2026-02-05');

-- As B -------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$ select public.reduce_investment_lots('aaaaaaaa-0000-4000-8000-000000000001', 'Apple', 'AAPL', 'stock', 'USD', 1) $$,
  'P0001', null,
  'B cannot sell A''s lots'
);

-- As A -------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select is(
  (select sum(quantity) from public.investments where account_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  3::numeric,
  'A''s holding is untouched'
);

select throws_ok(
  $$ select public.transfer_investment_lots(
       'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
       'Apple', 'AAPL', 'stock', 'USD', 1, 0, '2026-03-01', null) $$,
  'P0001', 'Cuenta destino no encontrada',
  'lots cannot be transferred into another user''s account'
);

select is(
  public.reduce_investment_lots('aaaaaaaa-0000-4000-8000-000000000001', 'Apple', 'AAPL', 'stock', 'USD', 1),
  160::numeric,
  'a partial sale returns the proportional cost'
);
select is(
  (select sum(quantity) from public.investments where account_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  2::numeric,
  'two units remain after selling one'
);
select is(
  (select sum(total_cost) from public.investments where account_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  320::numeric,
  'the remaining lots keep the rest of the cost'
);

select lives_ok(
  $$ select public.transfer_investment_lots(
       'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002',
       'Apple', 'AAPL', 'stock', 'USD', 0.5, 0, '2026-03-01', null) $$,
  'A can transfer lots between its own accounts'
);
select is(
  (select sum(quantity) from public.investments where account_id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  0.5::numeric,
  'the transferred units arrive'
);

select lives_ok(
  $$ select public.reduce_investment_lots('aaaaaaaa-0000-4000-8000-000000000001', 'Apple', 'AAPL', 'stock', 'USD', 1.5) $$,
  'selling the whole remaining position works'
);
select is_empty(
  $$ select id from public.investments where account_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  'selling the whole position removes its lots'
);
select throws_ok(
  $$ select public.reduce_investment_lots('aaaaaaaa-0000-4000-8000-000000000001', 'Apple', 'AAPL', 'stock', 'USD', 1) $$,
  'P0001', null,
  'selling more than the holding fails'
);

select * from finish();
rollback;
