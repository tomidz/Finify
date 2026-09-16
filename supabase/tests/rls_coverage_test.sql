-- Census of the access rules in public: row level security on every table, no
-- write policy that accepts any row, only the expected SECURITY DEFINER
-- functions, and nothing a signed-out caller can execute. A new table or
-- function that skips these fails here instead of in production.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

select is_empty(
  $$
    select c.relname::text
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  $$,
  'every table in public has row level security enabled'
);

select is_empty(
  $$
    select p.tablename || '.' || p.policyname
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (p.qual = 'true' or p.with_check = 'true')
      -- The FX quote cache is shared: the app writes quotes for any signed-in user.
      and not (p.tablename = 'fx_rates' and p.policyname = 'Allow insert on fx_rates')
  $$,
  'no write policy in public accepts every row'
);

select results_eq(
  $$
    select p.proname::text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
    order by 1
  $$,
  $$ values ('handle_new_user'::text) $$,
  'handle_new_user is the only SECURITY DEFINER function in public'
);

select is_empty(
  $$
    select p.oid::regprocedure::text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
  $$,
  'anon cannot execute any function in public'
);

select * from finish();
rollback;
