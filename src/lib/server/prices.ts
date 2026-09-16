import "server-only";

import { forEachLimited } from "@/lib/concurrency";
import { fetchCryptoPrices } from "@/lib/coingecko";
import type { ServerContext } from "@/lib/server/context";
import { chunk, IN_LIST_CHUNK } from "@/lib/server/paginate";
import { fetchTwelveDataPrices } from "@/lib/twelvedata";

type ActionResult<T> = { data: T } | { error: string };

export type PriceRequest = {
  key: string;
  ticker?: string | null;
  isin?: string | null;
  assetType: string;
};

type PriceSource = "coingecko" | "twelvedata" | "yahoo";

// Market data moves, but not enough within a page session to justify hitting
// rate-limited providers on every render.
const PRICE_TTL_MS = 15 * 60_000;
const PROVIDER_CONCURRENCY = 4;

/**
 * Identifies a lookup, not a holding: requests that ask the providers the same
 * question share a price, and a different ticker/ISIN for the same holding
 * never reads another lookup's answer. Crypto prices come back in the user's
 * base currency (CoinGecko vs_currency), market prices in the instrument's own
 * currency, so the base currency is part of the key only for crypto.
 */
function cacheKey(request: PriceRequest, baseCurrency: string): string {
  return request.assetType === "crypto"
    ? `crypto:${cryptoCode(request)}:${baseCurrency}`
    : `market:${request.ticker ?? ""}|${request.isin ?? ""}`;
}

function cryptoCode(request: PriceRequest): string {
  return (request.ticker ?? request.key).trim().toUpperCase();
}

async function readCachedPrices(
  { supabase, userId }: ServerContext,
  keys: string[],
): Promise<Map<string, number>> {
  const cached = new Map<string, number>();
  if (keys.length === 0) return cached;
  const freshSince = new Date(Date.now() - PRICE_TTL_MS).toISOString();
  const reads = await Promise.all(
    chunk(keys, IN_LIST_CHUNK).map((keysChunk) =>
      supabase
        .from("instrument_prices")
        .select("price_key, price")
        .eq("user_id", userId)
        .in("price_key", keysChunk)
        .gte("fetched_at", freshSince),
    ),
  );
  for (const { data, error } of reads) {
    if (error) {
      console.error("readCachedPrices:", error.code);
      continue;
    }
    for (const row of data ?? []) cached.set(row.price_key, Number(row.price));
  }
  return cached;
}

async function writeCachedPrices(
  { supabase, userId }: ServerContext,
  rows: { price_key: string; price: number; source: PriceSource }[],
): Promise<void> {
  if (rows.length === 0) return;
  const fetchedAt = new Date().toISOString();
  const { error } = await supabase.from("instrument_prices").upsert(
    rows.map((row) => ({ ...row, user_id: userId, fetched_at: fetchedAt })),
    { onConflict: "user_id,price_key" },
  );
  if (error) console.error("writeCachedPrices:", error.code);
}

/**
 * Current prices keyed by `request.key`. Reads the per-user price cache first
 * and only asks providers for what is missing or older than the TTL; provider
 * calls run in parallel with a small concurrency cap. `fresh` (an explicit
 * refresh) skips the cache read but still stores what it fetches.
 */
export async function resolveCurrentPrices(
  requests: PriceRequest[],
  baseCurrency: string,
  ctx?: ServerContext,
  options: { fresh?: boolean } = {},
): Promise<ActionResult<Record<string, number>>> {
  try {
    const requestsByLookup = new Map<string, PriceRequest[]>();
    for (const request of requests) {
      const lookup = cacheKey(request, baseCurrency);
      requestsByLookup.set(lookup, [...(requestsByLookup.get(lookup) ?? []), request]);
    }

    const priceByLookup =
      ctx && !options.fresh
        ? await readCachedPrices(ctx, [...requestsByLookup.keys()])
        : new Map<string, number>();

    const fetched: { price_key: string; price: number; source: PriceSource }[] = [];
    const remember = (lookup: string, price: number, source: PriceSource) => {
      priceByLookup.set(lookup, price);
      fetched.push({ price_key: lookup, price, source });
    };

    // One provider question per distinct lookup.
    const missing = [...requestsByLookup]
      .filter(([lookup]) => !priceByLookup.has(lookup))
      .map(([lookup, [request]]) => ({ lookup, request }));
    const cryptoMissing = missing.filter((m) => m.request.assetType === "crypto");
    const marketMissing = missing.filter((m) => m.request.assetType !== "crypto");

    const cryptoTask = async () => {
      if (cryptoMissing.length === 0) return;
      const cryptoPrices = await fetchCryptoPrices(
        [...new Set(cryptoMissing.map((m) => cryptoCode(m.request)))],
        baseCurrency,
      );
      for (const { lookup, request } of cryptoMissing) {
        const price = cryptoPrices[cryptoCode(request)];
        if (price != null) remember(lookup, price, "coingecko");
      }
    };

    const marketTask = async () => {
      if (marketMissing.length === 0) return;
      const twelveDataPrices = await fetchTwelveDataPrices(
        marketMissing.map(({ lookup, request }) => ({
          key: lookup,
          symbol: request.ticker,
          isin: request.isin,
        })),
      );
      for (const { lookup } of marketMissing) {
        const resolved = twelveDataPrices[lookup];
        if (resolved) remember(lookup, resolved.price, "twelvedata");
      }

      const unresolved = marketMissing.filter(
        ({ lookup, request }) => !priceByLookup.has(lookup) && request.ticker,
      );
      if (unresolved.length === 0) return;
      try {
        const yahooFinance = await import("yahoo-finance2");
        const yf = yahooFinance.default;
        await forEachLimited(unresolved, PROVIDER_CONCURRENCY, async ({ lookup, request }) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const quote: any = await yf.quote(request.ticker!);
            if (quote && typeof quote.regularMarketPrice === "number") {
              remember(lookup, quote.regularMarketPrice, "yahoo");
            }
          } catch {
            // Unknown ticker: stays unpriced and is valued at cost upstream.
          }
        });
      } catch (e) {
        console.error("resolveCurrentPrices: yahoo fallback unavailable:", e);
      }
    };

    await Promise.all([cryptoTask(), marketTask()]);

    if (ctx) await writeCachedPrices(ctx, fetched);

    const prices: Record<string, number> = {};
    for (const [lookup, lookupRequests] of requestsByLookup) {
      const price = priceByLookup.get(lookup);
      if (price == null) continue;
      for (const request of lookupRequests) prices[request.key] = price;
    }
    return { data: prices };
  } catch (e) {
    console.error("resolveCurrentPrices:", e);
    return { error: "Error al obtener precios actuales" };
  }
}
