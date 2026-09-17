-- data_reclassification_backup (0052) keeps the values 0052 replaced, for a
-- rollback. Only the migration and a rollback read it: the app's roles cannot.
begin;
create extension if not exists pgtap with schema extensions;

select plan(2);

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select * from public.data_reclassification_backup $$,
  '42501', null,
  'a signed-in user cannot read the backup'
);

reset role;
set local request.jwt.claims = '';
set local role anon;
select throws_ok(
  $$ select * from public.data_reclassification_backup $$,
  '42501', null,
  'a signed-out caller cannot read the backup'
);

select * from finish();
rollback;
