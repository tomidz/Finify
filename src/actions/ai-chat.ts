"use server";

import {
  AI_DAILY_TOKEN_CAP,
  getAiUsageStatus,
  utcDayKey,
  type AiUsageStatus,
} from "@/lib/ai/chat-store";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T> = { data: T } | { error: string };

export type AiSessionSummary = {
  id: string;
  title: string | null;
  updated_at: string;
};

export type StoredAiMessage = {
  id: string;
  role: "user" | "assistant";
  parts: unknown[];
};

export async function getAiSessions(): Promise<
  ActionResult<AiSessionSummary[]>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data, error } = await supabase
    .from("ai_sessions")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(30);

  if (error) return { error: "No se pudieron cargar las conversaciones" };
  return { data: data ?? [] };
}

export async function getAiSessionMessages(
  sessionId: string,
): Promise<ActionResult<StoredAiMessage[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data, error } = await supabase
    .from("ai_messages")
    .select("id, role, parts")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) return { error: "No se pudo cargar la conversación" };

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      role: row.role as "user" | "assistant",
      parts: Array.isArray(row.parts) ? row.parts : [],
    })),
  };
}

export async function getAiUsage(): Promise<ActionResult<AiUsageStatus>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const usage = await getAiUsageStatus(supabase, user.id);
  if (!usage) return { error: "No se pudo leer el uso de IA" };
  return { data: usage };
}

// Grants another full daily allowance for today, up to maxExtensions.
export async function extendAiQuota(): Promise<ActionResult<AiUsageStatus>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const usage = await getAiUsageStatus(supabase, user.id);
  if (!usage) return { error: "No se pudo leer el uso de IA" };
  if (usage.extensionsToday >= usage.maxExtensions) {
    return {
      error: `Ya usaste las ${usage.maxExtensions} ampliaciones de hoy. Volvé mañana.`,
    };
  }

  const { error } = await supabase.from("ai_quota_extensions").insert({
    user_id: user.id,
    day: utcDayKey(),
    extra_tokens: AI_DAILY_TOKEN_CAP,
  });
  if (error) return { error: "No se pudo ampliar el límite" };

  return {
    data: {
      ...usage,
      dailyCap: usage.dailyCap + AI_DAILY_TOKEN_CAP,
      extensionsToday: usage.extensionsToday + 1,
    },
  };
}

export async function deleteAiSession(
  sessionId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase
    .from("ai_sessions")
    .delete()
    .eq("id", sessionId);

  if (error) return { error: "No se pudo borrar la conversación" };
  return { data: null };
}
