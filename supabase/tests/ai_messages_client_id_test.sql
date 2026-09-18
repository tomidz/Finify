-- ai_messages.client_message_id (0055) is unique within a session, so saving
-- a retried message twice keeps one row; a message only goes into a session
-- of its own user; ai_usage.cache_write_tokens is not negative.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@finify.test'),
  ('22222222-2222-4222-8222-222222222222', 'b@finify.test');
insert into public.ai_sessions (id, user_id, title) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'De B');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
set local role authenticated;

insert into public.ai_sessions (id, user_id, title) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Uno'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Dos');
insert into public.ai_messages (session_id, user_id, role, parts, client_message_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'user', '[]', 'm1');

select throws_ok(
  $$ insert into public.ai_messages (session_id, user_id, role, parts, client_message_id)
     values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'user', '[]', 'm1') $$,
  '23505', null,
  'a message id is saved once per session'
);
select lives_ok(
  $$ insert into public.ai_messages (session_id, user_id, role, parts, client_message_id)
     values ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'user', '[]', 'm1') $$,
  'the same id can exist in another session'
);
select lives_ok(
  $$ insert into public.ai_messages (session_id, user_id, role, parts, client_message_id)
     values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'user', '[1]', 'm1')
     on conflict (session_id, client_message_id) do nothing $$,
  'saving a retried message again, as the app does, is not an error'
);
select is(
  (select parts::text from public.ai_messages
   where session_id = 'aaaaaaaa-0000-4000-8000-000000000001' and client_message_id = 'm1'),
  '[]',
  'and keeps the first row'
);
select throws_ok(
  $$ insert into public.ai_messages (session_id, user_id, role, parts, client_message_id)
     values ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'user', '[]', 'x') $$,
  '42501', null,
  'a message cannot go into another user''s session'
);
select lives_ok(
  $$ insert into public.ai_messages (session_id, user_id, role, parts)
     values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'assistant', '[]'),
            ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'assistant', '[]') $$,
  'messages without an id, like the ones saved before 0055, do not collide'
);
select throws_ok(
  $$ insert into public.ai_usage (user_id, model, cache_write_tokens)
     values ('11111111-1111-4111-8111-111111111111', 'claude-opus-5', -1) $$,
  '23514', null,
  'cache writes are not negative'
);

select * from finish();
rollback;
