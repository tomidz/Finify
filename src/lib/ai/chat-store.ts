import "server-only";

import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const AI_MODEL = "claude-opus-4-8";
export const AI_DAILY_TOKEN_CAP = 300_000;
export const AI_HOURLY_MESSAGE_LIMIT = 30;

// USD per million tokens.
const MODEL_PRICING: Record<
  string,
  { input: number; output: number; cachedInput: number }
> = {
  "claude-opus-4-8": { input: 5, output: 25, cachedInput: 0.5 },
};

export function estimateCostUsd(usage: {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}): number {
  const pricing = MODEL_PRICING[AI_MODEL] ?? MODEL_PRICING["claude-opus-4-8"];
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    (uncachedInput * pricing.input +
      usage.cachedInputTokens * pricing.cachedInput +
      usage.outputTokens * pricing.output) /
    1_000_000
  );
}

export type LimitCheck =
  | { ok: true }
  | { ok: false; status: number; message: string };

// Fail-closed: any query error blocks the turn instead of letting spend
// through unmetered.
export async function checkAiLimits(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<LimitCheck> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const [hourly, daily] = await Promise.all([
    supabase
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", hourAgo),
    supabase
      .from("ai_usage")
      .select("input_tokens, output_tokens")
      .eq("user_id", userId)
      .gte("created_at", dayStart.toISOString()),
  ]);

  if (hourly.error || daily.error) {
    return {
      ok: false,
      status: 503,
      message: "No se pudo verificar el uso de IA. Probá de nuevo.",
    };
  }

  if ((hourly.count ?? 0) >= AI_HOURLY_MESSAGE_LIMIT) {
    return {
      ok: false,
      status: 429,
      message: `Límite de ${AI_HOURLY_MESSAGE_LIMIT} mensajes por hora alcanzado. Esperá un rato.`,
    };
  }

  const tokensToday = (daily.data ?? []).reduce(
    (sum, row) => sum + row.input_tokens + row.output_tokens,
    0,
  );
  if (tokensToday >= AI_DAILY_TOKEN_CAP) {
    return {
      ok: false,
      status: 429,
      message: "Límite diario de tokens de IA alcanzado. Volvé mañana.",
    };
  }

  return { ok: true };
}

export async function ensureAiSession(
  supabase: SupabaseServerClient,
  userId: string,
  sessionId: string,
  title: string,
): Promise<{ error?: string }> {
  const { error } = await supabase.from("ai_sessions").upsert(
    {
      id: sessionId,
      user_id: userId,
      title: title.slice(0, 80),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: false },
  );
  return error ? { error: error.message } : {};
}

export async function saveAiMessage(
  supabase: SupabaseServerClient,
  input: {
    sessionId: string;
    userId: string;
    role: "user" | "assistant";
    parts: unknown;
  },
): Promise<void> {
  await supabase.from("ai_messages").insert({
    session_id: input.sessionId,
    user_id: input.userId,
    role: input.role,
    parts: input.parts as never,
  });
}

// Best-effort: metering must never break the chat response.
export async function logAiUsage(
  supabase: SupabaseServerClient,
  input: {
    userId: string;
    sessionId: string;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    toolNames: string[];
  },
): Promise<void> {
  try {
    await supabase.from("ai_usage").insert({
      user_id: input.userId,
      session_id: input.sessionId,
      model: AI_MODEL,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cached_input_tokens: input.cachedInputTokens,
      cost_usd: estimateCostUsd(input),
      tool_names: input.toolNames,
    });
  } catch {
    // swallow — metering is observability, not control flow
  }
}
