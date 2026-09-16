import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { argsOf, fakeSupabase } from "../../../tests/support/fake-supabase";

const getOrFetchFxRate = vi.fn();
vi.mock("@/lib/server/fx", () => ({
  getOrFetchFxRate: (input: unknown) => getOrFetchFxRate(input),
}));

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
    getOrFetchFxRate.mockReset();
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
    getOrFetchFxRate.mockResolvedValue({ data: 1.21 });

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
    expect(getOrFetchFxRate).toHaveBeenCalledTimes(1);
    expect(getOrFetchFxRate).toHaveBeenCalledWith({ date: "2026-09-08", from: "EUR", to: "USD" });
    expect(queries).toHaveLength(1);
    expect(argsOf(queries[0], "in")).toEqual(["from_currency", ["EUR", "GBP"]]);
  });

  it("does not stand in a nearby date for a missing one, and returns null when the provider fails", async () => {
    const { client } = withCache([eur("2026-09-04", 1.1)]);
    getOrFetchFxRate.mockResolvedValue({ error: "sin cotización" });

    const fxAt = await resolveFxRates(asClient(client), [{ date: "2026-09-06", from: "EUR" }], "USD");

    expect(getOrFetchFxRate).toHaveBeenCalledWith({ date: "2026-09-06", from: "EUR", to: "USD" });
    expect(fxAt("2026-09-06", "EUR")).toBeNull();
  });

  it("asks dolarapi once per currency, since it only quotes today", async () => {
    const { client } = withCache([
      { from_currency: "ARS", rate_date: "2026-08-01", rate: 0.0009, source: "dolarapi" },
    ]);
    getOrFetchFxRate.mockResolvedValue({ data: 0.0008 });

    const fxAt = await resolveFxRates(
      asClient(client),
      [
        { date: "2026-07-01", from: "ARS" },
        { date: "2026-08-01", from: "ARS" },
        { date: "2026-09-01", from: "ARS" },
      ],
      "USD",
    );

    expect(getOrFetchFxRate).toHaveBeenCalledTimes(1);
    expect(getOrFetchFxRate).toHaveBeenCalledWith({ date: "2026-09-16", from: "ARS", to: "USD" });
    expect(fxAt("2026-07-01", "ARS")).toBe(0.0008);
    expect(fxAt("2026-08-01", "ARS")).toBe(0.0009);
    expect(fxAt("2026-09-01", "ARS")).toBe(0.0008);
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
    expect(getOrFetchFxRate).not.toHaveBeenCalled();
  });

  it("asks the provider once for all uncached future dates of a currency", async () => {
    const { client } = withCache([]);
    getOrFetchFxRate.mockResolvedValue({ data: 1.18 });

    const fxAt = await resolveFxRates(
      asClient(client),
      [
        { date: "2026-10-01", from: "EUR" },
        { date: "2026-11-01", from: "EUR" },
      ],
      "USD",
    );

    expect(getOrFetchFxRate).toHaveBeenCalledTimes(1);
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
