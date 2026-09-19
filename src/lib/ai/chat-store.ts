import "server-only";

import type { createClient } from "@/lib/supabase/server";

import { AI_MODEL, estimateCostUsd, type TurnUsage } from "@/lib/ai/model";
import { logError } from "@/lib/log";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const AI_DAILY_TOKEN_CAP = 300_000;
export const AI_HOURLY_MESSAGE_LIMIT = 30;
// Each extension grants another AI_DAILY_TOKEN_CAP for the same UTC day.
// The database enforces this cap and count on ai_quota_extensions
// (migration 0041): raising either one needs a migration too.
export const AI_MAX_DAILY_EXTENSIONS = 3;

export function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
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

  const readError = hourly.error ?? daily.error ?? extensions.error;
  if (readError) {
    logError("getAiUsageStatus", readError);
    return null;
  }

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

/** Creates the session titled after its first message, or marks it as just used. */
export async function ensureAiSession(
  supabase: SupabaseServerClient,
  userId: string,
  sessionId: string,
  title: string,
): Promise<{ error?: string }> {
  const { error } = await supabase.from("ai_sessions").upsert(
    { id: sessionId, user_id: userId, title: title.slice(0, 80) },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) {
    logError("ensureAiSession", error, { step: "create" });
    return { error: "No se pudo crear la conversación" };
  }
  // Also proves the session is the user's: an id taken by someone else
  // updates nothing.
  const { data, error: touchError } = await supabase
    .from("ai_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select("id");
  if (touchError) {
    logError("ensureAiSession", touchError, { step: "touch" });
    return { error: "No se pudo crear la conversación" };
  }
  return data && data.length > 0 ? {} : { error: "Conversación no encontrada" };
}

/**
 * Saves a chat message once: a retried request sends the same message id, and
 * the second save keeps the row already there.
 */
export async function saveAiMessage(
  supabase: SupabaseServerClient,
  input: {
    sessionId: string;
    userId: string;
    clientMessageId: string;
    role: "user" | "assistant";
    parts: unknown;
  },
): Promise<{ error?: string }> {
  const { error } = await supabase.from("ai_messages").upsert(
    {
      session_id: input.sessionId,
      user_id: input.userId,
      client_message_id: input.clientMessageId,
      role: input.role,
      parts: input.parts as never,
    },
    { onConflict: "session_id,client_message_id", ignoreDuplicates: true },
  );
  if (error) {
    logError("saveAiMessage", error, { role: input.role });
    return { error: "No se pudo guardar el mensaje" };
  }
  return {};
}

// Best-effort: metering must never break the chat response.
export async function logAiUsage(
  supabase: SupabaseServerClient,
  input: TurnUsage & {
    userId: string;
    sessionId: string;
    toolNames: string[];
  },
): Promise<void> {
  const row = {
    user_id: input.userId,
    session_id: input.sessionId,
    model: AI_MODEL,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    cached_input_tokens: input.cachedInputTokens,
    cache_write_tokens: input.cacheWriteTokens,
    cost_usd: estimateCostUsd(input),
    tool_names: input.toolNames,
  };
  try {
    let { error } = await supabase.from("ai_usage").insert(row);
    // A session deleted before the turn ends still owes its usage to the
    // limits: keep the row without the session.
    if (error?.code === "23503") {
      ({ error } = await supabase.from("ai_usage").insert({ ...row, session_id: null }));
    }
    if (error) logError("logAiUsage", error);
  } catch (e) {
    logError("logAiUsage", e);
  }
}
