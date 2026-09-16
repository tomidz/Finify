import "server-only";

import { fetchCryptoPrices } from "@/lib/coingecko";
import { fetchTwelveDataPrices } from "@/lib/twelvedata";

type ActionResult<T> = { data: T } | { error: string };

export async function resolveCurrentPrices(
  tickers: { key: string; ticker?: string | null; isin?: string | null; assetType: string }[],
  baseCurrency: string
): Promise<ActionResult<Record<string, number>>> {
  try {
    const prices: Record<string, number> = {};

    const cryptoTickers = tickers
      .filter((t) => t.assetType === "crypto")
      .map((t) => ({ key: t.key, code: (t.ticker ?? t.key).trim().toUpperCase() }));
    const marketTickers = tickers.filter((t) => t.assetType !== "crypto");

    if (cryptoTickers.length > 0) {
      const cryptoPrices = await fetchCryptoPrices(
        cryptoTickers.map((ticker) => ticker.code),
        baseCurrency
      );
      for (const ticker of cryptoTickers) {
        const price = cryptoPrices[ticker.code];
        if (price != null) prices[ticker.key] = price;
      }
    }

    if (marketTickers.length > 0) {
      const twelveDataPrices = await fetchTwelveDataPrices(
        marketTickers.map((ticker) => ({
          key: ticker.key,
          symbol: ticker.ticker,
          isin: ticker.isin,
        })),
      );

      for (const ticker of marketTickers) {
        const resolved = twelveDataPrices[ticker.key];
        if (resolved) {
          prices[ticker.key] = resolved.price;
        }
      }

      const unresolved = marketTickers.filter((ticker) => prices[ticker.key] == null && ticker.ticker);
      if (unresolved.length > 0) {
        try {
          const yahooFinance = await import("yahoo-finance2");
          const yf = yahooFinance.default;

          for (const ticker of unresolved) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const quote: any = await yf.quote(ticker.ticker!);
              if (quote && typeof quote.regularMarketPrice === "number") {
                prices[ticker.key] = quote.regularMarketPrice;
              }
            } catch {
              // continue
            }
          }
        } catch {
          // ignore fallback errors
        }
      }
    }

    return { data: prices };
  } catch {
    return { error: "Error al obtener precios actuales" };
  }
}
