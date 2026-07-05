"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrFetchFxRate } from "@/actions/fx";
import type {
  Month,
  OpeningBalance,
  NextMonthPreview,
  OpeningBalancePreview,
} from "@/types/months";

type ActionResult<T> = { data: T } | { error: string };

function toYearMonthCode(year: number, month: number): number {
  return year * 100 + month;
}

function nextYearMonth(year: number, month: number) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function getLatestMonth(
  userId: string
): Promise<ActionResult<{ year: number; month: number } | null>> {
  const supabase = await createClient();
  const { data: latest, error } = await supabase
    .from("months")
    .select("year, month")
    .eq("user_id", userId)
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message };
  return { data: latest ?? null };
}

export async function getMonths(): Promise<ActionResult<Month[]>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("months")
      .select("*")
      .eq("user_id", userId)
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    if (error) return { error: error.message };
    return { data: (data ?? []) as Month[] };
  } catch {
    return { error: "Error al obtener meses" };
  }
}

export async function getOrCreateCurrentMonth(): Promise<ActionResult<Month>> {
  const now = new Date();
  return createMonth(now.getFullYear(), now.getMonth() + 1);
}

export async function createNextMonthFromLatest(): Promise<ActionResult<Month>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const latestResult = await getLatestMonth(userId);
    if ("error" in latestResult) return { error: latestResult.error };
    const latest = latestResult.data;
    if (!latest) return getOrCreateCurrentMonth();

    const next = nextYearMonth(latest.year, latest.month);
    return createMonth(next.year, next.month);
  } catch {
    return { error: "Error al crear el próximo mes" };
  }
}

export async function previewNextMonthFromLatest(): Promise<
  ActionResult<NextMonthPreview>
> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const latestResult = await getLatestMonth(userId);
    if ("error" in latestResult) return { error: latestResult.error };

    const latest = latestResult.data;
    const target = latest
      ? nextYearMonth(latest.year, latest.month)
      : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };

    const supabase = await createClient();

    // Moneda base actual del usuario
    const { data: prefsRow } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", userId)
      .maybeSingle();
    const baseCurrency = prefsRow?.base_currency ?? "USD";

    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("id, name, currency")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (accountsError) return { error: accountsError.message };

    const accountIds = (accounts ?? []).map((a) => a.id);
    const openingsByAccount = new Map<
      string,
      { opening_amount: number; opening_base_amount: number }
    >();

    if (latest && accountIds.length > 0) {
      const { data: previousMonthRow } = await supabase
        .from("months")
        .select("id")
        .eq("user_id", userId)
        .eq("year", latest.year)
        .eq("month", latest.month)
        .maybeSingle();

      if (previousMonthRow) {
        const { data: prevOpenings, error: prevOpeningsError } = await supabase
          .from("opening_balances")
          .select("account_id, opening_amount, opening_base_amount")
          .eq("month_id", previousMonthRow.id);
        if (prevOpeningsError) return { error: prevOpeningsError.message };

        for (const row of prevOpenings ?? []) {
          openingsByAccount.set(row.account_id, {
            opening_amount: Number(row.opening_amount),
            opening_base_amount: Number(row.opening_base_amount),
          });
        }

        const { data: prevMovements, error: prevMovementsError } = await supabase
          .from("transaction_amounts")
          .select(
            "account_id, amount, base_amount, transactions!inner(month_id, deleted_at)",
          )
          .eq("transactions.month_id", previousMonthRow.id)
          .is("transactions.deleted_at", null);
        if (prevMovementsError) return { error: prevMovementsError.message };

        for (const row of prevMovements ?? []) {
          const current = openingsByAccount.get(row.account_id) ?? {
            opening_amount: 0,
            opening_base_amount: 0,
          };
          openingsByAccount.set(row.account_id, {
            opening_amount: current.opening_amount + Number(row.amount),
            opening_base_amount:
              current.opening_base_amount + Number(row.base_amount),
          });
        }
      }
    }

    const currencyCodes = Array.from(
      new Set((accounts ?? []).map((acc) => acc.currency))
    );
    const symbolByCode = new Map<string, string>();
    if (currencyCodes.length > 0) {
      const { data: currencyRows } = await supabase
        .from("currencies")
        .select("code, symbol")
        .in("code", currencyCodes);
      for (const row of currencyRows ?? []) {
        symbolByCode.set(row.code, row.symbol);
      }
    }

    const fxDate = `${target.year}-${String(target.month).padStart(
      2,
      "0",
    )}-01`;
    const fxCache = new Map<string, number>();

    const getRate = async (from: string): Promise<number> => {
      if (from === baseCurrency) return 1;
      const key = `${fxDate}:${from}:${baseCurrency}`;
      const cached = fxCache.get(key);
      if (cached != null) return cached;
      const result = await getOrFetchFxRate({
        date: fxDate,
        from,
        to: baseCurrency,
      });
      if ("error" in result) {
        throw new Error(result.error);
      }
      fxCache.set(key, result.data);
      return result.data;
    };

    const balances: OpeningBalancePreview[] = [];
    for (const account of accounts ?? []) {
      const opening = openingsByAccount.get(account.id) ?? {
        opening_amount: 0,
        opening_base_amount: 0,
      };

      let currentOpeningBase: number | undefined;
      if (opening.opening_amount) {
        const rate = await getRate(account.currency);
        currentOpeningBase = opening.opening_amount * rate;
      }

      balances.push({
        account_id: account.id,
        account_name: account.name,
        account_currency: account.currency,
        account_currency_symbol:
          symbolByCode.get(account.currency) ?? account.currency,
        opening_amount: opening.opening_amount,
        opening_base_amount: opening.opening_base_amount,
        current_opening_base_amount: currentOpeningBase,
      });
    }

    return {
      data: {
        year: target.year,
        month: target.month,
        balances,
      },
    };
  } catch {
    return { error: "Error al previsualizar el próximo mes" };
  }
}

