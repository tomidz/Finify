import "server-only";
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

export type TwelveDataInstrument = {
  symbol: string | null;
  name: string | null;
  currency: string | null;
  price: number | null;
};

type ResolvedSymbol = {
  symbol: string;
  name: string | null;
  currency: string | null;
  micCode: string | null;
};

const MIC_TO_YAHOO_SUFFIX: Record<string, string> = {
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

async function fetchQuote(query: string): Promise<{ price: number; currency: string | null } | null> {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey || !query) return null;

  const url = new URL("https://api.twelvedata.com/quote");
  url.searchParams.set("symbol", query);
  url.searchParams.set("apikey", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) return null;

    const data = (await response.json()) as TwelveDataQuote;
    if (data.code && data.code >= 400) return null;

    const rawPrice = data.close ?? data.price;
    const price = rawPrice != null ? Number(rawPrice) : null;

    if (price == null || Number.isNaN(price) || price <= 0) return null;

    return {
      price,
      currency: data.currency ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchSymbol(query: string): Promise<ResolvedSymbol | null> {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey || !query) return null;

  const url = new URL("https://api.twelvedata.com/symbol_search");
  url.searchParams.set("symbol", query);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("outputsize", "30");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Finify/1.0",
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as TwelveDataSearchResponse;
    if (data.code && data.code >= 400) return null;

    const results = data.data ?? [];
    if (results.length === 0) return null;

    const normalized = query.trim().toUpperCase();
    const preferred =
      results.find((item) => item.symbol?.toUpperCase() === normalized) ??
      results.find((item) => item.mic_code === "XETRA") ??
      results.find((item) => item.country === "Germany") ??
      results[0];

    if (!preferred?.symbol) return null;

    return {
      symbol: preferred.symbol,
      name: preferred.instrument_name ?? null,
      currency: preferred.currency ?? null,
      micCode: preferred.mic_code ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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
      } catch {
        // try next candidate
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function fetchTwelveDataInstrument(
  query: string,
): Promise<TwelveDataInstrument | null> {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey || !query) return null;

  const resolved = await searchSymbol(query);
  if (resolved) {
    const yahooQuote = await fetchYahooQuote(resolved.symbol, resolved.micCode);
    if (yahooQuote) {
      return {
        symbol: resolved.symbol,
        name: resolved.name,
        currency: yahooQuote.currency ?? resolved.currency,
        price: yahooQuote.price,
      };
    }
  }

  const symbol = resolved?.symbol ?? query;

  const url = new URL("https://api.twelvedata.com/quote");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) return null;

    const data = (await response.json()) as TwelveDataQuote;
    if (data.code && data.code >= 400) return null;

    const rawPrice = data.close ?? data.price;
    const price = rawPrice != null ? Number(rawPrice) : null;

    if (price != null && !Number.isNaN(price) && price > 0) {
      return {
        symbol: data.symbol ?? resolved?.symbol ?? null,
        name: data.name ?? resolved?.name ?? null,
        currency: data.currency ?? resolved?.currency ?? null,
        price,
      };
    }
  } catch {
    // fall through to Yahoo fallback
  } finally {
    clearTimeout(timeout);
  }

  return null;
}

export async function fetchTwelveDataPrices(
  requests: TwelveDataRequest[],
): Promise<TwelveDataPriceResult> {
  const results: TwelveDataPriceResult = {};

  for (const request of requests) {
    const attempts = [request.symbol?.trim(), request.isin?.trim()].filter(Boolean) as string[];
    for (const attempt of attempts) {
      const resolved = await searchSymbol(attempt);
      let quote = resolved
        ? await fetchYahooQuote(resolved.symbol, resolved.micCode)
        : null;
      if (!quote) {
        quote = await fetchQuote(resolved?.symbol ?? attempt);
      }
      if (quote) {
        results[request.key] = quote;
        break;
      }
    }
  }

  return results;
}
