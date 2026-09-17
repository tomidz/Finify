import "server-only";

import { lotValueInBase, priceRequestFor, type PriceRequest } from "@/lib/asset-classes";
import type { ServerContext } from "@/lib/server/context";
import { resolvePricesWithSources } from "@/lib/server/prices";

type Result<T> = { data: T } | { error: string };

export type ValuationByAccount = Record<string, { current: number; cost: number }>;
export type ValuationByMonth = Record<number, { currentValue: number; costBasis: number }>;

export type InvestmentValuation = {
  byAccount: ValuationByAccount;
  /** Only computed when a year is requested. */
  byMonth: ValuationByMonth | null;
  /** The oldest exchange rate a lot in another currency was valued at. */
  fxRateDate: string | null;
};

/**
 * Market value vs cost of the portfolio in the base currency, per account and
 * (optionally) per month of a year. Lots, prices and FX are loaded once and
 * shared by both views.
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

  const lots = (data ?? []).map((row) => ({
    ...row,
    quantity: Number(row.quantity),
    total_cost: Number(row.total_cost),
  }));
  if (lots.length === 0) return { data: { byAccount: {}, byMonth: year ? {} : null, fxRateDate: null } };

  const requests = new Map<string, PriceRequest>();
  for (const lot of lots) {
    const request = priceRequestFor(lot);
    requests.set(request.key, request);
  }
  const resolved = await resolvePricesWithSources([...requests.values()], baseCurrency, ctx);
  if ("error" in resolved) return resolved;
  const { prices, ratesToBase, rateDatesToBase } = resolved.data;
  const fxRateDate =
    lots
      .filter((lot) => lot.currency !== baseCurrency)
      .map((lot) => rateDatesToBase[lot.currency])
      .filter((date): date is string => date != null)
      .sort()[0] ?? null;

  const valued: { account_id: string; purchase_date: string; current: number; cost: number }[] = [];
  for (const lot of lots) {
    const value = lotValueInBase(lot, prices, ratesToBase);
    if (!value) return { error: `No hay tipo de cambio de ${lot.currency} a ${baseCurrency}` };
    valued.push({ account_id: lot.account_id, purchase_date: lot.purchase_date, ...value });
  }

  const byAccount: ValuationByAccount = {};
  for (const lot of valued) {
    const entry = byAccount[lot.account_id] ?? { current: 0, cost: 0 };
    entry.current += lot.current;
    entry.cost += lot.cost;
    byAccount[lot.account_id] = entry;
  }

  if (!year) return { data: { byAccount, byMonth: null, fxRateDate } };

  const byMonth: ValuationByMonth = {};
  for (const lot of valued) {
    const purchase = new Date(`${lot.purchase_date}T00:00:00`);
    const purchaseYear = purchase.getFullYear();
    if (purchaseYear > year) continue;
    const startMonth = purchaseYear < year ? 1 : purchase.getMonth() + 1;

    for (let month = startMonth; month <= 12; month += 1) {
      const entry = byMonth[month] ?? { currentValue: 0, costBasis: 0 };
      entry.currentValue += lot.current;
      entry.costBasis += lot.cost;
      byMonth[month] = entry;
    }
  }

  return { data: { byAccount, byMonth, fxRateDate } };
}
