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
  /**
   * The date balances are valued at: the month's last day, or today while it
   * runs. Null without accounts.
   */
  close_date: string | null;
  /** Leaves out positions without a rate; cash without one counts at its stored base. */
  total: number;
  accounts: {
    id: string;
    name: string;
    account_type: string;
    currency: string;
    currency_symbol: string;
    /** Inactive accounts are listed while they hold a balance or a position. */
    is_active: boolean;
    balance: number;
    /**
     * At the close-date rate; without one (a currency no provider quotes),
     * the base amounts stored with its movements, and balance_fx_missing.
     */
    balance_base: number;
    /** The base amounts stored when the balance's movements were recorded. */
    balance_book_base: number;
    balance_fx_missing: boolean;
    /** The date of the rate a foreign balance was valued at. */
    balance_fx_rate_date: string | null;
    investment_value: number;
    /** Null when a lot or sale of the account has no rate to the base currency. */
    investment_value_base: number | null;
    /** The oldest rate the investments were valued at. */
    investment_fx_rate_date: string | null;
  }[];
}

export interface LiabilitiesSummary {
  year: number;
  /** Null without debts. */
  close_date: string | null;
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
  /** The date the month is valued at: its last day, or today while it runs. */
  closeDate: string;
  assets: number;
  liabilities: number;
  netWorth: number;
  /** The month leaves out positions or debts without a rate to the base currency. */
  fxMissing: boolean;
  /** The month counts a cash balance without a rate at its stored base amounts. */
  cashFxMissing: boolean;
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
