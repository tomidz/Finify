"use server";

import { currentYearMonth } from "@/lib/dates";
import { defaultMonth, toYearMonthCode } from "@/lib/months";
import { loadBudgetSummaryRange } from "@/lib/server/budget";
import { getServerContext, loadBaseCurrency } from "@/lib/server/context";
import { loadCurrencies } from "@/lib/server/currencies";
import { loadForecast } from "@/lib/server/forecast";
import { loadMonths } from "@/lib/server/months";
import {
  loadAccountNetWorth,
  loadLiabilitiesForYear,
  loadNetWorthEvolution,
  warmTodayRates,
} from "@/lib/server/net-worth";
import { loadOpeningBalances } from "@/lib/server/opening-balances";
import { loadTransactionsForMonths } from "@/lib/server/transactions";
import type { Currency } from "@/types/accounts";
import type { BudgetSummaryVsActual } from "@/types/budget";
import type { ForecastPoint } from "@/types/forecast";
import type { Month, OpeningBalance } from "@/types/months";
import type {
  AccountNetWorthSummary,
  LiabilitiesSummary,
  NetWorthEvolutionPoint,
} from "@/types/net-worth";
import type { TransactionWithRelations } from "@/types/transactions";

/*
 * One server action per screen. The client dispatches server actions one at a
 * time, so a page built from N independent read actions waited for N round
 * trips in sequence. Each screen action validates the session once and runs
 * its reads in parallel on the server.
 */

type ActionResult<T> = { data: T } | { error: string };

function unwrap<T>(result: { data: T } | { error: string }): T {
  if ("error" in result) throw new ScreenReadError(result.error);
  return result.data;
}

class ScreenReadError extends Error {}

/** For sections the screen can render without: log and leave them out. */
function orNull(section: string) {
  return <T>(result: { data: T } | { error: string }): T | null => {
    if (!("error" in result)) return result.data;
    console.error(`screens: ${section} failed:`, result.error);
    return null;
  };
}

export type DashboardData = {
  months: Month[];
  startMonthId: string | null;
  endMonthId: string | null;
  baseCurrency: string;
  currencies: Currency[];
  transactions: TransactionWithRelations[];
  openingBalances: OpeningBalance[];
  budgetSummary: BudgetSummaryVsActual | null;
  /** Only for a single-month view. */
  forecast: ForecastPoint[] | null;
};

export async function getDashboardData(input: {
  startMonthId: string | null;
  endMonthId: string | null;
}): Promise<ActionResult<DashboardData>> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };

    const [months, baseCurrency, currencies] = await Promise.all([
      loadMonths(ctx).then(unwrap),
      loadBaseCurrency(ctx).then(unwrap),
      loadCurrencies(ctx.supabase).then(unwrap),
    ]);

    const empty: DashboardData = {
      months,
      startMonthId: null,
      endMonthId: null,
      baseCurrency,
      currencies,
      transactions: [],
      openingBalances: [],
      budgetSummary: null,
      forecast: null,
    };
    if (months.length === 0) return { data: empty };

    // Unknown ids fall back to the current month (see defaultMonth), and a
    // start after the end collapses the range to the end month.
    const byId = new Map(months.map((m) => [m.id, m]));
    const fallback = defaultMonth(months, currentYearMonth()) ?? months[0];
    const end = byId.get(input.endMonthId ?? "") ?? fallback;
    let start = byId.get(input.startMonthId ?? "") ?? fallback;
    if (toYearMonthCode(start.year, start.month) > toYearMonthCode(end.year, end.month)) {
      start = end;
    }
    const startCode = toYearMonthCode(start.year, start.month);
    const endCode = toYearMonthCode(end.year, end.month);
    const monthIds = months
      .filter((m) => {
        const code = toYearMonthCode(m.year, m.month);
        return code >= startCode && code <= endCode;
      })
      .map((m) => m.id);
    const isSingleMonth = start.id === end.id;

    const [transactions, openingBalances, budgetSummary, forecast] =
      await Promise.all([
        loadTransactionsForMonths(ctx, monthIds, baseCurrency).then(unwrap),
        loadOpeningBalances(ctx, start.id).then(unwrap),
        loadBudgetSummaryRange(ctx, start.id, end.id).then(orNull("budget summary")),
        isSingleMonth
          ? loadForecast(ctx, baseCurrency, 6).then(orNull("forecast"))
          : Promise.resolve(null),
      ]);

    return {
      data: {
        ...empty,
        startMonthId: start.id,
        endMonthId: end.id,
        transactions,
        openingBalances,
        budgetSummary,
        forecast,
      },
    };
  } catch (e) {
    if (e instanceof ScreenReadError) return { error: e.message };
    console.error("getDashboardData:", e);
    return { error: "Error al cargar el dashboard" };
  }
}

export type NetWorthData = {
  years: number[];
  year: number | null;
  baseCurrency: string;
  currencies: Currency[];
  months: Month[];
  accounts: AccountNetWorthSummary | null;
  liabilities: LiabilitiesSummary | null;
  evolution: NetWorthEvolutionPoint[];
};

export async function getNetWorthData(input: {
  year: number | null;
}): Promise<ActionResult<NetWorthData>> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };

    const [months, baseCurrency, currencies] = await Promise.all([
      loadMonths(ctx).then(unwrap),
      loadBaseCurrency(ctx).then(unwrap),
      loadCurrencies(ctx.supabase).then(unwrap),
    ]);

    const years = [...new Set(months.map((m) => m.year))].sort((a, b) => b - a);
    const year =
      input.year != null && years.includes(input.year) ? input.year : (years[0] ?? null);

    if (year == null) {
      return {
        data: {
          years,
          year: null,
          baseCurrency,
          currencies,
          months,
          accounts: null,
          liabilities: null,
          evolution: [],
        },
      };
    }

    await warmTodayRates(ctx, baseCurrency);
    const [accounts, liabilities, evolution] = await Promise.all([
      loadAccountNetWorth(ctx, year).then(unwrap),
      loadLiabilitiesForYear(ctx, year).then(unwrap),
      loadNetWorthEvolution(ctx, year).then(unwrap),
    ]);

    return {
      data: { years, year, baseCurrency, currencies, months, accounts, liabilities, evolution },
    };
  } catch (e) {
    if (e instanceof ScreenReadError) return { error: e.message };
    console.error("getNetWorthData:", e);
    return { error: "Error al cargar el patrimonio" };
  }
}
