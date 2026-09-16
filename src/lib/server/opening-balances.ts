import "server-only";

import { createClient } from "@/lib/supabase/server";
import { toYearMonthCode } from "@/lib/months";
import {
  chainOpeningBalances,
  type ChainMovement,
} from "@/lib/ledger/opening-balances";
import type { ServerContext } from "@/lib/server/context";
import { chunk, IN_LIST_CHUNK, readAllRows } from "@/lib/server/paginate";
import type { OpeningBalance } from "@/types/months";

type ActionResult<T> = { data: T } | { error: string };

const UPSERT_BATCH = 500;

/**
 * Recalculate opening balances for all months after the given monthId.
 * Call this after creating/updating/deleting transactions in a past month.
 *
 * Reads everything the chain needs in a few queries, computes every later
 * month in memory (chainOpeningBalances) and writes the result at once, instead
 * of three round trips per later month. A failed read writes nothing; the
 * error is reported to the caller.
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

    const [monthsResult, accountsResult, baseOpeningsResult] = await Promise.all([
      supabase
        .from("months")
        .select("id, year, month")
        .eq("user_id", baseMonth.user_id)
        .order("year", { ascending: true })
        .order("month", { ascending: true }),
      supabase
        .from("accounts")
        .select("id")
        .eq("user_id", baseMonth.user_id)
        .eq("is_active", true),
      supabase
        .from("opening_balances")
        .select("account_id, opening_amount, opening_base_amount")
        .eq("month_id", baseMonth.id),
    ]);

    if (monthsResult.error) return { error: monthsResult.error.message };
    if (accountsResult.error) return { error: accountsResult.error.message };
    if (baseOpeningsResult.error) return { error: baseOpeningsResult.error.message };

    const allMonths = monthsResult.data ?? [];
    const activeAccountIds = (accountsResult.data ?? []).map((a) => a.id);
    const baseCode = toYearMonthCode(baseMonth.year, baseMonth.month);
    const baseIndex = allMonths.findIndex((m) => m.id === baseMonth.id);
    const later = allMonths.filter((m) => toYearMonthCode(m.year, m.month) > baseCode);
    if (baseIndex < 0 || later.length === 0 || activeAccountIds.length === 0) {
      return { data: null };
    }

    // Movements that feed a later opening: the base month and every later
    // month except the last.
    const feedingMonthIds = allMonths
      .slice(baseIndex, allMonths.length - 1)
      .map((m) => m.id);
    const movementReads = await Promise.all(
      chunk(feedingMonthIds, IN_LIST_CHUNK).map((monthIds) =>
        readAllRows(({ from, to, count }) =>
          supabase
            .from("transaction_amounts")
            .select("id, account_id, amount, base_amount, transactions!inner(month_id, deleted_at)", { count })
            .in("transactions.month_id", monthIds)
            .is("transactions.deleted_at", null)
            .order("id", { ascending: true })
            .range(from, to),
        ),
      ),
    );
    const movements: ChainMovement[] = [];
    for (const read of movementReads) {
      if ("error" in read) {
        console.error("recalculateOpeningBalances: movements read failed, nothing written:", read.error);
        return { error: read.error.message };
      }
      for (const row of read.data) {
        const tx = Array.isArray(row.transactions) ? row.transactions[0] : row.transactions;
        if (!tx) continue;
        movements.push({
          month_id: tx.month_id,
          account_id: row.account_id,
          amount: Number(row.amount),
          base_amount: Number(row.base_amount),
        });
      }
    }

    const rows = chainOpeningBalances({
      months: allMonths,
      baseMonthId: baseMonth.id,
      baseOpenings: (baseOpeningsResult.data ?? []).map((row) => ({
        account_id: row.account_id,
        opening_amount: Number(row.opening_amount),
        opening_base_amount: Number(row.opening_base_amount),
      })),
      movements,
      activeAccountIds,
    });

    // Rows come month by month; a batch only closes between months, so a failed
    // write never leaves a month with some accounts updated and others not.
    const batches: typeof rows[] = [];
    for (let start = 0; start < rows.length; ) {
      let end = start;
      while (end < rows.length && rows[end].month_id === rows[start].month_id) end++;
      const last = batches[batches.length - 1];
      if (last && last.length + (end - start) <= UPSERT_BATCH) {
        last.push(...rows.slice(start, end));
      } else {
        batches.push(rows.slice(start, end));
      }
      start = end;
    }
    for (const batch of batches) {
      const { error: upsertError } = await supabase
        .from("opening_balances")
        .upsert(batch, { onConflict: "month_id,account_id" });
      if (upsertError) {
        console.error("recalculateOpeningBalances: write failed:", upsertError);
        return { error: upsertError.message };
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
