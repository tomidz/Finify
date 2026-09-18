import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { argsOf, fakeSupabase } from "../../../tests/support/fake-supabase";

const getFxQuote = vi.fn();
const fetchArsPerUsdHistory = vi.fn();
vi.mock("@/lib/server/fx", () => ({
  getFxQuote: (input: unknown) => getFxQuote(input),
}));
const fetchFrankfurterSeries = vi.fn();
vi.mock("@/lib/dolarapi", () => ({
  fetchArsPerUsdHistory: () => fetchArsPerUsdHistory(),
}));
vi.mock("@/lib/frankfurter", () => ({
  fetchFrankfurterSeries: (...args: unknown[]) => fetchFrankfurterSeries(...args),
}));

const quote = (rate: number, rateDate: string) => ({ data: { rate, rateDate, source: "frankfurter" } });

const { resolveFxRates } = await import("./fx-range");

type Row = { from_currency: string; rate_date: string; rate: number; source: string };

const eur = (rate_date: string, rate: number, source = "frankfurter"): Row => ({
  from_currency: "EUR",
  rate_date,
  rate,
  source,
});

function withCache(rows: Row[]) {
  return fakeSupabase(() => ({ data: rows, error: null, count: rows.length }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asClient = (client: unknown) => client as any;

describe("resolveFxRates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16, 12)); // 2026-09-16 local
    getFxQuote.mockReset();
    fetchArsPerUsdHistory.mockReset().mockResolvedValue(null);
    fetchFrankfurterSeries.mockReset().mockResolvedValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers exact dates from one cache read, per source", async () => {
    const { client, queries } = withCache([
      eur("2026-09-07", 1.2),
      eur("2026-09-08", 9.9, "manual"),
      { from_currency: "GBP", rate_date: "2026-09-07", rate: 1.3, source: "frankfurter" },
    ]);
    getFxQuote.mockResolvedValue(quote(1.21, "2026-09-08"));

    const fxAt = await resolveFxRates(
      asClient(client),
      [
        { date: "2026-09-07", from: "EUR" },
        { date: "2026-09-07", from: "GBP" },
        { date: "2026-09-08", from: "EUR" },
        { date: "2026-09-07", from: "USD" },
      ],
      "USD",
    );

    expect(fxAt("2026-09-07", "EUR")).toBe(1.2);
    expect(fxAt("2026-09-07", "GBP")).toBe(1.3);
    expect(fxAt("2026-09-07", "USD")).toBe(1);
    // Only a row from another source: goes to the provider like before.
    expect(fxAt("2026-09-08", "EUR")).toBe(1.21);
    expect(getFxQuote).toHaveBeenCalledTimes(1);
    expect(getFxQuote).toHaveBeenCalledWith({ date: "2026-09-08", from: "EUR", to: "USD", offline: false });
    expect(queries).toHaveLength(1);
    expect(argsOf(queries[0], "in")).toEqual(["from_currency", ["EUR", "GBP"]]);
  });

  it("does not stand in a nearby date for a missing one, and returns null when the provider fails", async () => {
    const { client } = withCache([eur("2026-09-04", 1.1)]);
    getFxQuote.mockResolvedValue({ error: "sin cotización" });

    const fxAt = await resolveFxRates(asClient(client), [{ date: "2026-09-06", from: "EUR" }], "USD");

    expect(getFxQuote).toHaveBeenCalledWith({ date: "2026-09-06", from: "EUR", to: "USD", offline: false });
    expect(fxAt("2026-09-06", "EUR")).toBeNull();
    expect(fxAt.rateDate("2026-09-06", "EUR")).toBeNull();
  });

  it("asks for each uncached past date of the peso, which has history", async () => {
    const { client } = withCache([
      { from_currency: "ARS", rate_date: "2026-08-01", rate: 0.0009, source: "dolarapi" },
    ]);
    getFxQuote.mockImplementation(async ({ date }: { date: string }) =>
      date === "2026-07-01" ? quote(0.001, "2026-07-01") : quote(0.0008, "2026-08-30"),
    );

    const fxAt = await resolveFxRates(
      asClient(client),
      [
        { date: "2026-07-01", from: "ARS" },
        { date: "2026-08-01", from: "ARS" },
        { date: "2026-09-01", from: "ARS" },
      ],
      "USD",
    );

    expect(getFxQuote).toHaveBeenCalledTimes(2);
    expect(fxAt("2026-07-01", "ARS")).toBe(0.001);
    expect(fxAt("2026-08-01", "ARS")).toBe(0.0009);
    expect(fxAt("2026-09-01", "ARS")).toBe(0.0008);
  });

  it("says which date each rate was quoted for", async () => {
    const { client } = withCache([eur("2026-09-07", 1.2)]);
    getFxQuote.mockResolvedValue(quote(1.19, "2026-09-04"));

    const fxAt = await resolveFxRates(
      asClient(client),
      [
        { date: "2026-09-07", from: "EUR" },
        { date: "2026-09-08", from: "EUR" },
      ],
      "USD",
    );

    expect(fxAt.rateDate("2026-09-07", "EUR")).toBe("2026-09-07");
    expect(fxAt.rateDate("2026-09-08", "EUR")).toBe("2026-09-04");
    expect(fxAt.rateDate("2026-09-08", "USD")).toBe("2026-09-08");
  });

  it("loads the peso's history once for many uncached past days, carrying a quote over a weekend", async () => {
    const { client, queries } = withCache([]);
    fetchArsPerUsdHistory.mockResolvedValue(
      new Map([
        ["2026-09-04", 1400],
        ["2026-09-07", 1410],
        ["2026-09-08", 1420],
      ]),
    );

    const fxAt = await resolveFxRates(
      asClient(client),
      [
        { date: "2026-09-06", from: "ARS" },
        { date: "2026-09-07", from: "ARS" },
        { date: "2026-09-08", from: "ARS" },
      ],
      "USD",
    );

    expect(fetchArsPerUsdHistory).toHaveBeenCalledTimes(1);
    expect(getFxQuote).not.toHaveBeenCalled();
    expect(fxAt("2026-09-06", "ARS")).toBeCloseTo(1 / 1400);
    expect(fxAt("2026-09-08", "ARS")).toBeCloseTo(1 / 1420);
    const cached = queries.flatMap((q) => (argsOf(q, "upsert")?.[0] as { rate_date: string }[] | undefined) ?? []);
    expect(cached.map((row) => row.rate_date)).toEqual(["2026-09-06", "2026-09-07", "2026-09-08"]);
  });

  it("crosses the peso's history with the other currency's dollar series, in one request each", async () => {
    const { client } = withCache([]);
    fetchArsPerUsdHistory.mockResolvedValue(
      new Map([
        ["2026-09-04", 1400],
        ["2026-09-07", 1410],
        ["2026-09-08", 1420],
      ]),
    );
    // EUR per USD, business days only.
    fetchFrankfurterSeries.mockResolvedValue(
      new Map([
        ["2026-09-04", 0.9],
        ["2026-09-07", 0.8],
        ["2026-09-08", 0.85],
      ]),
    );

    const fxAt = await resolveFxRates(
      asClient(client),
      [
        { date: "2026-09-06", from: "EUR" },
        { date: "2026-09-07", from: "EUR" },
        { date: "2026-09-08", from: "EUR" },
      ],
      "ARS",
    );

    expect(fetchFrankfurterSeries).toHaveBeenCalledTimes(1);
    expect(fetchFrankfurterSeries).toHaveBeenCalledWith("USD", "EUR", "2026-09-06", "2026-09-08");
    expect(getFxQuote).not.toHaveBeenCalled();
    expect(fxAt("2026-09-06", "EUR")).toBeCloseTo(1400 / 0.9);
    expect(fxAt("2026-09-08", "EUR")).toBeCloseTo(1420 / 0.85);
  });

  it("loads a currency's series once for many uncached past days, carrying a rate over a weekend", async () => {
    const { client, queries } = withCache([]);
    fetchFrankfurterSeries.mockResolvedValue(
      new Map([
        ["2026-09-04", 1.1],
        ["2026-09-07", 1.2],
        ["2026-09-08", 1.3],
      ]),
    );

    const fxAt = await resolveFxRates(
      asClient(client),
      [
        { date: "2026-09-06", from: "EUR" },
        { date: "2026-09-07", from: "EUR" },
        { date: "2026-09-08", from: "EUR" },
      ],
      "USD",
    );

    expect(fetchFrankfurterSeries).toHaveBeenCalledWith("EUR", "USD", "2026-09-06", "2026-09-08");
    expect(getFxQuote).not.toHaveBeenCalled();
    expect(fxAt("2026-09-06", "EUR")).toBe(1.1);
    expect(fxAt("2026-09-08", "EUR")).toBe(1.3);
    const cached = queries.flatMap((q) => (argsOf(q, "upsert")?.[0] as { source: string }[] | undefined) ?? []);
    expect(cached.map((row) => row.source)).toEqual(["frankfurter", "frankfurter", "frankfurter"]);
  });

  it("stops asking a provider that failed for the rest of the batch", async () => {
    const { client } = withCache([]);
    getFxQuote.mockImplementation(async ({ offline }: { offline: boolean }) =>
      offline ? { error: "sin cotización" } : quote(1.1, "2026-09-01"),
    );

    await resolveFxRates(
      asClient(client),
      Array.from({ length: 10 }, (_, i) => ({ date: `2026-09-${String(i + 2).padStart(2, "0")}`, from: "EUR" })),
      "USD",
    );

    const online = getFxQuote.mock.calls.filter(([input]) => !(input as { offline: boolean }).offline);
    expect(online.length).toBeLessThanOrEqual(4);
  });

  it("reads today's quote for future dates", async () => {
    const { client } = withCache([eur("2026-09-16", 1.17)]);

    const fxAt = await resolveFxRates(
      asClient(client),
      [
        { date: "2026-10-01", from: "EUR" },
        { date: "2026-11-01", from: "EUR" },
      ],
      "USD",
    );

    expect(fxAt("2026-10-01", "EUR")).toBe(1.17);
    expect(fxAt("2026-11-01", "EUR")).toBe(1.17);
    expect(getFxQuote).not.toHaveBeenCalled();
  });

  it("asks the provider once for all uncached future dates of a currency", async () => {
    const { client } = withCache([]);
    getFxQuote.mockResolvedValue(quote(1.18, "2026-09-16"));

    const fxAt = await resolveFxRates(
      asClient(client),
      [
        { date: "2026-10-01", from: "EUR" },
        { date: "2026-11-01", from: "EUR" },
      ],
      "USD",
    );

    expect(getFxQuote).toHaveBeenCalledTimes(1);
    expect(getFxQuote).toHaveBeenCalledWith({ date: "2026-09-16", from: "EUR", to: "USD", offline: false });
    expect(fxAt("2026-11-01", "EUR")).toBe(1.18);
  });

  it("reads every page of the cache", async () => {
    const page = (size: number): Row[] =>
      Array.from({ length: size }, () => eur("2026-09-07", 1.2));
    const { client, queries } = fakeSupabase((query) => {
      const [from] = argsOf(query, "range") as [number, number];
      return { data: from === 0 ? page(1000) : page(3), error: null, count: 1003 };
    });

    await resolveFxRates(asClient(client), [{ date: "2026-09-07", from: "EUR" }], "USD");

    expect(queries.map((q) => argsOf(q, "range"))).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("does not query anything when every amount is already in the target currency", async () => {
    const { client, queries } = withCache([]);
    const fxAt = await resolveFxRates(asClient(client), [{ date: "2026-09-07", from: "USD" }], "USD");
    expect(fxAt("2026-09-07", "USD")).toBe(1);
    expect(queries).toHaveLength(0);
  });
});
