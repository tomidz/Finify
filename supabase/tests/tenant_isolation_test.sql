-- A second signed-in user can neither read nor change the first user's data.
-- Reads and updates of foreign rows return nothing; inserts that claim a
-- foreign owner fail the policy check (42501).
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- User A with a small ledger, user B with nothing.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@finify.test');

insert into public.accounts (id, user_id, name, account_type, currency) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Banco A', 'bank', 'USD');
insert into public.months (id, user_id, year, month) values
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 2026, 1),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 2026, 2);
insert into public.opening_balances (month_id, account_id, opening_amount, opening_base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 1000, 1000),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 990, 990);
insert into public.transactions (id, user_id, month_id, transaction_type, date, description) values
  ('aaaaaaaa-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000002', 'expense', '2026-01-10', 'Supermercado');
insert into public.transaction_amounts (transaction_id, account_id, amount, original_currency, exchange_rate, base_amount) values
  ('aaaaaaaa-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001', -10, 'USD', 1, -10);
insert into public.investments (user_id, account_id, asset_name, ticker, asset_type, quantity, price_per_unit, total_cost, currency, purchase_date) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001',
   'Apple', 'AAPL', 'stock', 2, 150, 300, 'USD', '2026-01-05');
insert into public.ai_sessions (id, user_id, title) values
  ('aaaaaaaa-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Chat A');

-- As B -------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
set local role authenticated;

select is_empty(
  $$
    -- Materialized so the per-table count only runs on the tables listed here.
    with owned as materialized (
      select c.table_name::text as table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public'
        and c.column_name = 'user_id'
        and t.table_type = 'BASE TABLE'
    )
    select o.table_name
    from owned o
    where (
      xpath(
        '/row/n/text()',
        query_to_xml(
          format('select count(*) as n from public.%I where user_id = %L',
                 o.table_name, '11111111-1111-4111-8111-111111111111'),
          false, true, ''
        )
      )
    )[1]::text::int > 0
  $$,
  'B reads no row owned by A in any table with a user_id'
);
select is_empty($$ select id from public.opening_balances $$, 'B reads none of A''s opening balances');
select is_empty($$ select id from public.transaction_amounts $$, 'B reads none of A''s transaction legs');

select is_empty(
  $$ update public.accounts set name = 'Tomada' where id = 'aaaaaaaa-0000-4000-8000-000000000001' returning id $$,
  'B cannot rename A''s account'
);
select is_empty(
  $$ delete from public.transactions where id = 'aaaaaaaa-0000-4000-8000-000000000004' returning id $$,
  'B cannot delete A''s transaction'
);
select is_empty(
  $$ update public.opening_balances set opening_amount = 0 returning id $$,
  'B cannot change A''s opening balances'
);
select is_empty($$ delete from public.transaction_amounts returning id $$, 'B cannot delete A''s legs');
select is_empty($$ update public.investments set quantity = 1 returning id $$, 'B cannot change A''s lots');

select throws_ok(
  $$ insert into public.accounts (user_id, name, account_type, currency)
     values ('11111111-1111-4111-8111-111111111111', 'Intrusa', 'bank', 'USD') $$,
  '42501', null,
  'B cannot create an account owned by A'
);
select throws_ok(
  $$ insert into public.opening_balances (month_id, account_id, opening_amount, opening_base_amount)
     values ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 5, 5) $$,
  '42501', null,
  'B cannot write an opening balance into A''s month'
);
select throws_ok(
  $$ insert into public.transaction_amounts (transaction_id, account_id, amount, original_currency, base_amount)
     values ('aaaaaaaa-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001', 5, 'USD', 5) $$,
  '42501', null,
  'B cannot add a leg to A''s transaction'
);
select throws_ok(
  $$ insert into public.ai_messages (session_id, user_id, role, parts)
     values ('aaaaaaaa-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'user', '[]') $$,
  '42501', null,
  'B cannot write an AI message as A'
);

-- As A: the data is there and unchanged ----------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select is(
  (select name from public.accounts where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'Banco A',
  'A''s account is unchanged'
);
select is(
  (select sum(opening_amount) from public.opening_balances),
  1990::numeric,
  'A''s opening balances are unchanged'
);
select is(
  (select count(*) from public.transaction_amounts),
  1::bigint,
  'A''s leg is still there'
);

select * from finish();
rollback;
