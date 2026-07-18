-- AI CFO chat persistence + usage metering (follow-up to PR #61).
-- Sessions and messages let conversations survive reloads; ai_usage records
-- per-turn token spend so the API route can enforce a fail-closed daily cap
-- and an hourly rate limit before calling the model.

CREATE TABLE IF NOT EXISTS public.ai_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own ai_sessions" ON public.ai_sessions;
CREATE POLICY "Users own ai_sessions" ON public.ai_sessions
  FOR ALL USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_user
  ON public.ai_sessions (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_ai_sessions_updated_at ON public.ai_sessions;
CREATE TRIGGER trg_ai_sessions_updated_at
  BEFORE UPDATE ON public.ai_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.ai_sessions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  parts       JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own ai_messages" ON public.ai_messages;
CREATE POLICY "Users own ai_messages" ON public.ai_messages
  FOR ALL USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_messages_session
  ON public.ai_messages (session_id, created_at);

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id           UUID REFERENCES public.ai_sessions(id) ON DELETE SET NULL,
  model                TEXT NOT NULL,
  input_tokens         INTEGER NOT NULL DEFAULT 0,
  output_tokens        INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd             NUMERIC(10, 4) NOT NULL DEFAULT 0,
  tool_names           TEXT[] NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own ai_usage" ON public.ai_usage;
CREATE POLICY "Users own ai_usage" ON public.ai_usage
  FOR ALL USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created
  ON public.ai_usage (user_id, created_at DESC);
