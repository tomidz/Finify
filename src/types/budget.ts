import type { BudgetExecution, BudgetGroup } from "@/lib/finance/budget-status";

export const BUDGET_CATEGORY_TYPES = [
  "income",
  "essential_expenses",
  "discretionary_expenses",
  "debt_payments",
  "savings",
  "investments",
] as const;

export type BudgetCategoryType = (typeof BUDGET_CATEGORY_TYPES)[number];

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategoryType, string> = {
  income: "Ingresos",
  essential_expenses: "Gastos Esenciales",
  discretionary_expenses: "Gastos Discrecionales",
  debt_payments: "Pago de Deudas",
  savings: "Ahorros",
  investments: "Inversiones",
};

export interface BudgetYear {
  id: string;
  user_id: string;
  year: number;
}

export interface BudgetCategory {
  id: string;
  user_id: string;
  category_type: BudgetCategoryType;
  name: string;
  monthly_amount: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface BudgetLine {
  id: string;
  user_id: string;
  category_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BudgetMonthPlan {
  id: string;
  line_id: string;
  month_id: string;
  planned_amount: number;
  created_at: string;
  updated_at: string;
}

export interface BudgetLineWithPlan extends BudgetLine {
  category_name: string;
  category_type: BudgetCategoryType;
  month_id: string;
  plan_id: string | null;
  planned_amount: number;
}

export interface BudgetCategorySummary {
  category_id: string;
  category_name: string;
  category_type: BudgetCategoryType;
  planned_amount: number;
  actual_amount: number;
  variance: number;
}

export interface BudgetSummaryVsActual {
  /** Per group: income and expenses are never added together. */
  totals: Record<BudgetGroup, BudgetExecution>;
  categories: BudgetCategorySummary[];
}
