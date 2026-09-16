import "server-only";

import { createClient } from "@/lib/supabase/server";
import { toYearMonthCode } from "@/lib/months";

type ActionResult<T> = { data: T } | { error: string };

/**
 * Recalculate opening balances for all months after the given monthId.
 * Call this after creating/updating/deleting transactions in a past month.
 *
 * Every read/write is checked: a failure ABORTS the chain (months are
 * derived sequentially — writing month N+1 from a stale month N compounds
 * the error through every later month) and is reported to the caller.
 */
export async function recalculateOpeningBalances(
  monthId: string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const { data: baseMonth, error: baseError } = await supabase
      .from("months")
      .select("id, year, month, user_id")
      .eq("id", monthId)
      .single();

    if (baseError) return { error: baseError.message };
    if (!baseMonth) return { data: null };

    // Get all months for this user, sorted chronologically
    const { data: allMonths, error: monthsError } = await supabase
      .from("months")
      .select("id, year, month")
      .eq("user_id", baseMonth.user_id)
      .order("year", { ascending: true })
      .order("month", { ascending: true });

    if (monthsError) return { error: monthsError.message };
    if (!allMonths || allMonths.length === 0) return { data: null };

    const baseCode = toYearMonthCode(baseMonth.year, baseMonth.month);
    // Find months that come after (or equal to) the base month
    const monthsToRecalc = allMonths.filter(
      (m) => toYearMonthCode(m.year, m.month) > baseCode
    );

    if (monthsToRecalc.length === 0) return { data: null };

    // Get active accounts
    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", baseMonth.user_id)
      .eq("is_active", true);
    if (accountsError) return { error: accountsError.message };
    const activeAccountIds = (accounts ?? []).map((a) => a.id);
    if (activeAccountIds.length === 0) return { data: null };

    // Process each month sequentially: opening = prev opening + prev transactions
    for (const month of monthsToRecalc) {
      // Find the previous month
      const monthCode = toYearMonthCode(month.year, month.month);
      const prevMonth = allMonths
        .filter((m) => toYearMonthCode(m.year, m.month) < monthCode)
        .pop();

      if (!prevMonth) continue;

      // Get previous month's opening balances
      const { data: prevOpenings, error: prevOpeningsError } = await supabase
        .from("opening_balances")
        .select("account_id, opening_amount, opening_base_amount")
        .eq("month_id", prevMonth.id);
      if (prevOpeningsError) {
        console.error(
          `recalculateOpeningBalances: read failed at ${month.year}-${month.month}, chain aborted:`,
          prevOpeningsError,
        );
        return { error: prevOpeningsError.message };
      }

      const openingByAccount = new Map<
        string,
        { opening_amount: number; opening_base_amount: number }
      >();
      for (const row of prevOpenings ?? []) {
        openingByAccount.set(row.account_id, {
          opening_amount: Number(row.opening_amount),
          opening_base_amount: Number(row.opening_base_amount),
        });
      }

      // Add previous month's transactions
      const { data: prevMovements, error: prevMovementsError } = await supabase
        .from("transaction_amounts")
        .select(
          "account_id, amount, base_amount, transactions!inner(month_id, deleted_at)"
        )
        .eq("transactions.month_id", prevMonth.id)
        .is("transactions.deleted_at", null);
      if (prevMovementsError) {
        console.error(
          `recalculateOpeningBalances: read failed at ${month.year}-${month.month}, chain aborted:`,
          prevMovementsError,
        );
        return { error: prevMovementsError.message };
      }

      for (const row of prevMovements ?? []) {
        const current = openingByAccount.get(row.account_id) ?? {
          opening_amount: 0,
          opening_base_amount: 0,
        };
        openingByAccount.set(row.account_id, {
          opening_amount: current.opening_amount + Number(row.amount),
          opening_base_amount:
            current.opening_base_amount + Number(row.base_amount),
        });
      }

      // Upsert opening balances for this month
      const openingRows = activeAccountIds.map((accountId) => {
        const values = openingByAccount.get(accountId) ?? {
          opening_amount: 0,
          opening_base_amount: 0,
        };
        return {
          month_id: month.id,
          account_id: accountId,
          opening_amount: values.opening_amount,
          opening_base_amount: values.opening_base_amount,
        };
      });

      if (openingRows.length > 0) {
        const { error: upsertError } = await supabase
          .from("opening_balances")
          .upsert(openingRows, { onConflict: "month_id,account_id" });
        if (upsertError) {
          console.error(
            `recalculateOpeningBalances: write failed at ${month.year}-${month.month}, chain aborted:`,
            upsertError,
          );
          return { error: upsertError.message };
        }
      }
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
