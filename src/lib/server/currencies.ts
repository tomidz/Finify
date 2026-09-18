import "server-only";

import type { ActionResult } from "@/lib/action-result";
import type { SupabaseServerClient } from "@/lib/server/context";
import { dbError } from "@/lib/server/db-errors";
import type { Currency } from "@/types/accounts";

export async function loadCurrencies(
  supabase: SupabaseServerClient,
): Promise<ActionResult<Currency[]>> {
  const { data, error } = await supabase
    .from("currencies")
    .select("*")
    .order("code", { ascending: true });
  if (error) return dbError("loadCurrencies", error, "Error al obtener las monedas");
  return { data: (data ?? []) as Currency[] };
}
