import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ServerContext } from "@/lib/server/context";
import type { OpeningBalance } from "@/types/months";

type ActionResult<T> = { data: T } | { error: string };

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
    if (error) {
      console.error("recalculateOpeningBalances:", error.code, error.message);
      return { error: error.message };
    }
    return { data: null };
  } catch (e) {
    console.error("recalculateOpeningBalances:", e);
    return { error: "Error al recalcular saldos iniciales" };
  }
}

/**
 * Earliest of a set of month ids — the anchor for recalc cascades.
 * (Single shared implementation; transactions.ts and investments.ts used to
 * carry byte-identical copies.)
 */
export async function pickEarliestMonthId(
  monthIds: string[],
): Promise<string | null> {
  const ids = monthIds.filter(Boolean);
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0];
  const supabase = await createClient();
  const { data } = await supabase
    .from("months")
    .select("id, year, month")
    .in("id", ids);
  if (!data || data.length === 0) return null;
  const sorted = [...data].sort(
    (a, b) => a.year * 100 + a.month - (b.year * 100 + b.month),
  );
  return sorted[0].id;
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

    if (error) return { error: error.message };

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
    console.error("loadOpeningBalances:", e);
    return { error: "Error al obtener saldos iniciales" };
  }
}
