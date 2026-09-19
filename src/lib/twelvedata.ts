import "server-only";

import { forEachLimited } from "@/lib/concurrency";
import { logError } from "@/lib/log";
import {
  combineFailures,
  failureForStatus,
  fetchJson,
  providerFailure,
  type ProviderFailure,
  type ProviderResult,
} from "@/lib/providers/fetch-json";

const TWELVEDATA_CONCURRENCY = 4;
const TWELVEDATA_API = "https://api.twelvedata.com";

type TwelveDataQuote = {
  symbol?: string;
  name?: string;
  close?: string;
  price?: string;
  currency?: string;
  code?: number;
  message?: string;
};

type TwelveDataSearchResponse = {
  data?: Array<{
    symbol?: string;
    instrument_name?: string;
    exchange?: string;
    mic_code?: string;
    currency?: string;
    country?: string;
    type?: string;
  }>;
  code?: number;
  message?: string;
};

export type TwelveDataRequest = {
  key: string;
  symbol?: string | null;
  isin?: string | null;
};

export type TwelveDataPriceResult = Record<
  string,
  { price: number; currency: string | null }
>;

export type TwelveDataPrices = {
  prices: TwelveDataPriceResult;
  /** Why each request key left out has no price. */
  failed: Record<string, ProviderFailure>;
};

export type TwelveDataInstrument = {
  symbol: string | null;
  name: string | null;
  currency: string | null;
  price: number | null;
};

type Quote = {
  symbol: string | null;
  name: string | null;
  currency: string | null;
  price: number;
};

type ResolvedSymbol = {
  symbol: string;
  name: string | null;
  currency: string | null;
  micCode: string | null;
};

const MIC_TO_YAHOO_SUFFIX: Record<string, string> = {
  XBUE: ".BA",
  XETR: ".DE",
  XLON: ".L",
  XMIL: ".MI",
  XPAR: ".PA",
  XAMS: ".AS",
  XMAD: ".MC",
  XSWX: ".SW",
  XSTO: ".ST",
  XHEL: ".HE",
  XCSE: ".CO",
  XOSL: ".OL",
  XBRU: ".BR",
  XLIS: ".LS",
  XWBO: ".VI",
};

/**
 * GETs a TwelveData endpoint with the key in a header, never in the URL. It
 * also reports failures (a rate limit, an unknown symbol) as a 200 with an
 * error code in the body.
 */
