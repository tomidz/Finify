import "server-only";

import { addDays, currentYearMonth, today } from "@/lib/dates";
import {
  categoryKeyOf,
  closedMonthsHistory,
  recordedAhead,
  recordedByMonth,
} from "@/lib/finance/forecast-inputs";
import { computePeriodSummary } from "@/lib/finance/period-summary";
import { projectCashflow, type CashflowInput } from "@/lib/finance/project-cashflow";
import { MONTH_NAMES } from "@/lib/format";
import { defaultMonth, toYearMonthCode } from "@/lib/months";
import type { ServerContext } from "@/lib/server/context";
import { resolveFxRates } from "@/lib/server/fx-range";
import { loadMonths } from "@/lib/server/months";
import { loadOpeningBalances } from "@/lib/server/opening-balances";
import { loadRecurringOccurrences } from "@/lib/server/recurring-calendar";
import { loadTransactionsForMonths } from "@/lib/server/transactions";
import type { ForecastPoint } from "@/types/forecast";
import type { Month } from "@/types/months";

type Result<T> = { data: T } | { error: string };

/** Closed months whose median stands in for a category with no recurring or plan. */
const HISTORY_MONTHS = 6;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The balance from today to the end of the month `monthsAhead` months from
 * now: today's balance at today's rates (as the dashboard values it), then
 * each month's recorded movements, recurring dates, budget plans and the
 * median of the closed months (see projectCashflow).
 */
