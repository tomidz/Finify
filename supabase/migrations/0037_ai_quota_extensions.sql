-- Lets a user opt into extra AI tokens for the current day once the daily cap
-- is hit, instead of being hard-blocked until tomorrow. Each row grants one
-- extra allowance; the API route sums the day's rows on top of the base cap.

CREATE TABLE IF NOT EXISTS public.ai_quota_extensions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day           DATE NOT NULL,
  extra_tokens  INTEGER NOT NULL CHECK (extra_tokens > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_quota_extensions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own ai_quota_extensions" ON public.ai_quota_extensions;
CREATE POLICY "Users own ai_quota_extensions" ON public.ai_quota_extensions
  FOR ALL USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_quota_extensions_user_day
  ON public.ai_quota_extensions (user_id, day);
