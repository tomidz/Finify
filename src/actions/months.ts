"use server";

import { createClient } from "@/lib/supabase/server";
import { currentYearMonth } from "@/lib/dates";
import { getOrFetchFxRate } from "@/lib/server/fx";
import { getServerContext } from "@/lib/server/context";
import { loadMonthsInRange } from "@/lib/server/months";
import {
  loadOpeningBalances,
  RECALCULATION_FAILED,
  recalculateOpeningBalances,
} from "@/lib/server/opening-balances";
import type {
  Month,
  OpeningBalance,
  NextMonthPreview,
  OpeningBalancePreview,
} from "@/types/months";

type ActionResult<T> = { data: T } | { error: string };

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
  const { year, month } = currentYearMonth();
  return createMonth(year, month);
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
      : currentYearMonth();

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
    const fxCache = new Map<string, number | null>();

    // A currency without a rate leaves its accounts at their stored base
    // amount instead of failing the whole preview.
    const getRate = async (from: string): Promise<number | null> => {
      if (from === baseCurrency) return 1;
      if (fxCache.has(from)) return fxCache.get(from)!;
      const result = await getOrFetchFxRate({
        date: fxDate,
        from,
        to: baseCurrency,
      });
      const rate = "error" in result ? null : result.data;
      fxCache.set(from, rate);
      return rate;
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
        if (rate != null) currentOpeningBase = opening.opening_amount * rate;
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

    const { data: existing, error: existingError } = await supabase
      .from("months")
      .select("*")
      .eq("user_id", userId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();
    if (existingError) return { error: existingError.message };

    let monthRow = existing as Month | null;

    if (monthRow) {
      // Already opened: done. A month left without openings by an earlier
      // failure falls through and gets them now.
      const { count: openingCount, error: countError } = await supabase
        .from("opening_balances")
        .select("id", { count: "exact", head: true })
        .eq("month_id", monthRow.id);
      if (countError) return { error: countError.message };
      if ((openingCount ?? 0) > 0) return { data: monthRow };
    } else {
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

    // Openings of the new month (and of later months, unchanged unless they
    // were already off) come from each account's initial balance and legs.
    const rebuilt = await recalculateOpeningBalances(monthRow.id);
    if ("error" in rebuilt) return { error: RECALCULATION_FAILED };

    return { data: monthRow };
  } catch (e) {
    console.error("createMonth:", e);
    return { error: "Error al crear mes" };
  }
}

/** Rebuild the opening balances of every month and account. */
export async function recalculateAllOpeningBalances(): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };
    return await recalculateOpeningBalances(null);
  } catch (e) {
    console.error("recalculateAllOpeningBalances:", e);
    return { error: "Error al recalcular saldos" };
  }
}

export async function getMonthsInRange(
  startMonthId: string,
  endMonthId: string
): Promise<ActionResult<Month[]>> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };
    return await loadMonthsInRange(ctx, startMonthId, endMonthId);
  } catch {
    return { error: "Error al obtener meses del rango" };
  }
}

export async function getOpeningBalances(
  monthId: string
): Promise<ActionResult<OpeningBalance[]>> {
  const ctx = await getServerContext();
  if (!ctx) return { error: "No autenticado" };
  return loadOpeningBalances(ctx, monthId);
}
