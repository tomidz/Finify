import "server-only";

import type { ServerContext } from "@/lib/server/context";
import { getOrFetchFxRate } from "@/lib/server/fx";
import { resolveCurrentPrices, type PriceRequest } from "@/lib/server/prices";
import { today as appToday } from "@/lib/dates";

type Result<T> = { data: T } | { error: string };

export type ValuationByAccount = Record<string, { current: number; cost: number }>;
export type ValuationByMonth = Record<number, { currentValue: number; costBasis: number }>;

export type InvestmentValuation = {
  byAccount: ValuationByAccount;
  /** Only computed when a year is requested. */
  byMonth: ValuationByMonth | null;
};

type Lot = {
  account_id: string;
  asset_name: string;
  ticker: string | null;
  isin: string | null;
  asset_type: string;
  currency: string;
  quantity: number;
  total_cost: number;
  purchase_date: string;
};

function priceKey(lot: Pick<Lot, "ticker" | "isin" | "asset_name">): string {
  return lot.ticker?.trim() || lot.isin?.trim() || lot.asset_name.trim();
}

/**
 * Market value vs cost of the portfolio, per account and (optionally) per
 * month of a year. Lots, prices and FX are loaded once and shared by both
 * views — they used to be two server actions that each re-fetched every price.
 */
export async function loadInvestmentValuation(
  ctx: ServerContext,
  baseCurrency: string,
  year: number | null,
): Promise<Result<InvestmentValuation>> {
  const { data, error } = await ctx.supabase
    .from("investments")
    .select("account_id, asset_name, ticker, isin, asset_type, currency, quantity, total_cost, purchase_date")
    .eq("user_id", ctx.userId)
    .order("purchase_date", { ascending: false })
    .order("id", { ascending: true });
  if (error) return { error: error.message };

  const lots: Lot[] = (data ?? []).map((row) => ({
    ...row,
    quantity: Number(row.quantity),
    total_cost: Number(row.total_cost),
  }));
  if (lots.length === 0) return { data: { byAccount: {}, byMonth: year ? {} : null } };

  // Per account: lots grouped into holdings by account + ticker.
  const holdings = new Map<string, { lot: Lot; quantity: number; total_cost: number }>();
  for (const lot of lots) {
    const key = `${lot.account_id}::${(lot.ticker ?? lot.asset_name).trim()}`;
    const holding = holdings.get(key) ?? { lot, quantity: 0, total_cost: 0 };
    holding.quantity += lot.quantity;
    holding.total_cost += lot.total_cost;
    holdings.set(key, holding);
  }

  // The per-account view looks a holding without ticker up by its asset name;
  // the per-month view only by the lot's own ticker and ISIN, like the
  // investments table. Lookups both views share are asked once.
  const requests = new Map<string, PriceRequest>();
  for (const { lot } of holdings.values()) {
    const key = `account:${priceKey(lot)}`;
    requests.set(key, {
      key,
      ticker: (lot.ticker ?? lot.asset_name).trim(),
      isin: lot.isin,
      assetType: lot.asset_type,
    });
  }
  if (year) {
    for (const lot of lots) {
      const key = `month:${priceKey(lot)}`;
      requests.set(key, {
        key,
        // A crypto lookup without ticker uses the request key as the coin
        // code, which the "month:" prefix would change.
        ticker: lot.asset_type === "crypto" ? (lot.ticker ?? priceKey(lot)) : lot.ticker,
        isin: lot.isin,
        assetType: lot.asset_type,
      });
    }
  }
  const pricesResult = await resolveCurrentPrices([...requests.values()], baseCurrency, ctx);
  if ("error" in pricesResult) return pricesResult;
  const prices = pricesResult.data;

  const today = appToday();
  const fxByCurrency = new Map<string, number>();
  const fxFactor = async (lot: Lot): Promise<Result<number>> => {
    if (lot.asset_type === "crypto" || lot.currency === baseCurrency) return { data: 1 };
    const cached = fxByCurrency.get(lot.currency);
    if (cached != null) return { data: cached };
    const fx = await getOrFetchFxRate({ date: today, from: lot.currency, to: baseCurrency });
    if ("error" in fx) return fx;
    fxByCurrency.set(lot.currency, fx.data);
    return { data: fx.data };
  };

  const byAccount: ValuationByAccount = {};
  for (const { lot, quantity, total_cost } of holdings.values()) {
    const entry = byAccount[lot.account_id] ?? { current: 0, cost: 0 };
    const marketPrice = prices[`account:${priceKey(lot)}`];
    if (marketPrice == null) {
      // No live price: valued flat at cost basis.
      entry.current += total_cost;
      entry.cost += total_cost;
    } else {
      const factor = await fxFactor(lot);
      if ("error" in factor) return factor;
      entry.current += quantity * marketPrice * factor.data;
      entry.cost += total_cost * factor.data;
    }
    byAccount[lot.account_id] = entry;
  }

  if (!year) return { data: { byAccount, byMonth: null } };

  const byMonth: ValuationByMonth = {};
  for (const lot of lots) {
    const purchase = new Date(`${lot.purchase_date}T00:00:00`);
    const purchaseYear = purchase.getFullYear();
    if (purchaseYear > year) continue;
    const startMonth = purchaseYear < year ? 1 : purchase.getMonth() + 1;

    const price = prices[`month:${priceKey(lot)}`];
    let currentValue = price != null ? lot.quantity * price : lot.total_cost;
    let costBasis = lot.total_cost;
    const factor = await fxFactor(lot);
    if ("error" in factor) return factor;
    currentValue *= factor.data;
    costBasis *= factor.data;

    for (let month = startMonth; month <= 12; month += 1) {
      const entry = byMonth[month] ?? { currentValue: 0, costBasis: 0 };
      entry.currentValue += currentValue;
      entry.costBasis += costBasis;
      byMonth[month] = entry;
    }
  }

  return { data: { byAccount, byMonth } };
}