export async function createMonth(
  year: number,
  month: number
): Promise<ActionResult<Month>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    if (month < 1 || month > 12) return { error: "Mes inválido" };

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("months")
      .select("*")
      .eq("user_id", userId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    let monthRow = existing as Month | null;

    if (!monthRow) {
      const { data: created, error: createMonthError } = await supabase
        .from("months")
        .insert({ user_id: userId, year, month })
        .select()
        .single();
      if (createMonthError) {
        // Concurrent creation (double-mounted dashboard): the loser of the
        // unique-constraint race re-reads the winner's row instead of
        // surfacing a raw duplicate-key error.
        if (createMonthError.code === "23505") {
          const { data: raced } = await supabase
            .from("months")
            .select("*")
            .eq("user_id", userId)
            .eq("year", year)
            .eq("month", month)
            .maybeSingle();
          if (!raced) return { error: createMonthError.message };
          monthRow = raced as Month;
        } else {
          return { error: createMonthError.message };
        }
      } else {
        monthRow = created as Month;
      }
    }

    const newMonth = monthRow;

    // If the month already has opening rows we're done. If it exists but has
    // none (a previous partial failure), fall through and backfill — before
    // this check, such a month was permanently stuck with no openings.
    const { count: openingCount, error: countError } = await supabase
      .from("opening_balances")
      .select("id", { count: "exact", head: true })
      .eq("month_id", newMonth.id);
    if (countError) return { error: countError.message };
    if ((openingCount ?? 0) > 0) return { data: newMonth };

    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true);
    if (accountsError) return { error: accountsError.message };

    const activeAccountIds = (accounts ?? []).map((a) => a.id);
    if (activeAccountIds.length === 0) return { data: newMonth };

    const targetCode = toYearMonthCode(year, month);

    const { data: previousMonths, error: prevMonthsError } = await supabase
      .from("months")
      .select("id, year, month")
      .eq("user_id", userId)
      .lt("year", year + 1)
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    if (prevMonthsError) return { error: prevMonthsError.message };

    const previousMonth = (previousMonths ?? []).find(
      (m) => toYearMonthCode(m.year, m.month) < targetCode
    );

    const openingByAccount = new Map<
      string,
      { opening_amount: number; opening_base_amount: number }
    >();

    if (previousMonth) {
      const { data: prevOpenings, error: prevOpeningsError } = await supabase
        .from("opening_balances")
        .select("account_id, opening_amount, opening_base_amount")
        .eq("month_id", previousMonth.id);
      if (prevOpeningsError) return { error: prevOpeningsError.message };

      for (const row of prevOpenings ?? []) {
        openingByAccount.set(row.account_id, {
          opening_amount: Number(row.opening_amount),
          opening_base_amount: Number(row.opening_base_amount),
        });
      }

      const { data: prevMovements, error: prevMovementsError } = await supabase
        .from("transaction_amounts")
        .select("account_id, amount, base_amount, transactions!inner(month_id, deleted_at)")
        .eq("transactions.month_id", previousMonth.id)
        .is("transactions.deleted_at", null);
      if (prevMovementsError) return { error: prevMovementsError.message };

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
    }

    const openingRows = activeAccountIds.map((accountId) => {
      const values = openingByAccount.get(accountId) ?? {
        opening_amount: 0,
        opening_base_amount: 0,
      };
      return {
        month_id: newMonth.id,
        account_id: accountId,
        opening_amount: values.opening_amount,
        opening_base_amount: values.opening_base_amount,
      };
    });

    if (openingRows.length > 0) {
      const { error: openingInsertError } = await supabase
        .from("opening_balances")
        .upsert(openingRows, { onConflict: "month_id,account_id" });
      if (openingInsertError) return { error: openingInsertError.message };
    }

    return { data: newMonth };
  } catch {
    return { error: "Error al crear mes" };
  }
}

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
 * Recalculate opening balances for ALL months (from the earliest).
 * One-time fix for stale data.
 */
