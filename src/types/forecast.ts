import type { ForecastSource } from "@/lib/finance/project-cashflow";

export interface ForecastPoint {
  year: number;
  month: number;
  label: string;
  projected_balance: number;
  projected_income: number;
  projected_expenses: number;
  is_actual: boolean;
  /** What the month's projection comes from; empty for today's balance. */
  sources: ForecastSource[];
}
