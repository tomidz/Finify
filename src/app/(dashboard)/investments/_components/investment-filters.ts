import type { FilterOption } from "@/components/filter-dropdown";
import { matchesAllWords } from "@/lib/search";
import { ASSET_TYPE_LABELS } from "@/types/investments";

export const ASSET_TYPE_OPTIONS: FilterOption[] = Object.entries(ASSET_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export type HoldingsView = "flat" | "account" | "asset";

export const HOLDINGS_VIEW_OPTIONS: { value: HoldingsView; label: string }[] = [
  { value: "flat", label: "Por activo y cuenta" },
  { value: "account", label: "Por cuenta" },
  { value: "asset", label: "Por activo" },
];

export function isHoldingsView(value: string | null): value is HoldingsView {
  return HOLDINGS_VIEW_OPTIONS.some((option) => option.value === value);
}

type Filters = {
  query: string;
  /** null: every type. */
  assetType: string | null;
};

/** A holding matches every word of the query in its name, ticker, ISIN, account or currency. */
export function holdingMatches(
  holding: {
    asset_name: string;
    ticker: string | null;
    isin: string | null;
    account_id: string;
    account_name: string;
    currency: string;
    asset_type: string;
  },
  { query, assetType, accountId }: Filters & { accountId: string | null },
): boolean {
  if (assetType !== null && holding.asset_type !== assetType) return false;
  if (accountId !== null && holding.account_id !== accountId) return false;
  return matchesAllWords(
    [holding.asset_name, holding.ticker, holding.isin, holding.account_name, holding.currency],
    query,
  );
}

/** A sale's year, from its yyyy-MM-dd date. */
export function saleYear(saleDate: string): number {
  return Number(saleDate.slice(0, 4));
}

export function saleMatches(
  sale: {
    asset_name: string;
    ticker: string | null;
    isin: string | null;
    account_name: string;
    currency: string;
    asset_type: string;
    sale_date: string;
  },
  { query, assetType, year }: Filters & { year: string | null },
): boolean {
  if (assetType !== null && sale.asset_type !== assetType) return false;
  if (year !== null && saleYear(sale.sale_date) !== Number(year)) return false;
  return matchesAllWords(
    [sale.asset_name, sale.ticker, sale.isin, sale.account_name, sale.currency],
    query,
  );
}
