-- AI usage metering and quota extensions (0041): rows are only inserted and
-- read, extensions follow the daily rules, and deleting a conversation keeps
-- its usage.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@finify.test');
insert into public.ai_sessions (id, user_id, title) values
  ('aaaaaaaa-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Chat A');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.ai_usage (user_id, session_id, model, input_tokens, output_tokens)
     values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000005', 'test-model', 1000, 200) $$,
  'a user records its own usage'
);
select throws_ok(
  $$ insert into public.ai_usage (user_id, model, input_tokens) values ('22222222-2222-4222-8222-222222222222', 'test-model', 1) $$,
  '42501', null,
  'usage cannot be recorded for another user'
);
select throws_ok(
  $$ insert into public.ai_usage (user_id, model, input_tokens) values ('11111111-1111-4111-8111-111111111111', 'test-model', -500) $$,
  '23514', null,
  'negative token counts are rejected'
);
select throws_ok($$ update public.ai_usage set input_tokens = 0 $$, '42501', null, 'usage cannot be edited');
select throws_ok($$ delete from public.ai_usage $$, '42501', null, 'usage cannot be deleted');

select throws_ok(
  $$ insert into public.ai_quota_extensions (user_id, day, extra_tokens) values ('11111111-1111-4111-8111-111111111111', current_date, 999999) $$,
  '23514', null,
  'an extension cannot grant more than the daily cap'
);
select lives_ok(
  $$ insert into public.ai_quota_extensions (user_id, day, extra_tokens) values ('11111111-1111-4111-8111-111111111111', '2000-01-01', 300000) $$,
  'first extension of the day'
);
select lives_ok(
  $$ insert into public.ai_quota_extensions (user_id, day, extra_tokens) values ('11111111-1111-4111-8111-111111111111', current_date, 300000) $$,
  'second extension of the day'
);
select lives_ok(
  $$ insert into public.ai_quota_extensions (user_id, day, extra_tokens) values ('11111111-1111-4111-8111-111111111111', current_date, 300000) $$,
  'third extension of the day'
);
select throws_ok(
  $$ insert into public.ai_quota_extensions (user_id, day, extra_tokens) values ('11111111-1111-4111-8111-111111111111', current_date, 300000) $$,
  '23514', null,
  'a fourth extension on the same day is rejected'
);
select is(
  (select bool_and(day = (now() at time zone 'utc')::date) from public.ai_quota_extensions),
  true,
  'every extension is dated today in UTC, whatever day the client sent'
);
select throws_ok($$ delete from public.ai_quota_extensions $$, '42501', null, 'extensions cannot be deleted');

select lives_ok(
  $$ delete from public.ai_sessions where id = 'aaaaaaaa-0000-4000-8000-000000000005' $$,
  'a user can delete its conversation'
);
select is(
  (select count(*) from public.ai_usage where session_id is null and input_tokens = 1000),
  1::bigint,
  'the conversation''s usage stays, without the session'
);

select * from finish();
rollback;
