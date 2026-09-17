import { beforeEach, describe, expect, it, vi } from "vitest";

import { argsOf, fakeSupabase, type RecordedQuery } from "../../../tests/support/fake-supabase";

const fetchCryptoPrices = vi.fn();
const getFxQuote = vi.fn();
const fetchTwelveDataPrices = vi.fn();
const yahooQuote = vi.fn();

vi.mock("@/lib/coingecko", () => ({
  fetchCryptoPrices: (...args: unknown[]) => fetchCryptoPrices(...args),
}));
vi.mock("@/lib/twelvedata", () => ({
  fetchTwelveDataPrices: (...args: unknown[]) => fetchTwelveDataPrices(...args),
}));
vi.mock("@/lib/server/fx", () => ({
  getFxQuote: (...args: unknown[]) => getFxQuote(...args),
}));
vi.mock("yahoo-finance2", () => ({
  default: { quote: (...args: unknown[]) => yahooQuote(...args) },
}));

const { resolvePricesWithSources } = await import("./prices");

const resolveCurrentPrices = async (...args: Parameters<typeof resolvePricesWithSources>) => {
  const result = await resolvePricesWithSources(...args);
  return "error" in result ? result : { data: result.data.prices };
};

function context(cachedRows: { price_key: string; price: number; source?: string; fetched_at?: string }[]) {
  const filtersSource = (query: RecordedQuery, method: string) =>
    query.calls.some((call) => call.method === method && call.args[0] === "source");
  const fake = fakeSupabase((query: RecordedQuery) => {
    if (argsOf(query, "upsert")) return { data: null, error: null };
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
    fetchCryptoPrices.mockReset().mockResolvedValue({});
    fetchTwelveDataPrices.mockReset().mockResolvedValue({});
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
      { price_key: "market:AAPL|", price: 230 },
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
    expect(fetchCryptoPrices).not.toHaveBeenCalled();
    expect(fetchTwelveDataPrices).not.toHaveBeenCalled();
    expect(upserted(queries)).toEqual([]);
    expect(argsOf(queries[0], "eq")).toEqual(["user_id", "user-1"]);
  });

  it("fetches what the cache misses and stores it under the user", async () => {
    const { ctx, queries } = context([]);
    fetchCryptoPrices.mockResolvedValue({ BTC: 91_000 });
    fetchTwelveDataPrices.mockResolvedValue({ "market:AAPL|": { price: 231 } });

    const result = await resolveCurrentPrices(
      [
        { key: "btc", ticker: "BTC", assetType: "crypto" },
        { key: "aapl", ticker: "AAPL", assetType: "stock" },
      ],
      "EUR",
      ctx,
    );

    expect(result).toEqual({ data: { btc: 91_000, aapl: 231 } });
    expect(fetchCryptoPrices).toHaveBeenCalledWith(["BTC"], "EUR");
    expect(upserted(queries)).toEqual([
      expect.objectContaining({ price_key: "crypto:BTC:EUR", price: 91_000, source: "coingecko", user_id: "user-1" }),
      expect.objectContaining({ price_key: "market:AAPL|", price: 231, source: "twelvedata", user_id: "user-1" }),
    ]);
  });

  it("falls back to Yahoo for market tickers TwelveData cannot price, and leaves unknown ones unpriced", async () => {
    const { ctx } = context([]);
    yahooQuote.mockImplementation(async (ticker: string) => {
      if (ticker === "GGAL.BA") return { regularMarketPrice: 5_000 };
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

  it("asks once for requests that look an instrument up the same way", async () => {
    const { ctx, queries } = context([]);
    fetchTwelveDataPrices.mockResolvedValue({ "market:AAPL|US0378331005": { price: 232 } });

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
      { key: "market:AAPL|US0378331005", symbol: "AAPL", isin: "US0378331005" },
    ]);
    expect(upserted(queries)).toHaveLength(1);
  });

  it("never answers a lookup with the price of another lookup for the same holding", async () => {
    const { ctx } = context([{ price_key: "market:Apple Inc|US0378331005", price: 199 }]);
    fetchTwelveDataPrices.mockResolvedValue({ "market:|US0378331005": { price: 230 } });

    const result = await resolveCurrentPrices(
      [{ key: "US0378331005", ticker: null, isin: "US0378331005", assetType: "stock" }],
      "USD",
      ctx,
    );

    expect(result).toEqual({ data: { US0378331005: 230 } });
  });

  it("skips the cache on a refresh but still stores what it fetched", async () => {
    const { ctx, queries } = context([{ price_key: "market:AAPL|", price: 230 }]);
    fetchTwelveDataPrices.mockResolvedValue({ "market:AAPL|": { price: 233 } });

    const result = await resolveCurrentPrices(
      [{ key: "aapl", ticker: "AAPL", assetType: "stock" }],
      "USD",
      ctx,
      { fresh: true },
    );

    expect(result).toEqual({ data: { aapl: 233 } });
    expect(queries.filter((q) => !argsOf(q, "upsert"))).toHaveLength(0);
    expect(upserted(queries)).toEqual([expect.objectContaining({ price_key: "market:AAPL|", price: 233 })]);
  });

  it("works without a context, skipping the cache", async () => {
    fetchCryptoPrices.mockResolvedValue({ ETH: 3_000 });
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
    expect(fetchCryptoPrices).not.toHaveBeenCalled();
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
    fetchTwelveDataPrices.mockResolvedValue({ "market:NOK|": { price: 4.5 } });
    const result = await resolveCurrentPrices([{ key: "nok", ticker: "NOK", assetType: "stock", currency: "USD" }], "USD", ctx);
    expect(result).toEqual({ data: { nok: 4.5 } });
  });

  it("quotes a stock even when money filed under its ticker is looked up too", async () => {
    const { ctx } = context([]);
    fetchTwelveDataPrices.mockResolvedValue({ "market:NOK|": { price: 4.5 } });
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
      { price_key: "market:GGALD|", price: 1500, source: "manual", fetched_at: "2026-09-01T12:00:00+00:00" },
    ]);
    const result = await resolvePricesWithSources([{ key: "GGALD", ticker: "GGALD", assetType: "stock" }], "USD", ctx);
    expect(result).toEqual({
      data: {
        prices: { GGALD: 1500 },
        manualDates: { GGALD: "2026-09-01" },
        ratesToBase: { USD: 1 },
        rateDatesToBase: { USD: expect.any(String) },
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
      { price_key: "market:GGALD|", price: 1500, source: "manual", fetched_at: "2026-12-01T12:00:00+00:00" },
    ]);
    fetchTwelveDataPrices.mockResolvedValue({ "market:GGALD|": { price: 1600 } });
    const result = await resolveCurrentPrices([{ key: "GGALD", ticker: "GGALD", assetType: "stock" }], "USD", ctx);
    expect(result).toEqual({ data: { GGALD: 1600 } });
  });

  it("prices a crypto lot in its own currency and reports each currency's rate to the base", async () => {
    const { ctx } = context([]);
    fetchCryptoPrices.mockResolvedValue({ BTC: 100_000 });
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
      },
    });
    expect(fetchCryptoPrices).toHaveBeenCalledTimes(1);
  });

  it("prefers a provider quote over a manual price", async () => {
    const { ctx } = context([
      { price_key: "market:GGALD|", price: 1500, source: "manual", fetched_at: "2026-09-01T12:00:00+00:00" },
    ]);
    fetchTwelveDataPrices.mockResolvedValue({ "market:GGALD|": { price: 1600 } });
    const result = await resolvePricesWithSources(
      [{ key: "GGALD", ticker: "GGALD", assetType: "stock" }],
      "USD",
      ctx,
      { fresh: true },
    );
    expect(result).toEqual({
      data: { prices: { GGALD: 1600 }, manualDates: {}, ratesToBase: { USD: 1 }, rateDatesToBase: { USD: expect.any(String) } },
    });
  });
});