export async function loadForecast(
  ctx: ServerContext,
  baseCurrency: string,
  monthsAhead: number = 6,
  /** The user's months, when the caller already has them. */
  loadedMonths?: Month[],
): Promise<Result<ForecastPoint[]>> {
  try {
    const months = loadedMonths ? { data: loadedMonths } : await loadMonths(ctx);
    if ("error" in months) return months;
    const current = currentYearMonth();
    const anchor = defaultMonth(months.data, current);
    if (!anchor) return { data: [] };

    const todayStr = today();
    const currentCode = toYearMonthCode(current.year, current.month);
    const horizonIndex = current.month - 1 + monthsAhead;
    const horizon = { year: current.year + Math.floor(horizonIndex / 12), month: (horizonIndex % 12) + 1 };
    const horizonCode = toYearMonthCode(horizon.year, horizon.month);
    const codeOf = (m: { year: number; month: number }) => toYearMonthCode(m.year, m.month);

    const aheadMonths = months.data.filter((m) => codeOf(m) >= codeOf(anchor) && codeOf(m) <= horizonCode);
    const closedMonths = months.data
      .filter((m) => codeOf(m) < currentCode)
      .sort((a, b) => codeOf(b) - codeOf(a))
      .slice(0, HISTORY_MONTHS);
    const monthIds = [...new Set([...aheadMonths, ...closedMonths].map((m) => m.id))];
    const codeByMonthId = new Map(months.data.map((m) => [m.id, codeOf(m)]));
    const planMonthIds = aheadMonths.filter((m) => codeOf(m) >= currentCode).map((m) => m.id);

    const [transactions, openings, calendar, plans, categories] = await Promise.all([
      loadTransactionsForMonths(ctx, monthIds, baseCurrency),
      loadOpeningBalances(ctx, anchor.id),
      loadRecurringOccurrences(ctx, current, horizon),
      planMonthIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : ctx.supabase
            .from("budget_month_plans")
            .select("month_id, planned_amount, budget_lines!inner ( category_id, budget_categories ( category_type ) )")
            .in("month_id", planMonthIds),
      ctx.supabase.from("budget_categories").select("id, category_type").eq("user_id", ctx.userId),
    ]);
    if ("error" in transactions) return transactions;
    if ("error" in openings) return openings;
    if ("error" in calendar) return calendar;
    if (plans.error) return { error: plans.error.message };
    if (categories.error) return { error: categories.error.message };

    const keyOf = categoryKeyOf(new Map((categories.data ?? []).map((c) => [c.id, c.category_type as string])));

    const aheadIds = new Set(aheadMonths.map((m) => m.id));
    const aheadTransactions = transactions.data.filter((tx) => aheadIds.has(tx.month_id ?? ""));

    // Rates for today's balance and for the recurring amounts.
    const openDate = addDays(`${anchor.year}-${pad(anchor.month)}-01`, -1);
    const currencies = new Set<string>();
    for (const ob of openings.data) currencies.add(ob.account_currency);
    for (const tx of aheadTransactions) for (const line of tx.amounts) currencies.add(line.original_currency);
    for (const occurrence of calendar.data) currencies.add(occurrence.recurring.currency);
    currencies.delete(baseCurrency);
    // A recurring date already registered is valued at its own rate, like
    // the transaction registered from it; one still due at today's.
    const occurrenceRateDate = (date: string, registered: boolean) =>
      registered && date < todayStr ? date : todayStr;
    const rateAt = await resolveFxRates(
      ctx.supabase,
      [
        ...[...currencies].flatMap((from) => [
          { date: openDate, from },
          { date: todayStr, from },
        ]),
        ...calendar.data
          .filter((o) => o.recurring.currency !== baseCurrency && o.registered && o.date < todayStr)
          .map((o) => ({ date: o.date, from: o.recurring.currency })),
      ],
      baseCurrency,
    );

    const { summary } = computePeriodSummary({
      transactions: aheadTransactions.filter((tx) => tx.date <= todayStr),
      openingBalances: openings.data,
      baseCurrency,
      rates: {
        openDate,
        closeDate: todayStr,
        opening: Object.fromEntries([...currencies].map((c) => [c, rateAt(openDate, c)])),
        closing: Object.fromEntries(
          [...currencies].map((c) => {
            const rate = rateAt(todayStr, c);
            const rateDate = rateAt.rateDate(todayStr, c);
            return [c, rate != null && rateDate != null ? { rate, rateDate } : null];
          }),
        ),
      },
      today: todayStr,
    });

    const templates = new Map(calendar.data.map((o) => [o.recurring.id, o.recurring]));
    const recorded = recordedByMonth({ transactions: aheadTransactions, templates, keyOf, currentCode });
    const ahead = recordedAhead(aheadTransactions, todayStr);

    // Every date, registered or not: what the month already recorded is
    // subtracted from it, however it was entered. Without a rate, the
    // category falls back to its plan or median.
    const occurrences: CashflowInput["occurrences"][number][] = [];
    for (const { recurring, date, registered } of calendar.data) {
      const income = recurring.type === "income";
      const rate =
        recurring.currency === baseCurrency ? 1 : rateAt(occurrenceRateDate(date, registered), recurring.currency);
      if (rate == null) continue;
      const amount = Math.abs(recurring.amount) * rate;
      occurrences.push({ date, base: income ? amount : -amount, key: keyOf(recurring.category_id, income) });
    }

    const planTotals = new Map<string, CashflowInput["plans"][number]>();
    for (const row of (plans.data ?? []) as unknown as {
      month_id: string;
      planned_amount: number | string;
      budget_lines: { category_id: string; budget_categories: { category_type: string } | null } | null;
    }[]) {
      const code = codeByMonthId.get(row.month_id);
      const categoryId = row.budget_lines?.category_id;
      if (code == null || !categoryId) continue;
      const income = row.budget_lines?.budget_categories?.category_type === "income";
      const key = keyOf(categoryId, income);
      const id = `${code}|${key}`;
      const total = planTotals.get(id) ?? {
        year: Math.floor(code / 100),
        month: code % 100,
        key,
        income,
        planned: 0,
      };
      total.planned += Number(row.planned_amount);
      planTotals.set(id, total);
    }

    const history = closedMonthsHistory(
      transactions.data,
      closedMonths.map((m) => codeOf(m)),
      keyOf,
    );

    const projected = projectCashflow({
      today: todayStr,
      monthsAhead,
      balanceToday: summary.closingBase,
      recordedAhead: ahead,
      occurrences,
      plans: [...planTotals.values()],
      recordedByMonth: recorded,
      history,
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;
    return {
      data: [
        {
          year: current.year,
          month: current.month,
          label: "Hoy",
          projected_balance: round2(summary.closingBase),
          projected_income: 0,
          projected_expenses: 0,
          is_actual: true,
          sources: [],
        },
        ...projected.map((point) => ({
          year: point.year,
          month: point.month,
          label: `${MONTH_NAMES[point.month - 1].slice(0, 3)} ${point.year}`,
          projected_balance: round2(point.balance),
          projected_income: round2(point.income),
          projected_expenses: round2(point.expenses),
          is_actual: false,
          sources: point.sources,
        })),
      ],
    };
  } catch (e) {
    console.error("loadForecast:", e);
    return { error: "Error al generar el forecast" };
  }
}
