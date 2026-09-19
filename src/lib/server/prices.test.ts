import { beforeEach, describe, expect, it, vi } from "vitest";

import { argsOf, fakeSupabase, type RecordedQuery } from "../../../tests/support/fake-supabase";

const fetchCryptoPricesWithReasons = vi.fn();
const getFxQuote = vi.fn();
const fetchTwelveDataPrices = vi.fn();
const yahooQuote = vi.fn();

vi.mock("@/lib/coingecko", () => ({
  fetchCryptoPricesWithReasons: (...args: unknown[]) => fetchCryptoPricesWithReasons(...args),
}));
vi.mock("@/lib/twelvedata", () => ({
  fetchTwelveDataPrices: (...args: unknown[]) => fetchTwelveDataPrices(...args),
}));
vi.mock("@/lib/server/fx", () => ({
  getFxQuote: (...args: unknown[]) => getFxQuote(...args),
}));
vi.mock("yahoo-finance2", () => ({
  // Constructed like the real client: a static call throws in v3.
  default: class {
    quote = (...args: unknown[]) => yahooQuote(...args);
  },
}));

const { resolvePricesWithSources } = await import("./prices");

// What the providers answer: prices by key, and why the others have none.
const quoted = (prices: Record<string, unknown>, failed: Record<string, string> = {}) => ({ prices, failed });

const resolveCurrentPrices = async (...args: Parameters<typeof resolvePricesWithSources>) => {
  const result = await resolvePricesWithSources(...args);
  return "error" in result ? result : { data: result.data.prices };
};

