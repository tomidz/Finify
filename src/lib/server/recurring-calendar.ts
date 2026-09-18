import "server-only";

import { toYearMonthCode } from "@/lib/months";
import { getExpectedDatesInMonth } from "@/lib/recurrence";
import type { ServerContext } from "@/lib/server/context";
import { readAllRows } from "@/lib/server/paginate";
import type { RecurringWithRelations } from "@/types/recurring";

type Result<T> = { data: T } | { error: string };
type YearMonth = { year: number; month: number };

/** Tolerance for matching recurring amounts against existing transactions (15%) */
const RECURRING_AMOUNT_TOLERANCE = 0.15;

export type RecurringOccurrence = {
  recurring: RecurringWithRelations;
  /** yyyy-MM-dd */
  date: string;
  registered: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Every date the active recurring templates fall on from month `from` to month
 * `to`, each marked registered when a transaction was created from it or one
 * entered by hand in that month matches it.
 */
export async function loadRecurringOccurrences(
  { supabase, userId }: ServerContext,
  from: YearMonth,
  to: YearMonth,
): Promise<Result<RecurringOccurrence[]>> {
  const { data: recurrings, error: recError } = await supabase
    .from("recurring_transactions")
    .select(
      `
        *,
        accounts ( name ),
        budget_categories ( name ),
        currencies!currency ( symbol )
      `,
    )
    .eq("user_id", userId)
    .eq("is_active", true);
  if (recError) return { error: recError.message };
  if (!recurrings || recurrings.length === 0) return { data: [] };

  const months: YearMonth[] = [];
  for (let { year, month } = from; toYearMonthCode(year, month) <= toYearMonthCode(to.year, to.month); ) {
    months.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  const firstDay = `${from.year}-${pad(from.month)}-01`;
  const lastDay = `${to.year}-${pad(to.month)}-${pad(new Date(to.year, to.month, 0).getDate())}`;

  // Occurrences registered from a template, wherever their transaction's
  // date ended up.
  const linkedRead = await readAllRows(({ from: start, to: end, count }) =>
    supabase
      .from("transactions")
      .select("id, recurring_id, occurrence_date", { count })
      .eq("user_id", userId)
      .not("recurring_id", "is", null)
      .gte("occurrence_date", firstDay)
      .lte("occurrence_date", lastDay)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(start, end),
  );
  if ("error" in linkedRead) return { error: linkedRead.error.message };
  const linked = new Set(linkedRead.data.map((tx) => `${tx.recurring_id}:${tx.occurrence_date}`));

  // Transactions entered by hand, matched approximately within their month.
  const { data: monthRows, error: monthsError } = await supabase
    .from("months")
    .select("id, year, month")
    .eq("user_id", userId)
    .gte("year", from.year)
    .lte("year", to.year);
  if (monthsError) return { error: monthsError.message };
  const codeByMonthId = new Map(
    (monthRows ?? [])
      .map((m) => [m.id, toYearMonthCode(m.year, m.month)] as const)
      .filter(
        ([, code]) =>
          code >= toYearMonthCode(from.year, from.month) && code <= toYearMonthCode(to.year, to.month),
      ),
  );
  const handEntered = new Map<number, { description: string; account_id: string; amount: number }[]>();
  if (codeByMonthId.size > 0) {
    const read = await readAllRows(({ from: start, to: end, count }) =>
      supabase
        .from("transactions")
        .select("id, month_id, description, transaction_amounts ( account_id, amount )", { count })
        .eq("user_id", userId)
        .in("month_id", [...codeByMonthId.keys()])
        .is("recurring_id", null)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(start, end),
    );
    if ("error" in read) return { error: read.error.message };
    for (const tx of read.data) {
      const code = codeByMonthId.get(tx.month_id ?? "");
      if (code == null) continue;
      const firstLine = Array.isArray(tx.transaction_amounts) ? tx.transaction_amounts[0] : tx.transaction_amounts;
      const list = handEntered.get(code) ?? [];
      list.push({
        description: (tx.description ?? "").toLowerCase().trim(),
        account_id: firstLine?.account_id ?? "",
        amount: Math.abs(Number(firstLine?.amount ?? 0)),
      });
      handEntered.set(code, list);
    }
  }

  const occurrences: RecurringOccurrence[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const rec of recurrings as any[]) {
    // Parse as local midnight so getDate()/getDay()/getMonth() are correct
    // regardless of timezone offset.
    const startStr = String(rec.start_date).slice(0, 10);
    const endStr = rec.end_date ? String(rec.end_date).slice(0, 10) : null;
    const startDate = new Date(`${startStr}T00:00:00`);

    const recurring: RecurringWithRelations = {
      ...rec,
      amount: Number(rec.amount),
      exchange_rate: rec.exchange_rate ? Number(rec.exchange_rate) : null,
      base_amount: rec.base_amount ? Number(rec.base_amount) : null,
      account_name: rec.accounts?.name ?? "",
      category_name: rec.budget_categories?.name ?? null,
      currency_symbol: rec.currencies?.symbol ?? rec.currency,
    };
    const descLower = rec.description.toLowerCase().trim();
    const recAmount = Math.abs(Number(rec.amount));

    for (const { year, month } of months) {
      // Per-recurrence generators work on the calendar month, so dates before
      // the start or after the end are dropped here.
      const dates = getExpectedDatesInMonth(rec.recurrence, rec.day_of_month, rec.day_of_week, year, month, startDate)
        .filter((d) => d >= startStr && (!endStr || d <= endStr));
      const entries = handEntered.get(toYearMonthCode(year, month)) ?? [];

      for (const date of dates) {
        if (linked.has(`${rec.id}:${date}`)) {
          occurrences.push({ recurring, date, registered: true });
          continue;
        }
        // A matching transaction covers exactly ONE occurrence: consume it so
        // a single payment doesn't mark every weekly date as registered. The
        // comparison is in the account's currency, which is the template's: a
        // base amount fixed when the template was created drifts with the
        // exchange rate.
        const matchIndex = entries.findIndex(
          (tx) =>
            tx.description === descLower &&
            tx.account_id === rec.account_id &&
            Math.abs(tx.amount - recAmount) / (recAmount || 1) < RECURRING_AMOUNT_TOLERANCE,
        );
        if (matchIndex !== -1) entries.splice(matchIndex, 1);
        occurrences.push({ recurring, date, registered: matchIndex !== -1 });
      }
    }
  }
  return { data: occurrences };
}
