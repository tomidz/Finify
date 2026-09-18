import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { argsOf, fakeSupabase, type RecordedQuery } from "../../../tests/support/fake-supabase";

const fetchExchangeRate = vi.fn();
let responder: (query: RecordedQuery) => { data: unknown; error: { code: string; message?: string } | null };
let queries: RecordedQuery[] = [];

vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));
vi.mock("@/lib/frankfurter", () => ({
  fetchExchangeRate: (...args: unknown[]) => fetchExchangeRate(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const fake = fakeSupabase((query) => responder(query));
    queries = fake.queries;
    return fake.client;
  },
}));

const { getFxQuote } = await import("./fx");

type Cached = { rate_date: string; rate: number };

/** A cache with `rows`: the exact read finds its date, the recent read the latest in range. */
function cache(rows: Cached[]) {
  queries = [];
  responder = (query) => {
    if (argsOf(query, "insert")) return { data: null, error: null };
    const exactDate = query.calls.find((c) => c.method === "eq" && c.args[0] === "rate_date")?.args[1];
    if (exactDate) return { data: rows.find((r) => r.rate_date === exactDate) ?? null, error: null };
    const upTo = argsOf(query, "lte")?.[1] as string;
    const from = argsOf(query, "gte")?.[1] as string;
    const inRange = rows
      .filter((r) => r.rate_date <= upTo && r.rate_date >= from)
      .sort((a, b) => b.rate_date.localeCompare(a.rate_date));
    return { data: inRange[0] ?? null, error: null };
  };
}

const inserted = () => queries.flatMap((q) => (argsOf(q, "insert") as unknown[] | undefined) ?? []);

describe("getFxQuote", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00Z"));
    fetchExchangeRate.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers a past date from its cached quote", async () => {
    cache([{ rate_date: "2026-09-01", rate: 1.1 }]);

    const result = await getFxQuote({ date: "2026-09-01", from: "EUR", to: "USD" });

    expect(result).toEqual({ data: { rate: 1.1, rateDate: "2026-09-01", source: "frankfurter" } });
    expect(fetchExchangeRate).not.toHaveBeenCalled();
  });

  it("asks the provider for today's quote and caches it under today", async () => {
    cache([]);
    fetchExchangeRate.mockResolvedValue(1.17);

    const result = await getFxQuote({ date: "2026-09-16", from: "EUR", to: "USD" });

    expect(fetchExchangeRate).toHaveBeenCalledWith("EUR", "USD", undefined);
    expect(result).toEqual({ data: { rate: 1.17, rateDate: "2026-09-16", source: "frankfurter" } });
    expect(inserted()).toEqual([expect.objectContaining({ rate_date: "2026-09-16", rate: 1.17 })]);
  });

  it("takes today's quote for a future date", async () => {
    cache([{ rate_date: "2026-09-16", rate: 1.17 }]);

    const result = await getFxQuote({ date: "2026-12-01", from: "EUR", to: "USD" });

    expect(result).toEqual({ data: { rate: 1.17, rateDate: "2026-09-16", source: "frankfurter" } });
    expect(fetchExchangeRate).not.toHaveBeenCalled();
  });

  it("asks for a past date's quote of the peso, and caches it under that date", async () => {
    cache([]);
    fetchExchangeRate.mockResolvedValue(0.0007);

    const result = await getFxQuote({ date: "2026-05-15", from: "ARS", to: "USD" });

    expect(fetchExchangeRate).toHaveBeenCalledWith("ARS", "USD", "2026-05-15");
    expect(result).toEqual({ data: { rate: 0.0007, rateDate: "2026-05-15", source: "dolarapi" } });
    expect(inserted()).toEqual([expect.objectContaining({ rate_date: "2026-05-15", source: "dolarapi" })]);
  });

  it("falls back to a recent cached quote, with its date, when the provider is down", async () => {
    cache([
      { rate_date: "2026-09-02", rate: 1.12 },
      { rate_date: "2026-09-11", rate: 1.16 },
    ]);
    fetchExchangeRate.mockResolvedValue(null);

    const result = await getFxQuote({ date: "2026-09-16", from: "EUR", to: "USD" });

    expect(result).toEqual({ data: { rate: 1.16, rateDate: "2026-09-11", source: "frankfurter" } });
    expect(inserted()).toEqual([]);
  });

  it("does not use a quote older than the window, which is shorter for the peso", async () => {
    cache([{ rate_date: "2026-09-12", rate: 0.0007 }]);
    fetchExchangeRate.mockResolvedValue(null);

    const peso = await getFxQuote({ date: "2026-09-16", from: "ARS", to: "USD" });
    expect(peso).toEqual({ error: "No hay cotización de ARS a USD para el 2026-09-16" });

    cache([{ rate_date: "2026-09-08", rate: 1.1 }]);
    const euro = await getFxQuote({ date: "2026-09-16", from: "EUR", to: "USD" });
    expect(euro).toEqual({ error: "No hay cotización de EUR a USD para el 2026-09-16" });
  });

  it("reports a failed cache read in Spanish, without asking the provider", async () => {
    queries = [];
    responder = () => ({ data: null, error: { code: "XX000", message: "could not read block 42 of relation fx_rates" } });

    const result = await getFxQuote({ date: "2026-09-02", from: "EUR", to: "USD" });

    expect(result).toEqual({ error: "Error al obtener tipo de cambio" });
    expect(fetchExchangeRate).not.toHaveBeenCalled();
  });

  it("converts a currency to itself at 1 without asking anything", async () => {
    cache([]);
    const result = await getFxQuote({ date: "2026-09-16", from: "USD", to: "USD" });
    expect(result).toEqual({ data: { rate: 1, rateDate: "2026-09-16", source: "same currency" } });
    expect(queries).toHaveLength(0);
  });
});