function context(
  cachedRows: { price_key: string; price: number; source?: string; fetched_at?: string }[],
  failing: { cache?: boolean; manual?: boolean } = {},
) {
  const filtersSource = (query: RecordedQuery, method: string) =>
    query.calls.some((call) => call.method === method && call.args[0] === "source");
  const fake = fakeSupabase((query: RecordedQuery) => {
    if (argsOf(query, "upsert")) return { data: null, error: null };
    if ((failing.manual && filtersSource(query, "eq")) || (failing.cache && filtersSource(query, "neq"))) {
      return { data: null, error: { code: "57014" } };
    }
    const rows = cachedRows.filter((row) =>
      filtersSource(query, "eq") ? row.source === "manual" : filtersSource(query, "neq") ? row.source !== "manual" : true,
    );
    return { data: rows, error: null };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ...fake, ctx: { supabase: fake.client as any, userId: "user-1" } };
}

const upserted = (queries: RecordedQuery[]) =>
  queries.flatMap((q) => (argsOf(q, "upsert")?.[0] as unknown[]) ?? []);

describe("resolveCurrentPrices", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchCryptoPricesWithReasons.mockReset().mockResolvedValue(quoted({}));
    fetchTwelveDataPrices.mockReset().mockResolvedValue(quoted({}));
    yahooQuote.mockReset();
    getFxQuote.mockReset().mockImplementation(async ({ from, to }: { from: string; to: string }) =>
      from === "EUR" && to === "USD"
        ? { data: { rate: 1.1, rateDate: "2026-09-14", source: "frankfurter" } }
        : from === "USD" && to === "EUR"
          ? { data: { rate: 0.9, rateDate: "2026-09-14", source: "frankfurter" } }
          : { error: "sin cotización" },
    );
  });

  it("serves fresh cached prices without calling any provider", async () => {
    const { ctx, queries } = context([
      { price_key: "crypto:BTC:EUR", price: 90_000 },
      { price_key: "market:EUR:AAPL|", price: 230 },
    ]);

    const result = await resolveCurrentPrices(
      [
        { key: "btc", ticker: "btc", assetType: "crypto" },
        { key: "aapl", ticker: "AAPL", assetType: "stock" },
      ],
      "EUR",
      ctx,
    );

    expect(result).toEqual({ data: { btc: 90_000, aapl: 230 } });
    expect(fetchCryptoPricesWithReasons).not.toHaveBeenCalled();
    expect(fetchTwelveDataPrices).not.toHaveBeenCalled();
    expect(upserted(queries)).toEqual([]);
    expect(argsOf(queries[0], "eq")).toEqual(["user_id", "user-1"]);
  });

  it("fetches what the cache misses and stores it under the user", async () => {
    const { ctx, queries } = context([]);
    fetchCryptoPricesWithReasons.mockResolvedValue(quoted({ BTC: 91_000 }));
    fetchTwelveDataPrices.mockResolvedValue(quoted({ "market:EUR:AAPL|": { price: 231 } }));

    const result = await resolveCurrentPrices(
      [
        { key: "btc", ticker: "BTC", assetType: "crypto" },
        { key: "aapl", ticker: "AAPL", assetType: "stock" },
      ],
      "EUR",
      ctx,
    );

    expect(result).toEqual({ data: { btc: 91_000, aapl: 231 } });
    expect(fetchCryptoPricesWithReasons).toHaveBeenCalledWith(["BTC"], "EUR");
    expect(upserted(queries)).toEqual([
      expect.objectContaining({ price_key: "crypto:BTC:EUR", price: 91_000, source: "coingecko", user_id: "user-1" }),
      expect.objectContaining({ price_key: "market:EUR:AAPL|", price: 231, source: "twelvedata", user_id: "user-1" }),
    ]);
  });

  it("falls back to Yahoo for market tickers TwelveData cannot price, and leaves unknown ones unpriced", async () => {
    const { ctx } = context([]);
    yahooQuote.mockImplementation(async (ticker: string) => {
      if (ticker === "GGAL.BA") return { regularMarketPrice: 5_000, currency: "USD" };
      throw new Error("not found");
    });

    const result = await resolveCurrentPrices(
      [
        { key: "ggal", ticker: "GGAL.BA", assetType: "stock" },
        { key: "nope", ticker: "NOPE", assetType: "stock" },
      ],
      "USD",
      ctx,
    );

    expect(result).toEqual({ data: { ggal: 5_000 } });
  });

  it("takes a Yahoo quote in another currency as another company's listing", async () => {
    const { ctx } = context([]);
    // AIR is Airbus in Paris and AAR Corp in New York.
    yahooQuote.mockResolvedValue({ regularMarketPrice: 60, currency: "USD" });

    const result = await resolvePricesWithSources(
      [{ key: "air", ticker: "AIR", assetType: "stock", currency: "EUR" }],
      "USD",
      ctx,
    );

    expect(result).toEqual({ data: expect.objectContaining({ prices: {}, unpriced: { air: "not_found" } }) });
  });

  it("asks once for requests that look an instrument up the same way", async () => {
    const { ctx, queries } = context([]);
    fetchTwelveDataPrices.mockResolvedValue(quoted({ "market:USD:AAPL|US0378331005": { price: 232 } }));

    const result = await resolveCurrentPrices(
      [
        { key: "account:AAPL", ticker: "AAPL", isin: "US0378331005", assetType: "stock" },
        { key: "month:AAPL", ticker: "AAPL", isin: "US0378331005", assetType: "stock" },
      ],
      "USD",
      ctx,
    );

    expect(result).toEqual({ data: { "account:AAPL": 232, "month:AAPL": 232 } });
    expect(fetchTwelveDataPrices).toHaveBeenCalledWith([
      { key: "market:USD:AAPL|US0378331005", symbol: "AAPL", isin: "US0378331005" },
    ]);
    expect(upserted(queries)).toHaveLength(1);
  });

  it("never answers a lookup with the price of another lookup for the same holding", async () => {
    const { ctx } = context([{ price_key: "market:USD:Apple Inc|US0378331005", price: 199 }]);
    fetchTwelveDataPrices.mockResolvedValue(quoted({ "market:USD:|US0378331005": { price: 230 } }));

    const result = await resolveCurrentPrices(
      [{ key: "US0378331005", ticker: null, isin: "US0378331005", assetType: "stock" }],
      "USD",
      ctx,
    );

    expect(result).toEqual({ data: { US0378331005: 230 } });
  });

  it("skips the cache on a refresh but still stores what it fetched", async () => {
    const { ctx, queries } = context([{ price_key: "market:USD:AAPL|", price: 230 }]);
    fetchTwelveDataPrices.mockResolvedValue(quoted({ "market:USD:AAPL|": { price: 233 } }));

    const result = await resolveCurrentPrices(
      [{ key: "aapl", ticker: "AAPL", assetType: "stock" }],
      "USD",
      ctx,
      { fresh: true },
    );

    expect(result).toEqual({ data: { aapl: 233 } });
    expect(queries.filter((q) => !argsOf(q, "upsert"))).toHaveLength(0);
    expect(upserted(queries)).toEqual([expect.objectContaining({ price_key: "market:USD:AAPL|", price: 233 })]);
  });

  it("works without a context, skipping the cache", async () => {
    fetchCryptoPricesWithReasons.mockResolvedValue(quoted({ ETH: 3_000 }));
    const result = await resolveCurrentPrices(
      [{ key: "eth", ticker: "ETH", assetType: "crypto" }],
      "USD",
    );
    expect(result).toEqual({ data: { eth: 3_000 } });
  });

  it("prices cash and stablecoins at the exchange rate, without asking a provider", async () => {
    const { ctx } = context([]);
    const result = await resolveCurrentPrices(
      [
        { key: "cash:EUR:USD", ticker: "EUR", assetType: "cash", currency: "USD" },
        { key: "cash:USD:USD", ticker: "USD", assetType: "cash", currency: "USD" },
        { key: "cash:USDT:USD", ticker: "USDT", assetType: "stablecoin", currency: "USD" },
      ],
      "USD",
      ctx,
    );
    expect(result).toEqual({ data: { "cash:EUR:USD": 1.1, "cash:USD:USD": 1, "cash:USDT:USD": 1 } });
    expect(fetchCryptoPricesWithReasons).not.toHaveBeenCalled();
    expect(fetchTwelveDataPrices).not.toHaveBeenCalled();
  });

  it("never asks a market provider about a currency code held as an asset", async () => {
    const { ctx } = context([]);
    const result = await resolveCurrentPrices(
      [
        { key: "usd", ticker: "USD", assetType: "stock", currency: "USD" },
        { key: "eur", ticker: "EUR", assetType: "other", currency: "USD" },
        { key: "usdt", ticker: "USDT", assetType: "other", currency: "USD" },
      ],
      "USD",
      ctx,
    );
    expect(result).toEqual({ data: {} });
    expect(fetchTwelveDataPrices).not.toHaveBeenCalled();
  });

  it("asks about a stock whose ticker is a currency code held in another currency", async () => {
    const { ctx } = context([]);
    fetchTwelveDataPrices.mockResolvedValue(quoted({ "market:USD:NOK|": { price: 4.5 } }));
    const result = await resolveCurrentPrices([{ key: "nok", ticker: "NOK", assetType: "stock", currency: "USD" }], "USD", ctx);
    expect(result).toEqual({ data: { nok: 4.5 } });
  });

  it("quotes a stock even when money filed under its ticker is looked up too", async () => {
    const { ctx } = context([]);
    fetchTwelveDataPrices.mockResolvedValue(quoted({ "market:USD:NOK|": { price: 4.5 } }));
    const result = await resolveCurrentPrices(
      [
        { key: "nok-cash", ticker: "NOK", assetType: "other", currency: "NOK" },
        { key: "nokia", ticker: "NOK", assetType: "stock", currency: "USD" },
      ],
      "USD",
      ctx,
    );
    expect(result).toEqual({ data: { nokia: 4.5 } });
  });

  it("uses a manual price, with its date, while no provider quotes the asset", async () => {
    const { ctx } = context([
      { price_key: "market:USD:GGALD|", price: 1500, source: "manual", fetched_at: "2026-09-01T12:00:00+00:00" },
    ]);
    const result = await resolvePricesWithSources([{ key: "GGALD", ticker: "GGALD", assetType: "stock" }], "USD", ctx);
    expect(result).toEqual({
      data: {
        prices: { GGALD: 1500 },
        manualDates: { GGALD: "2026-09-01" },
        ratesToBase: { USD: 1 },
        rateDatesToBase: { USD: expect.any(String) },
        unpriced: {},
      },
    });
  });

  it("gives a currency code held as an asset its manual price", async () => {
    const { ctx } = context([
      { price_key: "unlisted:etf:USD:USD", price: 81, source: "manual", fetched_at: "2026-09-01T12:00:00+00:00" },
    ]);
    const result = await resolveCurrentPrices([{ key: "usd", ticker: "USD", assetType: "etf", currency: "USD" }], "USD", ctx);
    expect(result).toEqual({ data: { usd: 81 } });
  });

  it("gives a holding with neither ticker nor ISIN only the manual price set under its name", async () => {
    const { ctx } = context([
      { price_key: "unlisted:bond:USD:Plazo fijo", price: 1.05, source: "manual", fetched_at: "2026-09-01T12:00:00+00:00" },
    ]);
    const result = await resolveCurrentPrices(
      [
        { key: "plazo", ticker: null, isin: null, name: "Plazo fijo", assetType: "bond", currency: "USD" },
        { key: "plazo-ars", ticker: null, isin: null, name: "Plazo fijo", assetType: "bond", currency: "ARS" },
        { key: "depto", ticker: null, isin: null, name: "Departamento", assetType: "other", currency: "USD" },
      ],
      "USD",
      ctx,
    );
    expect(result).toEqual({ data: { plazo: 1.05 } });
    expect(fetchTwelveDataPrices).not.toHaveBeenCalled();
    expect(yahooQuote).not.toHaveBeenCalled();
  });

  it("never takes a manual price for a fresh quote, whatever its date", async () => {
    const { ctx } = context([
      { price_key: "market:USD:GGALD|", price: 1500, source: "manual", fetched_at: "2026-12-01T12:00:00+00:00" },
    ]);
    fetchTwelveDataPrices.mockResolvedValue(quoted({ "market:USD:GGALD|": { price: 1600 } }));
    const result = await resolveCurrentPrices([{ key: "GGALD", ticker: "GGALD", assetType: "stock" }], "USD", ctx);
    expect(result).toEqual({ data: { GGALD: 1600 } });
  });

  it("prices a crypto lot in its own currency and reports each currency's rate to the base", async () => {
    const { ctx } = context([]);
    fetchCryptoPricesWithReasons.mockResolvedValue(quoted({ BTC: 100_000 }));
    const result = await resolvePricesWithSources(
      [
        { key: "btc-usd", ticker: "BTC", assetType: "crypto", currency: "USD" },
        { key: "btc-eur", ticker: "BTC", assetType: "crypto", currency: "EUR" },
      ],
      "USD",
      ctx,
    );
    expect(result).toEqual({
      data: {
        prices: { "btc-usd": 100_000, "btc-eur": 90_000 },
        manualDates: {},
        ratesToBase: { USD: 1, EUR: 1.1 },
        rateDatesToBase: { USD: expect.any(String), EUR: "2026-09-14" },
        unpriced: {},
      },
    });
    expect(fetchCryptoPricesWithReasons).toHaveBeenCalledTimes(1);
  });

  it("prefers a provider quote over a manual price", async () => {
    const { ctx } = context([
      { price_key: "market:USD:GGALD|", price: 1500, source: "manual", fetched_at: "2026-09-01T12:00:00+00:00" },
    ]);
    fetchTwelveDataPrices.mockResolvedValue(quoted({ "market:USD:GGALD|": { price: 1600 } }));
    const result = await resolvePricesWithSources(
      [{ key: "GGALD", ticker: "GGALD", assetType: "stock" }],
      "USD",
      ctx,
      { fresh: true },
    );
    expect(result).toEqual({
      data: {
        prices: { GGALD: 1600 },
        manualDates: {},
        ratesToBase: { USD: 1 },
        rateDatesToBase: { USD: expect.any(String) },
        unpriced: {},
      },
    });
  });

  it("says why each request went unpriced", async () => {
    const { ctx } = context([]);
    fetchCryptoPricesWithReasons.mockResolvedValue(quoted({ BTC: 100_000 }, { DOGE: "rate_limited" }));
    fetchTwelveDataPrices.mockResolvedValue(quoted({}, { "market:USD:AAPL|": "timeout", "market:USD:NOPE|": "not_found" }));
    yahooQuote.mockRejectedValue(new Error("not found"));

    const result = await resolvePricesWithSources(
      [
        { key: "doge", ticker: "DOGE", assetType: "crypto" },
        { key: "aapl", ticker: "AAPL", assetType: "stock" },
        { key: "nope", ticker: "NOPE", assetType: "stock" },
        { key: "depto", ticker: null, isin: null, name: "Departamento", assetType: "other", currency: "USD" },
        { key: "btc-gbp", ticker: "BTC", assetType: "crypto", currency: "GBP" },
        { key: "cash:GBP:USD", ticker: "GBP", assetType: "cash", currency: "USD" },
      ],
      "USD",
      ctx,
    );

    expect(result).toEqual({
      data: expect.objectContaining({
        prices: {},
        unpriced: {
          doge: "rate_limited",
          aapl: "timeout",
          nope: "not_found",
          depto: "unquotable",
          "btc-gbp": "no_rate",
          "cash:GBP:USD": "no_rate",
        },
      }),
    });
  });

  it("fails when the manual prices cannot be read, instead of valuing those holdings at cost", async () => {
    const { ctx } = context([], { manual: true });

    const result = await resolvePricesWithSources([{ key: "GGALD", ticker: "GGALD", assetType: "stock" }], "USD", ctx);

    expect(result).toEqual({ error: "La base de datos tardó demasiado. Probá de nuevo." });
  });

  it("asks the providers when the price cache cannot be read", async () => {
    const { ctx } = context([], { cache: true });
    fetchTwelveDataPrices.mockResolvedValue(quoted({ "market:USD:AAPL|": { price: 231 } }));

    const result = await resolveCurrentPrices([{ key: "aapl", ticker: "AAPL", assetType: "stock" }], "USD", ctx);

    expect(result).toEqual({ data: { aapl: 231 } });
  });
  it("quotes a CEDEAR only on the Buenos Aires listing, never by its bare ticker", async () => {
    const { ctx } = context([]);
    yahooQuote.mockImplementation(async (symbol: string) => {
      if (symbol === "IBITD.BA") return { regularMarketPrice: 4.78, currency: "USD" };
      // The bare ticker is the fund the CEDEAR represents, ten times its price.
      if (symbol === "IBITD") return { regularMarketPrice: 46.02, currency: "USD" };
      throw new Error("not found");
    });

    const result = await resolveCurrentPrices(
      [{ key: "ibitd", ticker: "IBITD", assetType: "cedear", currency: "USD" }],
      "USD",
      ctx,
    );

    expect(result).toEqual({ data: { ibitd: 4.78 } });
    expect(fetchTwelveDataPrices).not.toHaveBeenCalled();
    expect(yahooQuote.mock.calls).toEqual([["IBITD.BA"]]);
  });

  it("looks a holding in pesos up on the local listing before the bare ticker", async () => {
    const { ctx } = context([]);
    yahooQuote.mockImplementation(async (symbol: string) => {
      if (symbol === "GGAL.BA") return { regularMarketPrice: 6_685, currency: "ARS" };
      throw new Error("not found");
    });

    const result = await resolveCurrentPrices(
      [{ key: "ggal", ticker: "GGAL", assetType: "stock", currency: "ARS" }],
      "USD",
      ctx,
    );

    expect(result).toEqual({ data: { ggal: 6_685 } });
    expect(yahooQuote).toHaveBeenCalledWith("GGAL.BA");
  });

  it("takes a TwelveData quote in another currency as another listing and asks Yahoo for the local one", async () => {
    const { ctx } = context([]);
    // GGAL is the Nasdaq ADR in dollars; the share in pesos is GGAL.BA.
    fetchTwelveDataPrices.mockResolvedValue(quoted({ "market:ARS:GGAL|": { price: 41.76, currency: "USD" } }));
    yahooQuote.mockImplementation(async (symbol: string) => {
      if (symbol === "GGAL.BA") return { regularMarketPrice: 6_685, currency: "ARS" };
      throw new Error("not found");
    });

    const result = await resolveCurrentPrices(
      [{ key: "ggal", ticker: "GGAL", assetType: "stock", currency: "ARS" }],
      "USD",
      ctx,
    );

    expect(result).toEqual({ data: { ggal: 6_685 } });
  });

  it("prices the same ticker held in two currencies as two lookups", async () => {
    const { ctx } = context([]);
    fetchTwelveDataPrices.mockResolvedValue(quoted({ "market:USD:AAPL|": { price: 336.13, currency: "USD" } }));
    yahooQuote.mockImplementation(async (symbol: string) => {
      if (symbol === "AAPL.BA") return { regularMarketPrice: 26_880, currency: "ARS" };
      throw new Error("not found");
    });

    const result = await resolveCurrentPrices(
      [
        { key: "aapl-usd", ticker: "AAPL", assetType: "stock", currency: "USD" },
        { key: "aapl-cedear", ticker: "AAPL", assetType: "cedear", currency: "ARS" },
      ],
      "USD",
      ctx,
    );

    expect(result).toEqual({ data: { "aapl-usd": 336.13, "aapl-cedear": 26_880 } });
  });

  it("reads a manual price stored under the market key from before it named the currency", async () => {
    const { ctx } = context([
      { price_key: "market:AL30|", price: 72_000, source: "manual", fetched_at: "2026-09-01T12:00:00+00:00" },
    ]);

    const result = await resolvePricesWithSources(
      [{ key: "al30", ticker: "AL30", assetType: "bond", currency: "ARS" }],
      "USD",
      ctx,
    );

    expect(result).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ prices: { al30: 72_000 }, manualDates: { al30: "2026-09-01" } }),
      }),
    );
  });
});
