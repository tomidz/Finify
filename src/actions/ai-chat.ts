"use server";

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
