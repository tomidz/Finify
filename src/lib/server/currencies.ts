import "server-only";

import type { SupabaseServerClient } from "@/lib/server/context";
import type { Currency } from "@/types/accounts";

type Result<T> = { data: T } | { error: string };

export async function loadCurrencies(
  supabase: SupabaseServerClient,
): Promise<Result<Currency[]>> {
  const { data, error } = await supabase
    .from("currencies")
    .select("*")
    .order("code", { ascending: true });
  if (error) return { error: error.message };
  return { data: (data ?? []) as Currency[] };
}
