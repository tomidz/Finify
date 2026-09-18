import "server-only";

import type { ActionResult } from "@/lib/action-result";
import { cashCurrencyOf, isCashLike, namesMoney, type PriceRequest } from "@/lib/asset-classes";
import { forEachLimited } from "@/lib/concurrency";
import { fetchCryptoPricesWithReasons } from "@/lib/coingecko";
import { today } from "@/lib/dates";
import { logError } from "@/lib/log";
import type { ProviderFailure } from "@/lib/providers/fetch-json";
import type { ServerContext } from "@/lib/server/context";
import { dbError } from "@/lib/server/db-errors";
import { getFxQuote } from "@/lib/server/fx";
import { chunk, IN_LIST_CHUNK } from "@/lib/server/paginate";
import { fetchTwelveDataPrices } from "@/lib/twelvedata";

/**
 * Why a request has no price: its provider's failure, no provider to ask (no
 * ticker or ISIN, or a ticker that names money) and no manual price, or no
 * rate into the request's currency.
 */
export type UnpricedReason = ProviderFailure | "unquotable" | "no_rate";

export type ResolvedPrices = {
  /** Keyed by request key, each in the request's currency. */
  prices: Record<string, number>;
  /** Request keys priced by a manual price, with the date it was set for. */
  manualDates: Record<string, string>;
  /** One unit of each requested currency in the base currency, where a rate is known. */
  ratesToBase: Record<string, number>;
  /** The date each of ratesToBase was quoted for. */
  rateDatesToBase: Record<string, string>;
  /** Request keys left without a price, and why. */
  unpriced: Record<string, UnpricedReason>;
};

type PriceSource = "coingecko" | "twelvedata" | "yahoo" | "manual";

type CachedPrice = { price: number; source: PriceSource; date: string };

// Market data moves, but not enough within a page session to justify hitting
// rate-limited providers on every render.
const PRICE_TTL_MS = 15 * 60_000;
const PROVIDER_CONCURRENCY = 4;

/**
 * Identifies a lookup, not a holding: requests that ask the same question
 * share a price, and a different ticker/ISIN for the same holding never reads
 * another lookup's answer. Crypto prices are stored in the user's base
 * currency (CoinGecko vs_currency) and market prices in the instrument's own
 * currency, so the base currency is part of the key only for crypto. A lookup
 * no provider can be asked about (no ticker or ISIN, or a ticker that names
 * money) only has a manual price, kept per class and currency.
 */
export function priceCacheKey(
  request: Pick<PriceRequest, "key" | "ticker" | "isin" | "name" | "assetType" | "currency">,
  baseCurrency: string,
): string {
  if (request.assetType === "crypto") return `crypto:${cryptoCode(request)}:${baseCurrency}`;
  if (isQuotable(request)) return `market:${request.ticker ?? ""}|${request.isin ?? ""}`;
  const id = (request.ticker ?? request.name ?? request.key).trim();
  return `unlisted:${request.assetType}:${request.currency ?? baseCurrency}:${id}`;
}

function cryptoCode(request: Pick<PriceRequest, "key" | "ticker">): string {
  return (request.ticker ?? request.key).trim().toUpperCase();
}

/** Whether a provider can be asked about the request at all. */
function isQuotable(request: Pick<PriceRequest, "ticker" | "isin" | "assetType" | "currency">): boolean {
  if (request.assetType === "crypto") return true;
  return !!request.isin || (!!request.ticker && !namesMoney(request));
}

/**
 * Stored prices for `keys`: provider quotes while fresh, or manual prices of
 * any age. A manual price never passes for a fresh quote, whatever its date.
 * `error` is the first failed chunk's; the others' rows are still returned.
 */
