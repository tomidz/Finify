import "server-only";

import type { ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/log";
import { dbError } from "@/lib/server/db-errors";
import { createClient } from "@/lib/supabase/server";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** An authenticated Supabase client plus the caller's user id. */
export type ServerContext = { supabase: SupabaseServerClient; userId: string };

/**
 * Resolves the session once. Loaders take the context as an argument so a
 * screen that composes several reads validates the session a single time
 * instead of once per read.
 */
export async function getServerContext(): Promise<ServerContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  // No session is the usual signed-out case; anything else (Auth down, a bad
  // token) also reads as signed out, but is logged.
  if (error && error.name !== "AuthSessionMissingError") logError("getServerContext", error);
  return user ? { supabase, userId: user.id } : null;
}

/**
 * The user's base currency. A failed read is an error, not "USD": base amounts
 * computed against the wrong currency would be written permanently.
 */
export async function loadBaseCurrency({
  supabase,
  userId,
}: ServerContext): Promise<ActionResult<string>> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("base_currency")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return dbError("loadBaseCurrency", error, "Error al obtener la moneda base");
  return { data: data?.base_currency ?? "USD" };
}
