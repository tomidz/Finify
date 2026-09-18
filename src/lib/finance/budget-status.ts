import type { BudgetCategorySummary, BudgetCategoryType } from "@/types/budget";

/*
 * How a budget line is doing, by what its category is for: spending less than
 * planned is good for expenses, and collecting or putting aside more is good
 * for income, savings and investments. Every screen and the agent read the
 * status and the variance from here.
 */

export type BudgetGroup = "income" | "expenses" | "savings" | "investments";

export type BudgetStatus = "no-plan" | "favorable" | "watch" | "unfavorable";

export interface BudgetExecution {
  planned: number;
  actual: number;
  /**
   * Positive when favorable: under plan for expenses, over plan for the rest.
   * (A category's `variance` from the budget RPC is always planned − actual.)
   */
  favorableVariance: number;
  /** Actual over planned; null without a plan. */
  percent: number | null;
  status: BudgetStatus;
}

export const BUDGET_GROUP_OF: Record<BudgetCategoryType, BudgetGroup> = {
  income: "income",
  essential_expenses: "expenses",
  discretionary_expenses: "expenses",
  debt_payments: "expenses",
  savings: "savings",
  investments: "investments",
};

/** Share of the plan from which an expense is close to its limit. */
const EXPENSE_WATCH_PERCENT = 90;
/** Share of the plan under which income, savings or investments fall short. */
const SHORTFALL_PERCENT = 80;

export function budgetExecution(group: BudgetGroup, planned: number, actual: number): BudgetExecution {
  const lessIsBetter = group === "expenses";
  const favorableVariance = lessIsBetter ? planned - actual : actual - planned;
  if (planned <= 0) return { planned, actual, favorableVariance, percent: null, status: "no-plan" };

  const percent = (actual / planned) * 100;
  const status: BudgetStatus = lessIsBetter
    ? percent > 100
      ? "unfavorable"
      : percent > EXPENSE_WATCH_PERCENT
        ? "watch"
        : "favorable"
    : percent >= 100
      ? "favorable"
      : percent >= SHORTFALL_PERCENT
        ? "watch"
        : "unfavorable";
  return { planned, actual, favorableVariance, percent, status };
}

export function categoryExecution(category: Pick<BudgetCategorySummary, "category_type" | "planned_amount" | "actual_amount">) {
  return budgetExecution(BUDGET_GROUP_OF[category.category_type], category.planned_amount, category.actual_amount);
}

/** Plan and actual per group, never adding income and expenses together. */
export function budgetTotalsByGroup(
  categories: readonly Pick<BudgetCategorySummary, "category_type" | "planned_amount" | "actual_amount">[],
): Record<BudgetGroup, BudgetExecution> {
  const sums: Record<BudgetGroup, { planned: number; actual: number }> = {
    income: { planned: 0, actual: 0 },
    expenses: { planned: 0, actual: 0 },
    savings: { planned: 0, actual: 0 },
    investments: { planned: 0, actual: 0 },
  };
  for (const category of categories) {
    const sum = sums[BUDGET_GROUP_OF[category.category_type]];
    sum.planned += category.planned_amount;
    sum.actual += category.actual_amount;
  }
  return {
    income: budgetExecution("income", sums.income.planned, sums.income.actual),
    expenses: budgetExecution("expenses", sums.expenses.planned, sums.expenses.actual),
    savings: budgetExecution("savings", sums.savings.planned, sums.savings.actual),
    investments: budgetExecution("investments", sums.investments.planned, sums.investments.actual),
  };
}

/** What is still planned to be spent: each expense category's plan minus its actual, when positive. */
export function remainingPlannedExpenses(
  categories: readonly Pick<BudgetCategorySummary, "category_type" | "planned_amount" | "actual_amount">[],
): number {
  return categories
    .filter((category) => BUDGET_GROUP_OF[category.category_type] === "expenses")
    .reduce((sum, category) => sum + Math.max(0, category.planned_amount - category.actual_amount), 0);
}

export const BUDGET_STATUS_TONE: Record<BudgetStatus, string> = {
  "no-plan": "text-muted-foreground",
  favorable: "text-green-600",
  watch: "text-yellow-600",
  unfavorable: "text-red-600",
};

export const BUDGET_STATUS_FILL: Record<BudgetStatus, string> = {
  "no-plan": "#94a3b8",
  favorable: "#16a34a",
  watch: "#ca8a04",
  unfavorable: "#dc2626",
};