async function readStoredPrices(
  { supabase, userId }: ServerContext,
  keys: string[],
  source: "provider" | "manual",
): Promise<{ stored: Map<string, CachedPrice>; error: { code?: string; message?: string } | null }> {
  const stored = new Map<string, CachedPrice>();
  if (keys.length === 0) return { stored, error: null };
  const freshSince = new Date(Date.now() - PRICE_TTL_MS).toISOString();
  const reads = await Promise.all(
    chunk(keys, IN_LIST_CHUNK).map((keysChunk) => {
      const query = supabase
        .from("instrument_prices")
        .select("price_key, price, source, fetched_at")
        .eq("user_id", userId)
        .in("price_key", keysChunk);
      return source === "manual"
        ? query.eq("source", "manual")
        : query.neq("source", "manual").gte("fetched_at", freshSince);
    }),
  );
  let failure: { code?: string; message?: string } | null = null;
  for (const { data, error } of reads) {
    if (error) {
      failure ??= error;
      continue;
    }
    for (const row of data ?? []) {
      stored.set(row.price_key, {
        price: Number(row.price),
        source: row.source as PriceSource,
        date: String(row.fetched_at).slice(0, 10),
      });
    }
  }
  return { stored, error: failure };
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
  if (error) logError("writeCachedPrices", error);
}

/**
 * Current prices keyed by `request.key`, each in the request's currency. Reads
 * the per-user price cache first and only asks providers for what is missing
 * or older than the TTL; provider calls run in parallel with a small
 * concurrency cap. `fresh` (an explicit refresh) skips the cache read but
 * still stores what it fetches. A lookup no provider answers takes the user's
 * manual price, if there is one; a request left without a price says why in
 * `unpriced`.
 */
