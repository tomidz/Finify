"use server";

import { getServerContext, loadBaseCurrency } from "@/lib/server/context";
import { loadForecast } from "@/lib/server/forecast";
import type { ForecastPoint } from "@/types/forecast";

type ActionResult<T> = { data: T } | { error: string };

export async function getForecast(
  monthsAhead: number = 6
): Promise<ActionResult<ForecastPoint[]>> {
  const ctx = await getServerContext();
  if (!ctx) return { error: "No autenticado" };
  const baseCurrency = await loadBaseCurrency(ctx);
  if ("error" in baseCurrency) return baseCurrency;
  return loadForecast(ctx, baseCurrency.data, monthsAhead);
}
