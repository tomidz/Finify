import "server-only";

import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const AI_MODEL = "claude-opus-4-8";
export const AI_DAILY_TOKEN_CAP = 300_000;
export const AI_HOURLY_MESSAGE_LIMIT = 30;
// Each extension grants another AI_DAILY_TOKEN_CAP for the same UTC day.
export const AI_MAX_DAILY_EXTENSIONS = 3;

export function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

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

export type AiUsageStatus = {
  tokensToday: number;
  dailyCap: number;
  messagesLastHour: number;
  hourlyLimit: number;
  extensionsToday: number;
  maxExtensions: number;
};

export type AiLimitCode =
  | "usage_check_failed"
  | "hourly_message_limit"
  | "daily_token_cap";

export type LimitCheck =
  | { ok: true; usage: AiUsageStatus }
  | {
      ok: false;
      status: number;
      code: AiLimitCode;
      message: string;
      usage?: AiUsageStatus;
    };

export async function getAiUsageStatus(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<AiUsageStatus | null> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const [hourly, daily, extensions] = await Promise.all([
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
    supabase
      .from("ai_quota_extensions")
      .select("extra_tokens")
      .eq("user_id", userId)
      .eq("day", utcDayKey()),
  ]);

  if (hourly.error || daily.error || extensions.error) return null;

  const extensionRows = extensions.data ?? [];
  return {
    tokensToday: (daily.data ?? []).reduce(
      (sum, row) => sum + row.input_tokens + row.output_tokens,
      0,
    ),
    dailyCap:
      AI_DAILY_TOKEN_CAP +
      extensionRows.reduce((sum, row) => sum + row.extra_tokens, 0),
    messagesLastHour: hourly.count ?? 0,
    hourlyLimit: AI_HOURLY_MESSAGE_LIMIT,
    extensionsToday: extensionRows.length,
    maxExtensions: AI_MAX_DAILY_EXTENSIONS,
  };
}

// Fail-closed: any query error blocks the turn instead of letting spend
// through unmetered.
export async function checkAiLimits(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<LimitCheck> {
  const usage = await getAiUsageStatus(supabase, userId);

  if (!usage) {
    return {
      ok: false,
      status: 503,
      code: "usage_check_failed",
      message: "No se pudo verificar el uso de IA. Probá de nuevo.",
    };
  }

  if (usage.messagesLastHour >= usage.hourlyLimit) {
    return {
      ok: false,
      status: 429,
      code: "hourly_message_limit",
      message: `Llegaste al límite de ${usage.hourlyLimit} mensajes por hora. Esperá un rato y seguí.`,
      usage,
    };
  }

  if (usage.tokensToday >= usage.dailyCap) {
    return {
      ok: false,
      status: 429,
      code: "daily_token_cap",
      message:
        usage.extensionsToday >= usage.maxExtensions
          ? "Alcanzaste el máximo de tokens de IA para hoy, incluidas las ampliaciones. Volvé mañana."
          : "Alcanzaste tu límite diario de tokens de IA.",
      usage,
    };
  }

  return { ok: true, usage };
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
