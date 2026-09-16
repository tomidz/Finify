import "server-only";

import { createClient } from "@/lib/supabase/server";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** An authenticated Supabase client plus the caller's user id. */
export type ServerContext = { supabase: SupabaseServerClient; userId: string };

type Result<T> = { data: T } | { error: string };

/**
 * Resolves the session once. Loaders take the context as an argument so a
 * screen that composes several reads validates the session a single time
 * instead of once per read.
 */
export async function getServerContext(): Promise<ServerContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

/**
 * The user's base currency. A failed read is an error, not "USD": base amounts
 * computed against the wrong currency would be written permanently.
 */
export async function loadBaseCurrency({
  supabase,
  userId,
}: ServerContext): Promise<Result<string>> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("base_currency")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("loadBaseCurrency:", error.code);
    return { error: "Error al obtener la moneda base" };
  }
  return { data: data?.base_currency ?? "USD" };
}
