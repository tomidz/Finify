import "server-only";

import { logError } from "@/lib/log";
import { providerFailure, type ProviderResult } from "@/lib/providers/fetch-json";

/*
 * Yahoo quotes the instruments TwelveData does not, and it is the only
 * provider here that lists the Buenos Aires exchange. Nothing else knows how a
 * local ticker maps to a Yahoo symbol: that rule lives in yahooSymbols.
 */

export type YahooInstrument = {
  /** The Yahoo symbol the quote came from, suffix included. */
  symbol: string;
  name: string | null;
  currency: string | null;
  price: number;
};

/** Yahoo's suffix for the BCBA. */
export const BCBA_SUFFIX = ".BA";

/**
 * The Yahoo symbols a holding can be quoted under, in the order to try them.
 * A CEDEAR only exists on the BCBA, so ".BA" is its only symbol: the bare
 * ticker quotes the foreign share it represents, ten or twenty times its
 * price. A holding in pesos means the local listing too, but the bare ticker
 * is still worth asking about. A ticker that already carries a suffix is
 * taken as given.
 */
export function yahooSymbols(ticker: string, assetType: string, currency?: string): string[] {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return [];
  if (symbol.includes(".")) return [symbol];
  if (assetType === "cedear") return [`${symbol}${BCBA_SUFFIX}`];
  if (currency === "ARS") return [`${symbol}${BCBA_SUFFIX}`, symbol];
  return [symbol];
}

/** The ticker as the user writes it: without the exchange suffix. */
export function bareTicker(symbol: string): string {
  return symbol.endsWith(BCBA_SUFFIX) ? symbol.slice(0, -BCBA_SUFFIX.length) : symbol;
}

/**
 * The first of `symbols` Yahoo quotes, or why none of them has a price. A
 * symbol it does not know throws, which is a miss and not an outage.
 */
export async function fetchYahooInstrument(symbols: string[]): Promise<ProviderResult<YahooInstrument>> {
  if (symbols.length === 0) return { ok: false, reason: "not_found" };
  let client;
  try {
    const { default: YahooFinance } = await import("yahoo-finance2");
    client = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  } catch (e) {
    logError("yahoo.import", e);
    return providerFailure("yahoo.instrument", "unavailable");
  }

  for (const symbol of symbols) {
    try {
      const quote = await client.quote(symbol);
      const price = typeof quote?.regularMarketPrice === "number" ? quote.regularMarketPrice : null;
      if (price == null || !Number.isFinite(price) || price <= 0) continue;
      return {
        ok: true,
        data: {
          symbol,
          name: quote.longName ?? quote.shortName ?? null,
          currency: typeof quote.currency === "string" ? quote.currency : null,
          price,
        },
      };
    } catch (e) {
      logError("yahoo.instrument", e, { symbol });
    }
  }
  return { ok: false, reason: "not_found" };
}
