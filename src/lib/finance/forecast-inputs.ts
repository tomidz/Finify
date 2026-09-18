import type { TransactionWithRelations } from "@/types/transactions";

import {
  categoryFlow,
  getPrimaryLine,
  legBase,
  UNCATEGORIZED_EXPENSES,
  UNCATEGORIZED_INCOME,
} from "./period-summary";
import type { CashflowInput } from "./project-cashflow";

/*
 * What the forecast (project-cashflow.ts) reads from the recorded movements:
 * the key each one counts under, what each month already has, what comes after
 * today, and the history of the closed months.
 */

/**
 * The investment categories and the investments module count as one line,
 * like the budget page: a purchase recorded from the module executes the plan
 * of any investment category.
 */
export const INVESTMENTS_KEY = "group:investments";

export type CategoryKeyOf = (categoryId: string | null, income: boolean) => string;

export function categoryKeyOf(categoryTypes: ReadonlyMap<string, string>): CategoryKeyOf {
  return (categoryId, income) =>
    categoryId && categoryTypes.get(categoryId) === "investments"
      ? INVESTMENTS_KEY
      : (categoryId ?? (income ? UNCATEGORIZED_INCOME : UNCATEGORIZED_EXPENSES));
}

/**
 * What a movement counts under, positive when received or spent. A module
 * investment counts only what it bought: a sale frees money, it does not undo
 * the month's purchases.
 */
export function forecastFlow(
  tx: TransactionWithRelations,
  keyOf: CategoryKeyOf,
): { key: string; income: boolean; amount: number } | null {
  const flow = categoryFlow(tx);
  if (flow) return { key: keyOf(tx.category_id, flow.income), income: flow.income, amount: flow.amount };
  if (tx.transaction_type !== "investment") return null;
  const bought = tx.amounts.reduce((sum, line) => sum + Math.max(0, -legBase(line)), 0);
  return { key: INVESTMENTS_KEY, income: false, amount: bought };
}

const monthCode = (date: string) => Number(date.slice(0, 4)) * 100 + Number(date.slice(5, 7));

/**
 * What each month from `currentCode` on has recorded per key. A transaction
 * registered from a recurring date counts against that date's month and the
 * template's category, even if edited since; a late one for a past date, in
 * no month ahead.
 */
export function recordedByMonth(input: {
  transactions: readonly TransactionWithRelations[];
  templates: ReadonlyMap<string, { category_id: string | null; type: string }>;
  keyOf: CategoryKeyOf;
  currentCode: number;
}): Map<number, Map<string, number>> {
  const recorded = new Map<number, Map<string, number>>();
  const record = (code: number, key: string, amount: number) => {
    if (code < input.currentCode) return;
    const byKey = recorded.get(code) ?? new Map<string, number>();
    byKey.set(key, (byKey.get(key) ?? 0) + amount);
    recorded.set(code, byKey);
  };
  for (const tx of input.transactions) {
    const template = tx.recurring_id ? input.templates.get(tx.recurring_id) : undefined;
    if (template && tx.occurrence_date) {
      const income = template.type === "income";
      const primary = getPrimaryLine(tx);
      const base = primary ? legBase(primary) : 0;
      record(monthCode(tx.occurrence_date), input.keyOf(template.category_id, income), income ? base : -base);
      continue;
    }
    const flow = forecastFlow(tx, input.keyOf);
    if (flow) record(monthCode(tx.date), flow.key, flow.amount);
  }
  return recorded;
}

/** Movements dated after today: income and expenses as such, the rest as other movements. */
export function recordedAhead(
  transactions: readonly TransactionWithRelations[],
  today: string,
): CashflowInput["recordedAhead"][number][] {
  return transactions
    .filter((tx) => tx.date > today)
    .map((tx) => {
      const flow = categoryFlow(tx);
      return flow
        ? { date: tx.date, base: flow.income ? flow.amount : -flow.amount, income: flow.income }
        : { date: tx.date, base: tx.amounts.reduce((sum, line) => sum + legBase(line), 0), income: null };
    });
}

/** Each key's amount in every closed month, in the order of `closedCodes`. */
export function closedMonthsHistory(
  transactions: readonly TransactionWithRelations[],
  closedCodes: readonly number[],
  keyOf: CategoryKeyOf,
): Map<string, { income: boolean; amounts: number[] }> {
  const index = new Map(closedCodes.map((code, i) => [code, i]));
  const history = new Map<string, { income: boolean; amounts: number[] }>();
  for (const tx of transactions) {
    const i = index.get(monthCode(tx.date));
    const flow = forecastFlow(tx, keyOf);
    if (i == null || !flow) continue;
    const entry = history.get(flow.key) ?? { income: flow.income, amounts: closedCodes.map(() => 0) };
    entry.amounts[i] += flow.amount;
    history.set(flow.key, entry);
  }
  return history;
}
