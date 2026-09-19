import type { BudgetStatus } from "@/lib/finance/budget-status";
import type { BudgetCategoryType } from "@/types/budget";

/** The five theme chart hues; globals.css sets them for light and dark. */
export const CHART_SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/** Strong neutral: the one series that is the reference, e.g. income. */
export const CHART_PRIMARY = "var(--foreground)";
/** Muted neutral: "other", "no plan", uncategorized, reference lines. */
export const CHART_NEUTRAL = "var(--muted-foreground)";
export const CHART_GRID = "var(--border)";

// Past five series the hues repeat, greyed toward the muted foreground (mixing
// toward the background turns them near-black in dark mode).
const MIX_ROUNDS = [100, 60, 30] as const;

/** Color of the n-th series (0-based) for lists of any length. */
export function seriesColor(index: number): string {
  const safe = Math.max(0, Math.floor(index));
  const base = CHART_SERIES[safe % CHART_SERIES.length];
  const mix = MIX_ROUNDS[Math.floor(safe / CHART_SERIES.length) % MIX_ROUNDS.length];
  return mix === 100 ? base : `color-mix(in oklch, ${base} ${mix}%, var(--muted-foreground))`;
}

/**
 * Budget category types. Income is the neutral reference; the five outflow
 * types take the five hues, ordered so pie neighbours differ in light mode.
 */
export const CATEGORY_TYPE_COLORS: Record<BudgetCategoryType, string> = {
  income: CHART_PRIMARY,
  essential_expenses: "var(--chart-1)",
  discretionary_expenses: "var(--chart-2)",
  debt_payments: "var(--chart-4)",
  savings: "var(--chart-3)",
  investments: "var(--chart-5)",
};

/** Expenses with no category. */
export const UNCATEGORIZED_COLOR = CHART_NEUTRAL;

/** Budget execution status, from the semantic theme colors. */
export const BUDGET_STATUS_COLORS: Record<BudgetStatus, string> = {
  "no-plan": CHART_NEUTRAL,
  favorable: "var(--success)",
  watch: "var(--warning)",
  unfavorable: "var(--destructive)",
};
