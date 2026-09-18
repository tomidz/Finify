import "server-only";

import type { ActionResult } from "@/lib/action-result";
import type { ServerContext } from "@/lib/server/context";
import { dbError } from "@/lib/server/db-errors";
import type { BudgetSummaryVsActual } from "@/types/budget";
import { budgetTotalsByGroup } from "@/lib/finance/budget-status";
import { logError } from "@/lib/log";

/**
 * Plan vs actual per category across a month range. Callers are responsible
 * for having checked that both months belong to the user.
 */
export async function loadBudgetSummaryRange(
  { supabase }: ServerContext,
  startMonthId: string,
  endMonthId: string,
): Promise<ActionResult<BudgetSummaryVsActual>> {
  try {
    const { data, error } = await supabase.rpc(
      "budget_summary_vs_actual_range",
      {
        p_start_month_id: startMonthId,
        p_end_month_id: endMonthId,
        p_base_currency: undefined,
      },
    );

    if (error) return dbError("loadBudgetSummaryRange", error, "Error al obtener resumen plan vs real");

    const categorySummary = ((data ?? []) as Array<{
      category_id: string;
      category_name: string;
      category_type: BudgetSummaryVsActual["categories"][number]["category_type"];
      planned_amount: number | string | null;
      actual_amount: number | string | null;
      variance: number | string | null;
    }>).map((category) => ({
      category_id: category.category_id,
      category_name: category.category_name,
      category_type: category.category_type,
      planned_amount: Number(category.planned_amount ?? 0),
      actual_amount: Number(category.actual_amount ?? 0),
      variance: Number(category.variance ?? 0),
    }));

    return {
      data: {
        totals: budgetTotalsByGroup(categorySummary),
        categories: categorySummary,
      },
    };
  } catch (e) {
    logError("loadBudgetSummaryRange", e);
    return { error: "Error al obtener resumen plan vs real" };
  }
}
