-- AI usage metering and quota extensions are append-only.
--
-- ai_usage rows are inserted by the chat route and only read afterwards.
-- ai_quota_extensions follow fixed rules enforced in the database: at most
-- AI_MAX_DAILY_EXTENSIONS (3) per UTC day, each worth at most
-- AI_DAILY_TOKEN_CAP (300000) tokens, dated today. Both constants live
-- in src/lib/ai/chat-store.ts; raising them there needs a new migration.
--
-- Compatible with the code already deployed, which only inserts and reads.
--
-- Rollback:
--   DROP TRIGGER trg_ai_quota_extensions_rules ON public.ai_quota_extensions;
--   DROP FUNCTION public.enforce_ai_quota_extension_rules();
--   ALTER TABLE public.ai_usage DROP CONSTRAINT ai_usage_non_negative;
--   GRANT UPDATE, DELETE ON public.ai_usage, public.ai_quota_extensions TO anon, authenticated;
--   Replace the four policies below with the FOR ALL policies of 0036 and 0037.

-- ai_usage --------------------------------------------------------------------

DROP POLICY IF EXISTS "Users own ai_usage" ON public.ai_usage;

CREATE POLICY "ai_usage_select_own" ON public.ai_usage
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "ai_usage_insert_own" ON public.ai_usage
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE UPDATE, DELETE ON public.ai_usage FROM anon, authenticated;

-- NOT VALID: applies to new rows without rescanning the history.
ALTER TABLE public.ai_usage
  ADD CONSTRAINT ai_usage_non_negative CHECK (
    input_tokens >= 0
    AND output_tokens >= 0
    AND cached_input_tokens >= 0
    AND cost_usd >= 0
  ) NOT VALID;

-- ai_quota_extensions ---------------------------------------------------------

DROP POLICY IF EXISTS "Users own ai_quota_extensions" ON public.ai_quota_extensions;

CREATE POLICY "ai_quota_extensions_select_own" ON public.ai_quota_extensions
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "ai_quota_extensions_insert_own" ON public.ai_quota_extensions
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE UPDATE, DELETE ON public.ai_quota_extensions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_ai_quota_extension_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.day := (pg_catalog.now() AT TIME ZONE 'utc')::date;

  IF NEW.extra_tokens > 300000 THEN
    RAISE EXCEPTION 'ai_quota_extensions: extra_tokens above the daily cap'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serializes grants per user and day: concurrent inserts would otherwise
  -- all count the same committed rows.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai_quota_extensions:' || NEW.user_id::text || ':' || NEW.day::text, 0)
  );

  IF (
    SELECT pg_catalog.count(*)
    FROM public.ai_quota_extensions e
    WHERE e.user_id = NEW.user_id
      AND e.day = NEW.day
  ) >= 3 THEN
    RAISE EXCEPTION 'ai_quota_extensions: daily extension limit reached'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_quota_extensions_rules ON public.ai_quota_extensions;
CREATE TRIGGER trg_ai_quota_extensions_rules
  BEFORE INSERT ON public.ai_quota_extensions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ai_quota_extension_rules();
