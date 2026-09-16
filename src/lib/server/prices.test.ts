import { beforeEach, describe, expect, it, vi } from "vitest";

import { argsOf, fakeSupabase, type RecordedQuery } from "../../../tests/support/fake-supabase";

const fetchCryptoPrices = vi.fn();
const fetchTwelveDataPrices = vi.fn();
const yahooQuote = vi.fn();

vi.mock("@/lib/coingecko", () => ({
  fetchCryptoPrices: (...args: unknown[]) => fetchCryptoPrices(...args),
}));
vi.mock("@/lib/twelvedata", () => ({
  fetchTwelveDataPrices: (...args: unknown[]) => fetchTwelveDataPrices(...args),
}));
vi.mock("yahoo-finance2", () => ({
  default: { quote: (...args: unknown[]) => yahooQuote(...args) },
}));

const { resolveCurrentPrices } = await import("./prices");

function context(cachedRows: { price_key: string; price: number }[]) {
  const fake = fakeSupabase((query: RecordedQuery) =>
    argsOf(query, "upsert")
      ? { data: null, error: null }
      : { data: cachedRows, error: null },
  );
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
});
