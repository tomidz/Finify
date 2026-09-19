"use server";

import { getServerContext, loadBaseCurrency } from "@/lib/server/context";
import { loadMonths } from "@/lib/server/months";
import { loadPeriodSummary, type PeriodSummaryData } from "@/lib/server/period-summary";
import { logError } from "@/lib/log";
import type { ActionResult } from "@/lib/action-result";

/** The period summary of the months from `startMonthId` to `endMonthId`. */
export async function getPeriodSummary(
  startMonthId: string,
  endMonthId: string,
): Promise<ActionResult<PeriodSummaryData>> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };
    const [months, baseCurrency] = await Promise.all([loadMonths(ctx), loadBaseCurrency(ctx)]);
    if ("error" in months) return months;
    if ("error" in baseCurrency) return baseCurrency;
    const start = months.data.find((m) => m.id === startMonthId);
    const end = months.data.find((m) => m.id === endMonthId);
    if (!start || !end) return { error: "Mes no encontrado" };
    return await loadPeriodSummary(ctx, { months: months.data, start, end, baseCurrency: baseCurrency.data });
  } catch (e) {
    logError("getPeriodSummary", e);
    return { error: "Error al calcular el resumen del período" };
  }
}
