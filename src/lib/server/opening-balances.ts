import "server-only";

import type { ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import type { ServerContext } from "@/lib/server/context";
import { dbError } from "@/lib/server/db-errors";
import type { OpeningBalance } from "@/types/months";

/** For an action whose write succeeded but whose recalculation did not. */
export const RECALCULATION_FAILED =
  "Guardado, pero no se pudieron recalcular los saldos. Revisalos en Configuración → Diagnóstico de saldos.";

/**
 * Rebuild the opening balances of every month from `monthId` on (every month
 * when null) with rebuild_opening_balances (0044): each account's initial
 * balance plus the non-deleted legs of all earlier months, in one statement.
 */
export async function recalculateOpeningBalances(
  monthId: string | null,
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc(
      "rebuild_opening_balances",
      monthId ? { p_from_month_id: monthId } : {},
    );
    if (error) return dbError("recalculateOpeningBalances", error, "Error al recalcular saldos iniciales");
    return { data: null };
  } catch (e) {
    logError("recalculateOpeningBalances", e);
    return { error: "Error al recalcular saldos iniciales" };
  }
}

/** Opening balances of a month, with each one revalued at that month's rate. */
export async function loadOpeningBalances(
  { supabase }: ServerContext,
  monthId: string,
): Promise<ActionResult<OpeningBalance[]>> {
  try {
    const { data, error } = await supabase.rpc(
      "opening_balances_with_current_base",
      {
        p_month_id: monthId,
        p_base_currency: undefined,
      },
    );

    if (error) return dbError("loadOpeningBalances", error, "Error al obtener saldos iniciales");

    return {
      data: ((data ?? []) as Array<{
        id: string;
        month_id: string;
        account_id: string;
        opening_amount: number | string;
        opening_base_amount: number | string;
        created_at: string;
        account_name: string;
        account_currency: string;
        account_currency_symbol: string;
        current_opening_base_amount: number | string | null;
      }>).map((row) => ({
        id: row.id,
        month_id: row.month_id,
        account_id: row.account_id,
        opening_amount: Number(row.opening_amount),
        opening_base_amount: Number(row.opening_base_amount),
        created_at: row.created_at,
        account_name: row.account_name,
        account_currency: row.account_currency,
        account_currency_symbol: row.account_currency_symbol,
        current_opening_base_amount:
          row.current_opening_base_amount != null
            ? Number(row.current_opening_base_amount)
            : undefined,
      })),
    };
  } catch (e) {
    logError("loadOpeningBalances", e);
    return { error: "Error al obtener saldos iniciales" };
  }
}
