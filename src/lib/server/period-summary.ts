import "server-only";

import type { ActionResult } from "@/lib/action-result";
import { addDays, monthCloseDate, today } from "@/lib/dates";
import {
  computePeriodSummary,
  type AccountBalance,
  type BalanceRates,
  type PeriodSummary,
} from "@/lib/finance/period-summary";
import { toYearMonthCode } from "@/lib/months";
import type { ServerContext } from "@/lib/server/context";
import { resolveFxRates } from "@/lib/server/fx-range";
import { loadOpeningBalances } from "@/lib/server/opening-balances";
import { loadTransactionsForMonths } from "@/lib/server/transactions";
import type { Month } from "@/types/months";

export type PeriodSummaryData = { summary: PeriodSummary; accountBalances: AccountBalance[] };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The summary of the months from `start` to `end`: their movements, the
 * opening balances of `start`, and the rates to value the balances the day
 * before the period and at its close (today for the current month).
 */
export async function loadPeriodSummary(
  ctx: ServerContext,
  input: { months: readonly Month[]; start: Month; end: Month; baseCurrency: string },
): Promise<ActionResult<PeriodSummaryData>> {
  const { start, end, baseCurrency } = input;
  const startCode = toYearMonthCode(start.year, start.month);
  const endCode = toYearMonthCode(end.year, end.month);
  const monthIds = input.months
    .filter((m) => {
      const code = toYearMonthCode(m.year, m.month);
      return code >= startCode && code <= endCode;
    })
    .map((m) => m.id);

  const [transactions, openingBalances] = await Promise.all([
    loadTransactionsForMonths(ctx, monthIds, baseCurrency),
    loadOpeningBalances(ctx, start.id),
  ]);
  if ("error" in transactions) return transactions;
  if ("error" in openingBalances) return openingBalances;

  const todayStr = today();
  const openDate = addDays(`${start.year}-${pad(start.month)}-01`, -1);
  const closeDate = monthCloseDate(end.year, end.month, todayStr);

  const currencies = new Set<string>();
  for (const ob of openingBalances.data) currencies.add(ob.account_currency);
  for (const tx of transactions.data) for (const line of tx.amounts) currencies.add(line.original_currency);
  currencies.delete(baseCurrency);

  const rateAt = await resolveFxRates(
    ctx.supabase,
    [...currencies].flatMap((from) => [
      { date: openDate, from },
      { date: closeDate, from },
    ]),
    baseCurrency,
  );
  const rates: BalanceRates = { openDate, closeDate, opening: {}, closing: {} };
  for (const currency of currencies) {
    rates.opening[currency] = rateAt(openDate, currency);
    const closing = rateAt(closeDate, currency);
    const rateDate = rateAt.rateDate(closeDate, currency);
    rates.closing[currency] = closing != null && rateDate != null ? { rate: closing, rateDate } : null;
  }

  return {
    data: computePeriodSummary({
      transactions: transactions.data,
      openingBalances: openingBalances.data,
      baseCurrency,
      rates,
      today: todayStr,
    }),
  };
}