export async function recalculateAllOpeningBalances(): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data: allMonths } = await supabase
      .from("months")
      .select("id, year, month")
      .eq("user_id", userId)
      .order("year", { ascending: true })
      .order("month", { ascending: true });

    if (!allMonths || allMonths.length < 2) return { data: null };

    // Recalculate from the first month
    await recalculateOpeningBalances(allMonths[0].id);

    return { data: null };
  } catch {
    return { error: "Error al recalcular saldos" };
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

export async function getMonthsInRange(
  startMonthId: string,
  endMonthId: string
): Promise<ActionResult<Month[]>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data: startRow, error: startErr } = await supabase
      .from("months")
      .select("year, month")
      .eq("id", startMonthId)
      .eq("user_id", userId)
      .maybeSingle();
    if (startErr) return { error: startErr.message };
    if (!startRow) return { error: "Mes inicial no encontrado" };

    const { data: endRow, error: endErr } = await supabase
      .from("months")
      .select("year, month")
      .eq("id", endMonthId)
      .eq("user_id", userId)
      .maybeSingle();
    if (endErr) return { error: endErr.message };
    if (!endRow) return { error: "Mes final no encontrado" };

    const startCode = toYearMonthCode(startRow.year, startRow.month);
    const endCode = toYearMonthCode(endRow.year, endRow.month);
    if (startCode > endCode) return { error: "El mes inicial debe ser anterior al final" };

    const { data, error } = await supabase
      .from("months")
      .select("*")
      .eq("user_id", userId)
      .order("year", { ascending: true })
      .order("month", { ascending: true });

    if (error) return { error: error.message };

    const filtered = (data ?? []).filter((m) => {
      const code = toYearMonthCode(m.year, m.month);
      return code >= startCode && code <= endCode;
    });

    return { data: filtered as Month[] };
  } catch {
    return { error: "Error al obtener meses del rango" };
  }
}

export async function getOpeningBalances(
  monthId: string
): Promise<ActionResult<OpeningBalance[]>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();

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
  } catch {
    return { error: "Error al obtener saldos iniciales" };
  }
}
