"use server";

import { currentYearMonth } from "@/lib/dates";
import { defaultMonth, toYearMonthCode } from "@/lib/months";
import { loadBudgetSummaryRange } from "@/lib/server/budget";
import { ActionError, unwrapResult, type ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/log";
import { getServerContext, loadBaseCurrency } from "@/lib/server/context";
import { loadCurrencies } from "@/lib/server/currencies";
import { loadForecast } from "@/lib/server/forecast";
import { loadMonths } from "@/lib/server/months";
import {
  loadAccountNetWorth,
  loadLiabilitiesForYear,
  loadNetWorthEvolution,
  warmCloseRates,
} from "@/lib/server/net-worth";
import { loadPeriodSummary, type PeriodSummaryData } from "@/lib/server/period-summary";
import type { Currency } from "@/types/accounts";
import type { BudgetSummaryVsActual } from "@/types/budget";
import type { ForecastPoint } from "@/types/forecast";
import type { Month } from "@/types/months";
import type {
  AccountNetWorthSummary,
  LiabilitiesSummary,
  NetWorthEvolutionPoint,
} from "@/types/net-worth";

/*
 * One server action per screen. The client dispatches server actions one at a
 * time, so a page built from N independent read actions waited for N round
 * trips in sequence. Each screen action validates the session once and runs
 * its reads in parallel on the server.
 */

/** For sections the screen can render without: log and leave them out. */
function orNull(section: string) {
  return <T>(result: ActionResult<T>): T | null => {
    if (!("error" in result)) return result.data;
    logError("screenSection", result.error, { section });
    return null;
  };
}

export type DashboardData = {
  months: Month[];
  startMonthId: string | null;
  endMonthId: string | null;
  baseCurrency: string;
  currencies: Currency[];
  /** Null only while there are no months. */
  period: PeriodSummaryData | null;
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
      loadMonths(ctx).then(unwrapResult),
      loadBaseCurrency(ctx).then(unwrapResult),
      loadCurrencies(ctx.supabase).then(unwrapResult),
    ]);

    const empty: DashboardData = {
      months,
      startMonthId: null,
      endMonthId: null,
      baseCurrency,
      currencies,
      period: null,
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
    const isSingleMonth = start.id === end.id;

    const [period, budgetSummary, forecast] = await Promise.all([
      loadPeriodSummary(ctx, { months, start, end, baseCurrency }).then(unwrapResult),
      loadBudgetSummaryRange(ctx, start.id, end.id).then(orNull("budget summary")),
      isSingleMonth
        ? loadForecast(ctx, baseCurrency, 6, months).then(orNull("forecast"))
        : Promise.resolve(null),
    ]);

    return {
      data: {
        ...empty,
        startMonthId: start.id,
        endMonthId: end.id,
        period,
        budgetSummary,
        forecast,
      },
    };
  } catch (e) {
    // A failed read was logged where it failed.
    if (e instanceof ActionError) return { error: e.message };
    logError("getDashboardData", e);
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
      loadMonths(ctx).then(unwrapResult),
      loadBaseCurrency(ctx).then(unwrapResult),
      loadCurrencies(ctx.supabase).then(unwrapResult),
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

    // Every month of the year: the evolution reads each one's close.
    await warmCloseRates(ctx, baseCurrency, { months, year });
    const [accounts, liabilities, evolution] = await Promise.all([
      loadAccountNetWorth(ctx, year).then(unwrapResult),
      loadLiabilitiesForYear(ctx, year).then(unwrapResult),
      loadNetWorthEvolution(ctx, year).then(unwrapResult),
    ]);

    return {
      data: { years, year, baseCurrency, currencies, months, accounts, liabilities, evolution },
    };
  } catch (e) {
    // A failed read was logged where it failed.
    if (e instanceof ActionError) return { error: e.message };
    logError("getNetWorthData", e);
    return { error: "Error al cargar el patrimonio" };
  }
}
