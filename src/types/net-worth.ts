export const NW_ITEM_SIDES = ["asset", "liability"] as const;
export type NwItemSide = (typeof NW_ITEM_SIDES)[number];

export const NW_ITEM_SIDE_LABELS: Record<NwItemSide, string> = {
  asset: "Activo",
  liability: "Pasivo",
};

export interface NwItem {
  id: string;
  user_id: string;
  name: string;
  side: NwItemSide;
  account_id: string | null;
  currency: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface NwItemWithRelations extends NwItem {
  account_name: string | null;
  currency_symbol: string;
}

export interface NwSnapshot {
  id: string;
  nw_item_id: string;
  year: number;
  month: number;
  amount: number;
  amount_base: number | null;
  created_at: string;
}

export interface NwSnapshotWithItem extends NwSnapshot {
  item_name: string;
  item_side: NwItemSide;
  currency: string;
  currency_symbol: string;
}

export interface NwMonthSummary {
  year: number;
  month: number;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  items: {
    item_id: string;
    item_name: string;
    side: NwItemSide;
    amount: number;
    amount_base: number | null;
    currency: string;
    currency_symbol: string;
  }[];
}

export interface NwYearSummary {
  year: number;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  items: {
    item_id: string;
    item_name: string;
    side: NwItemSide;
    amount: number;
    amount_base: number | null;
    snapshot_month: number;
    currency: string;
    currency_symbol: string;
  }[];
}

export interface AccountNetWorthSummary {
  year: number;
  month: number;
  total: number;
  accounts: {
    id: string;
    name: string;
    account_type: string;
    currency: string;
    currency_symbol: string;
    balance: number;
    balance_base: number;
    investment_value: number;
    /** Null when a lot or sale of the account has no rate to the base currency. */
    investment_value_base: number | null;
    /** The oldest rate the investments were valued at. */
    investment_fx_rate_date: string | null;
  }[];
}

export interface LiabilitiesSummary {
  year: number;
  total: number;
  items: {
    item_id: string;
    name: string;
    currency: string;
    currency_symbol: string;
    amount: number;
    /** Null when the debt's currency has no rate to the base currency. */
    amount_base: number | null;
    fx_rate_date: string | null;
  }[];
}

export interface NetWorthEvolutionPoint {
  month: number;
  assets: number;
  liabilities: number;
  netWorth: number;
  /** The month leaves out amounts without a rate to the base currency. */
  fxMissing: boolean;
}

/* ------------------------------------------------------------------ */
/* Debt activities                                                     */
/* ------------------------------------------------------------------ */

export const DEBT_ACTIVITY_TYPES = ["payment", "interest", "adjustment"] as const;
export type DebtActivityType = (typeof DEBT_ACTIVITY_TYPES)[number];

export const DEBT_ACTIVITY_TYPE_LABELS: Record<DebtActivityType, string> = {
  payment: "Pago",
  interest: "Interés",
  adjustment: "Ajuste",
};

export interface DebtActivity {
  id: string;
  nw_item_id: string;
  transaction_id: string | null;
  activity_type: DebtActivityType;
  date: string;
  amount: number;
  amount_base: number | null;
  description: string | null;
  created_at: string;
}

export interface LiabilitiesMonthSummary {
  year: number;
  month: number;
  total: number;
  items: {
    item_id: string;
    name: string;
    currency: string;
    currency_symbol: string;
    amount: number;
    amount_base: number | null;
  }[];
}
