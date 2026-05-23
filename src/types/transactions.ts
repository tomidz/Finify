import type { BudgetCategoryType } from "@/types/budget";

export const TRANSACTION_TYPES = [
  "income",
  "expense",
  "transfer",
  "correction",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia",
  correction: "Corrección",
};

export interface Transaction {
  id: string;
  user_id: string;
  month_id: string | null;
  category_id: string | null;
  transaction_type: TransactionType;
  date: string;
  description: string;
  notes: string | null;
  fee: number;
  created_at: string;
  updated_at: string;
}

export interface TransactionAmount {
  id: string;
  transaction_id: string;
  account_id: string;
  amount: number;
  original_currency: string;
  exchange_rate: number;
  base_amount: number;
  created_at: string;
}

export interface TransactionAmountWithRelations extends TransactionAmount {
  account_name: string;
  account_currency_symbol: string;

  // Monto convertido dinámicamente a la moneda base actual usando FX histórico.
  // Cuando no se calcule, los consumidores pueden hacer fallback a base_amount.
  current_base_amount?: number;
}

export interface TransactionWithRelations extends Transaction {
  category_name: string | null;
  category_type: BudgetCategoryType | null;
  amounts: TransactionAmountWithRelations[];
}

export interface TransactionFeedFilters {
  search?: string;
  transaction_type?: TransactionType | null;
  account_id?: string | null;
  category_id?: string | null;
  category_type?: BudgetCategoryType | null;
}

export interface TransactionFeedPage {
  items: TransactionWithRelations[];
  nextOffset: number | null;
}
