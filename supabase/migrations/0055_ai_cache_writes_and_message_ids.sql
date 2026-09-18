-- The AI CFO records what prompt caching writes, and keeps each chat message
-- under the id the client gave it, so a retried request saves it once.
--
--   - ai_usage.cache_write_tokens: input tokens written to the prompt cache,
--     billed above the uncached rate. Null on rows recorded before it.
--   - ai_messages.client_message_id: the chat's id for the message, unique
--     within its session. Null on rows recorded before it.
--   - ai_messages policy: a message also goes into a session of its own
--     user (0036 only checked the message's user).
--
-- Compatible with the code already deployed, which sets neither column.
--
-- Rollback:
--   Replace the policy below with the "Users own ai_messages" policy of 0036.
--   DROP INDEX public.ai_messages_session_client_message_key;
--   ALTER TABLE public.ai_messages DROP COLUMN client_message_id;
--   ALTER TABLE public.ai_usage DROP CONSTRAINT ai_usage_cache_write_non_negative;
--   ALTER TABLE public.ai_usage DROP COLUMN cache_write_tokens;

ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS cache_write_tokens integer;

-- NOT VALID: applies to new rows without rescanning the history.
ALTER TABLE public.ai_usage
  ADD CONSTRAINT ai_usage_cache_write_non_negative CHECK (cache_write_tokens >= 0) NOT VALID;

ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS client_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS ai_messages_session_client_message_key
  ON public.ai_messages (session_id, client_message_id);

DROP POLICY IF EXISTS "Users own ai_messages" ON public.ai_messages;
CREATE POLICY "Users own ai_messages" ON public.ai_messages
  FOR ALL USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.ai_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    )
  );
