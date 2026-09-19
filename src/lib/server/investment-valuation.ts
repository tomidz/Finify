import "server-only";

import type { ActionResult } from "@/lib/action-result";
import { lotValueInBase, priceRequestFor, type PriceRequest } from "@/lib/asset-classes";
import type { ServerContext } from "@/lib/server/context";
import { dbError } from "@/lib/server/db-errors";
import { resolvePricesWithSources } from "@/lib/server/prices";

export type ValuationByAccount = Record<string, { current: number; cost: number }>;

export type InvestmentValuation = {
  byAccount: ValuationByAccount;
  /** The oldest exchange rate a lot in another currency was valued at. */
  fxRateDate: string | null;
};

/**
 * Today's market value vs cost of the portfolio in the base currency, per
 * account. Past months are valued at cost (see account_net_worth_year): today's
 * lots and prices say nothing about them.
 */
export async function loadInvestmentValuation(
  ctx: ServerContext,
  baseCurrency: string,
): Promise<ActionResult<InvestmentValuation>> {
  const { data, error } = await ctx.supabase
    .from("investments")
    .select("account_id, asset_name, ticker, isin, asset_type, currency, quantity, total_cost")
    .eq("user_id", ctx.userId)
    .order("purchase_date", { ascending: false })
    .order("id", { ascending: true });
  if (error) return dbError("loadInvestmentValuation", error, "Error al obtener las inversiones");

  const lots = (data ?? []).map((row) => ({
    ...row,
    quantity: Number(row.quantity),
    total_cost: Number(row.total_cost),
  }));
  if (lots.length === 0) return { data: { byAccount: {}, fxRateDate: null } };

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

  const byAccount: ValuationByAccount = {};
  for (const lot of lots) {
    const value = lotValueInBase(lot, prices, ratesToBase);
    if (!value) return { error: `No hay tipo de cambio de ${lot.currency} a ${baseCurrency}` };
    const entry = byAccount[lot.account_id] ?? { current: 0, cost: 0 };
    entry.current += value.current;
    entry.cost += value.cost;
    byAccount[lot.account_id] = entry;
  }

  return { data: { byAccount, fxRateDate } };
}