export async function resolvePricesWithSources(
  requests: PriceRequest[],
  baseCurrency: string,
  ctx?: ServerContext,
  options: { fresh?: boolean } = {},
): Promise<ActionResult<ResolvedPrices>> {
  try {
    const prices: Record<string, number> = {};
    const manualDates: Record<string, string> = {};
    const ratesToBase: Record<string, number> = {};
    const rateDatesToBase: Record<string, string> = {};
    const unpriced: Record<string, UnpricedReason> = {};

    const todayStr = today();
    const quotes = new Map<string, Promise<{ rate: number; rateDate: string } | null>>();
    const fxQuote = (from: string, to: string) => {
      if (from === to) return Promise.resolve({ rate: 1, rateDate: todayStr });
      const pair = `${from}:${to}`;
      if (!quotes.has(pair)) {
        quotes.set(
          pair,
          getFxQuote({ date: todayStr, from, to }).then((fx) => ("error" in fx ? null : fx.data)),
        );
      }
      return quotes.get(pair)!;
    };
    const fxRate = async (from: string, to: string) => (await fxQuote(from, to))?.rate ?? null;
    const currencyOf = (request: PriceRequest) => request.currency ?? baseCurrency;

    for (const currency of new Set(requests.map(currencyOf))) {
      const quote = await fxQuote(currency, baseCurrency);
      if (quote) {
        ratesToBase[currency] = quote.rate;
        rateDatesToBase[currency] = quote.rateDate;
      }
    }

    // Cash and stablecoins: one unit is worth one unit of their currency,
    // converted to the currency of the holding's cost. No provider is asked.
    for (const request of requests.filter((r) => isCashLike(r.assetType))) {
      const unit = cashCurrencyOf({
        asset_type: request.assetType,
        ticker: request.ticker,
        asset_name: request.name ?? request.key,
      })!;
      const rate = await fxRate(unit, currencyOf(request));
      if (rate != null) prices[request.key] = rate;
      else unpriced[request.key] = "no_rate";
    }

    const requestsByLookup = new Map<string, PriceRequest[]>();
    for (const request of requests) {
      if (isCashLike(request.assetType)) continue;
      const lookup = priceCacheKey(request, baseCurrency);
      requestsByLookup.set(lookup, [...(requestsByLookup.get(lookup) ?? []), request]);
    }
    const quotable = [...requestsByLookup].filter(([, [request]]) => isQuotable(request));

    const priceByLookup = new Map<string, number>();
    const manualDateByLookup = new Map<string, string>();
    const failureByLookup = new Map<string, ProviderFailure>();

    if (ctx && !options.fresh) {
      const cached = await readStoredPrices(ctx, quotable.map(([lookup]) => lookup), "provider");
      // An unreadable cache only costs provider calls.
      if (cached.error) logError("resolvePricesWithSources", cached.error, { step: "cache read" });
      for (const [lookup, stored] of cached.stored) priceByLookup.set(lookup, stored.price);
    }

    const fetched: { price_key: string; price: number; source: PriceSource }[] = [];
    const remember = (lookup: string, price: number, source: PriceSource) => {
      priceByLookup.set(lookup, price);
      fetched.push({ price_key: lookup, price, source });
    };

    // One provider question per distinct lookup.
    const missing = quotable
      .filter(([lookup]) => !priceByLookup.has(lookup))
      .map(([lookup, [request]]) => ({ lookup, request }));
    const cryptoMissing = missing.filter((m) => m.request.assetType === "crypto");
    const marketMissing = missing.filter((m) => m.request.assetType !== "crypto");

    const cryptoTask = async () => {
      if (cryptoMissing.length === 0) return;
      const crypto = await fetchCryptoPricesWithReasons(
        [...new Set(cryptoMissing.map((m) => cryptoCode(m.request)))],
        baseCurrency,
      );
      for (const { lookup, request } of cryptoMissing) {
        const price = crypto.prices[cryptoCode(request)];
        if (price != null) remember(lookup, price, "coingecko");
        else failureByLookup.set(lookup, crypto.failed[cryptoCode(request)] ?? "not_found");
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
        const resolved = twelveDataPrices.prices[lookup];
        if (resolved) remember(lookup, resolved.price, "twelvedata");
        else failureByLookup.set(lookup, twelveDataPrices.failed[lookup] ?? "not_found");
      }

      const unresolved = marketMissing.filter(
        ({ lookup, request }) => !priceByLookup.has(lookup) && request.ticker,
      );
      if (unresolved.length === 0) return;
      try {
        const { default: YahooFinance } = await import("yahoo-finance2");
        const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
        await forEachLimited(unresolved, PROVIDER_CONCURRENCY, async ({ lookup, request }) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const quote: any = await yf.quote(request.ticker!);
            const price = quote?.regularMarketPrice;
            // The bare ticker can name another company's listing: a quote in
            // another currency than the holding's is taken as a miss.
            if (
              typeof price === "number" &&
              Number.isFinite(price) &&
              price > 0 &&
              quote.currency === currencyOf(request)
            ) {
              remember(lookup, price, "yahoo");
            }
          } catch (e) {
            // Unknown ticker: stays unpriced and is valued at cost upstream.
            logError("resolvePricesWithSources", e, { step: "yahoo quote" });
          }
        });
      } catch (e) {
        logError("resolvePricesWithSources", e, { step: "yahoo import" });
      }
    };

    await Promise.all([cryptoTask(), marketTask()]);

    if (ctx) {
      await writeCachedPrices(ctx, fetched);
      const withoutPrice = [...requestsByLookup.keys()].filter((lookup) => !priceByLookup.has(lookup));
      const manual = await readStoredPrices(ctx, withoutPrice, "manual");
      // Without its manual price a holding would count at cost.
      if (manual.error) return dbError("resolvePricesWithSources", manual.error, "Error al obtener precios actuales");
      for (const [lookup, stored] of manual.stored) {
        priceByLookup.set(lookup, stored.price);
        manualDateByLookup.set(lookup, stored.date);
      }
    }

    for (const [lookup, lookupRequests] of requestsByLookup) {
      const price = priceByLookup.get(lookup);
      const manualDate = manualDateByLookup.get(lookup);
      for (const request of lookupRequests) {
        if (price == null) {
          unpriced[request.key] = isQuotable(request) ? (failureByLookup.get(lookup) ?? "not_found") : "unquotable";
          continue;
        }
        // A crypto price is in the base currency; a lot in another currency
        // without a rate stays unpriced rather than mixing currencies.
        const rate = request.assetType === "crypto" ? await fxRate(baseCurrency, currencyOf(request)) : 1;
        if (rate == null) {
          unpriced[request.key] = "no_rate";
          continue;
        }
        prices[request.key] = price * rate;
        if (manualDate) manualDates[request.key] = manualDate;
      }
    }
    return { data: { prices, manualDates, ratesToBase, rateDatesToBase, unpriced } };
  } catch (e) {
    logError("resolvePricesWithSources", e);
    return { error: "Error al obtener precios actuales" };
  }
}
