"use server";

import { getServerContext } from "@/lib/server/context";
import { dbError } from "@/lib/server/db-errors";
import { logError } from "@/lib/log";
import type { ActionResult } from "@/lib/action-result";

export type LedgerDriftRow = {
  account_id: string;
  account_name: string;
  month_id: string;
  year: number;
  month: number;
  /** null when the month has no opening row for the account. */
  stored_opening: number | null;
  derived_opening: number;
  stored_opening_base: number | null;
  derived_opening_base: number;
};

/** Months whose stored opening balance differs from the expected one (see ledger_drift). */
export async function getLedgerDrift(): Promise<ActionResult<LedgerDriftRow[]>> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };

    const { data, error } = await ctx.supabase.rpc("ledger_drift");
    if (error) return dbError("getLedgerDrift", error, "No se pudieron revisar los saldos");

    return {
      data: (data ?? []).map((row) => ({
        account_id: row.account_id,
        account_name: row.account_name,
        month_id: row.month_id,
        year: row.year,
        month: row.month,
        stored_opening: row.stored_opening == null ? null : Number(row.stored_opening),
        derived_opening: Number(row.derived_opening),
        stored_opening_base: row.stored_opening_base == null ? null : Number(row.stored_opening_base),
        derived_opening_base: Number(row.derived_opening_base),
      })),
    };
  } catch (e) {
    logError("getLedgerDrift", e);
    return { error: "No se pudieron revisar los saldos" };
  }
}