async function requestTwelveData<T extends { code?: number }>(
  tag: string,
  path: string,
  params: Record<string, string>,
  apiKey: string,
  headers: Record<string, string> = {},
): Promise<ProviderResult<T>> {
  const url = new URL(`${TWELVEDATA_API}/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const result = await fetchJson<T | null>(tag, url.toString(), {
    headers: { ...headers, Authorization: `apikey ${apiKey}` },
  });
  if (!result.ok) return result;
  if (!result.data) return providerFailure(tag, "bad_response");
  const code = result.data.code;
  if (code && code >= 400) return providerFailure(tag, failureForStatus(code));
  return { ok: true, data: result.data };
}

async function fetchQuote(symbol: string, apiKey: string): Promise<ProviderResult<Quote>> {
  const result = await requestTwelveData<TwelveDataQuote>("twelvedata.quote", "quote", { symbol }, apiKey);
  if (!result.ok) return result;
  const data = result.data;

  const rawPrice = data.close ?? data.price;
  const price = rawPrice != null ? Number(rawPrice) : null;
  if (price == null || Number.isNaN(price) || price <= 0) return providerFailure("twelvedata.quote", "not_found");

  return {
    ok: true,
    data: {
      symbol: data.symbol ?? null,
      name: data.name ?? null,
      currency: data.currency ?? null,
      price,
    },
  };
}

async function searchSymbol(query: string, apiKey: string): Promise<ProviderResult<ResolvedSymbol>> {
  const result = await requestTwelveData<TwelveDataSearchResponse>(
    "twelvedata.search",
    "symbol_search",
    { symbol: query, outputsize: "30" },
    apiKey,
    { "User-Agent": "Finify/1.0", Accept: "application/json" },
  );
  if (!result.ok) return result;

  const results = result.data.data ?? [];
  const normalized = query.trim().toUpperCase();
  const preferred =
    results.find((item) => item.symbol?.toUpperCase() === normalized) ??
    results.find((item) => item.mic_code === "XETRA") ??
    results.find((item) => item.country === "Germany") ??
    results[0];

  if (!preferred?.symbol) return providerFailure("twelvedata.search", "not_found");

  return {
    ok: true,
    data: {
      symbol: preferred.symbol,
      name: preferred.instrument_name ?? null,
      currency: preferred.currency ?? null,
      micCode: preferred.mic_code ?? null,
    },
  };
}

async function fetchYahooQuote(
  symbol: string,
  micCode: string | null,
): Promise<{ price: number; currency: string | null } | null> {
  const suffix = micCode ? MIC_TO_YAHOO_SUFFIX[micCode] : undefined;
  const candidates = [suffix ? `${symbol}${suffix}` : null, symbol].filter(Boolean) as string[];

  try {
    const { default: YahooFinance } = await import("yahoo-finance2");
    const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

    for (const candidate of candidates) {
      try {
        const quote = await yf.quote(candidate);
        const price =
          typeof quote.regularMarketPrice === "number"
            ? quote.regularMarketPrice
            : null;

        if (price != null && !Number.isNaN(price) && price > 0) {
          return {
            price,
            currency: typeof quote.currency === "string" ? quote.currency : null,
          };
        }
      } catch (e) {
        // try next candidate
        logError("yahoo.quote", e);
      }
    }
  } catch (e) {
    logError("yahoo.quote", e);
    return null;
  }

  return null;
}

/** The instrument a ticker or ISIN names, or why it could not be looked up. */
export async function fetchTwelveDataInstrument(
  query: string,
): Promise<ProviderResult<TwelveDataInstrument>> {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) return { ok: false, reason: "unavailable" };
  if (!query) return { ok: false, reason: "not_found" };

  const resolved = await searchSymbol(query, apiKey);
  if (resolved.ok) {
    const yahooQuote = await fetchYahooQuote(resolved.data.symbol, resolved.data.micCode);
    if (yahooQuote) {
      return {
        ok: true,
        data: {
          symbol: resolved.data.symbol,
          name: resolved.data.name,
          currency: yahooQuote.currency ?? resolved.data.currency,
          price: yahooQuote.price,
        },
      };
    }
  }

  const found = resolved.ok ? resolved.data : null;
  const quote = await fetchQuote(found?.symbol ?? query, apiKey);
  if (!quote.ok) {
    return { ok: false, reason: combineFailures(resolved.ok ? [quote.reason] : [resolved.reason, quote.reason]) };
  }

  return {
    ok: true,
    data: {
      symbol: quote.data.symbol ?? found?.symbol ?? null,
      name: quote.data.name ?? found?.name ?? null,
      currency: quote.data.currency ?? found?.currency ?? null,
      price: quote.data.price,
    },
  };
}

/**
 * Prices by request key, and why each request left out has none. Without an
 * API key nothing is asked (the missing key is logged at startup).
 */
export async function fetchTwelveDataPrices(
  requests: TwelveDataRequest[],
): Promise<TwelveDataPrices> {
  const prices: TwelveDataPriceResult = {};
  const failed: Record<string, ProviderFailure> = {};
  const apiKey = process.env.TWELVEDATA_API_KEY;

  // Instruments are independent: resolve them in parallel (capped, the free
  // tier is rate limited) instead of one after another.
  await forEachLimited(requests, TWELVEDATA_CONCURRENCY, async (request) => {
    if (!apiKey) {
      failed[request.key] = "unavailable";
      return;
    }
    const attempts = [request.symbol?.trim(), request.isin?.trim()].filter(Boolean) as string[];
    const reasons: ProviderFailure[] = [];
    for (const attempt of attempts) {
      const resolved = await searchSymbol(attempt, apiKey);
      if (!resolved.ok) reasons.push(resolved.reason);
      const yahooQuote = resolved.ok
        ? await fetchYahooQuote(resolved.data.symbol, resolved.data.micCode)
        : null;
      if (yahooQuote) {
        prices[request.key] = yahooQuote;
        return;
      }
      const quote = await fetchQuote(resolved.ok ? resolved.data.symbol : attempt, apiKey);
      if (quote.ok) {
        prices[request.key] = { price: quote.data.price, currency: quote.data.currency };
        return;
      }
      reasons.push(quote.reason);
    }
    failed[request.key] = combineFailures(reasons);
  });

  return { prices, failed };
}
