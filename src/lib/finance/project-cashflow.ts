import { toYearMonthCode } from "@/lib/months";

/*
 * The balance projected month by month from today's. For each month and each
 * category it expects the larger of what its recurring templates fall on and
 * its estimate: the budget plan, else the median of the closed months. What
 * that month already has recorded is subtracted from it, and movements
 * recorded after today count as they are.
 */

export type ForecastSource = "cargados" | "recurrentes" | "presupuesto" | "historial";

export interface ProjectedMonth {
  year: number;
  month: number;
  income: number;
  expenses: number;
  /** Closing balance of the month. */
  balance: number;
  sources: ForecastSource[];
}

export interface CashflowInput {
  today: string;
  monthsAhead: number;
  /** All accounts, in the base currency, as of today. */
  balanceToday: number;
  /** Movements dated after today, in the base currency (negative leaves). */
  recordedAhead: readonly { date: string; base: number; income: boolean | null }[];
  /** Every date a recurring template falls on, registered or not, with its base amount (negative leaves). */
  occurrences: readonly { date: string; base: number; key: string }[];
  /** Budget plans by month and category key; positive amounts either way. */
  plans: readonly { year: number; month: number; key: string; income: boolean; planned: number }[];
  /**
   * What each category key has recorded in each month (yyyymm), positive: for
   * the current month everything, before and after today.
   */
  recordedByMonth: ReadonlyMap<number, ReadonlyMap<string, number>>;
  /** Each category key's amount in every closed month used as history; positive. */
  history: ReadonlyMap<string, { income: boolean; amounts: readonly number[] }>;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function projectCashflow(input: CashflowInput): ProjectedMonth[] {
  const [year, month] = input.today.split("-").map(Number);
  const codeOf = (date: string) => Number(date.slice(0, 4)) * 100 + Number(date.slice(5, 7));

  const months: ProjectedMonth[] = [];
  let balance = input.balanceToday;
  for (let offset = 0; offset <= input.monthsAhead; offset += 1) {
    const y = year + Math.floor((month - 1 + offset) / 12);
    const m = ((month - 1 + offset) % 12) + 1;
    const code = toYearMonthCode(y, m);
    const sources = new Set<ForecastSource>();
    let income = 0;
    let expenses = 0;
    const add = (amount: number, isIncome: boolean) => {
      if (isIncome) income += amount;
      else expenses += amount;
    };
    let other = 0;

    for (const movement of input.recordedAhead) {
      if (codeOf(movement.date) !== code) continue;
      sources.add("cargados");
      if (movement.income === null) other += movement.base;
      else add(movement.income ? movement.base : -movement.base, movement.income);
    }
    const recurring = new Map<string, { amount: number; income: boolean }>();
    for (const occurrence of input.occurrences) {
      if (codeOf(occurrence.date) !== code) continue;
      const entry = recurring.get(occurrence.key) ?? { amount: 0, income: occurrence.base > 0 };
      entry.amount += Math.abs(occurrence.base);
      recurring.set(occurrence.key, entry);
    }
    const plans = new Map(
      input.plans.filter((plan) => toYearMonthCode(plan.year, plan.month) === code).map((plan) => [plan.key, plan]),
    );
    const recorded = input.recordedByMonth.get(code);

    for (const key of new Set([...recurring.keys(), ...plans.keys(), ...input.history.keys()])) {
      const fromRecurring = recurring.get(key);
      const plan = plans.get(key);
      const history = input.history.get(key);
      const estimate = plan ? plan.planned : history ? median(history.amounts) : 0;
      const recurringAmount = fromRecurring?.amount ?? 0;
      const byRecurring = recurringAmount > 0 && recurringAmount >= estimate;
      // Only what is left: the recorded part is counted above or already in
      // today's balance.
      // A sale or a refund recorded under the key does not add to what is left.
      const alreadyRecorded = Math.max(0, recorded?.get(key) ?? 0);
      const amount = Math.max(0, (byRecurring ? recurringAmount : estimate) - alreadyRecorded);
      if (amount === 0) continue;
      sources.add(byRecurring ? "recurrentes" : plan ? "presupuesto" : "historial");
      add(amount, fromRecurring?.income ?? plan?.income ?? history?.income ?? false);
    }

    balance += income - expenses + other;
    months.push({ year: y, month: m, income, expenses, balance, sources: [...sources] });
  }
  return months;
}
