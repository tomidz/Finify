export const ASSET_TYPES = ["stock", "etf", "crypto", "bond", "other"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: "Acción",
  etf: "ETF",
  crypto: "Crypto",
  bond: "Bono",
  other: "Otro",
};

export interface Investment {
  id: string;
  user_id: string;
  account_id: string;
  asset_name: string;
  ticker: string | null;
  isin: string | null;
  asset_type: AssetType;
  quantity: number;
  price_per_unit: number;
  total_cost: number;
  currency: string;
  purchase_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvestmentWithAccount extends Investment {
  account_name: string;
  account_type: string;
  currency_symbol: string;
}

/**
 * Canonical grouping key for a holding. Must stay in sync with the server's
 * lot matching (`lotMatchesHolding` + account/type/currency filters in
 * actions/investments.ts) — a looser client key groups lots the server won't
 * find, producing "no hay cantidad suficiente" failures.
 */
export function holdingGroupKey(inv: {
  ticker: string | null;
  asset_name: string;
  account_id: string;
  asset_type: string;
  currency: string;
}): string {
  const assetKey = inv.ticker?.trim() || inv.asset_name.trim();
  return `${assetKey}::${inv.account_id}::${inv.asset_type}::${inv.currency}`;
}

export interface HoldingPosition {
  ticker: string;
  isin: string | null;
  asset_name: string;
  asset_type: AssetType;
  account_id: string;
  account_name: string;
  currency: string;
  currency_symbol: string;
  total_quantity: number;
  avg_cost_per_unit: number;
  total_cost: number;
  current_price: number | null;
  current_value: number | null;
  gain_loss: number | null;
  gain_loss_pct: number | null;
  investments: Investment[];
}

export interface PortfolioSummary {
  total_invested: number;
  total_current_value: number | null;
  total_gain_loss: number | null;
  total_gain_loss_pct: number | null;
  holdings: HoldingPosition[];
}

export interface TransferableHolding {
  source_account_id: string;
  asset_name: string;
  ticker: string | null;
  asset_type: AssetType;
  currency: string;
  total_quantity: number;
  account_name: string;
}

export interface InvestmentSale {
  id: string;
  user_id: string;
  account_id: string;
  asset_name: string;
  ticker: string | null;
  isin: string | null;
  asset_type: AssetType;
  quantity_sold: number;
  price_per_unit: number;
  total_proceeds: number;
  fees: number;
  tax: number;
  cost_basis: number;
  realized_pnl: number;
  currency: string;
  sale_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvestmentSaleWithAccount extends InvestmentSale {
  account_name: string;
  currency_symbol: string;
  total_proceeds_base: number;
  fees_base: number;
  tax_base: number;
  cost_basis_base: number;
  realized_pnl_base: number;
  base_currency: string;
}
