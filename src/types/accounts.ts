export const ACCOUNT_TYPES = [
  "bank",
  "investment_broker",
  "crypto_exchange",
  "crypto_wallet",
  "credit_card",
  "cash",
  "other",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: "Banco",
  investment_broker: "Broker de inversiones",
  crypto_exchange: "Exchange de crypto",
  crypto_wallet: "Wallet de crypto",
  credit_card: "Tarjeta de crédito",
  cash: "Efectivo",
  other: "Otro",
};

export interface Account {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  currency: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const CURRENCY_TYPES = ["fiat", "crypto", "etf"] as const;
export type CurrencyType = (typeof CURRENCY_TYPES)[number];

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  currency_type: CurrencyType;
  decimals: number;
}
