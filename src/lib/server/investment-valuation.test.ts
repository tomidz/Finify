import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase } from "../../../tests/support/fake-supabase";
import type { PriceRequest } from "./prices";

const resolveCurrentPrices = vi.fn();
vi.mock("@/lib/server/prices", () => ({
  resolveCurrentPrices: (...args: unknown[]) => resolveCurrentPrices(...args),
}));
vi.mock("@/lib/server/fx", () => ({
  getOrFetchFxRate: async () => ({ data: 1 }),
}));

const { loadInvestmentValuation } = await import("./investment-valuation");

const lot = (overrides: Record<string, unknown>) => ({
  account_id: "broker",
  asset_name: "Apple Inc",
  ticker: null,
  isin: null,
  asset_type: "stock",
  currency: "USD",
  quantity: 2,
  total_cost: 300,
  purchase_date: "2026-03-10",
  ...overrides,
});

function context(lots: ReturnType<typeof lot>[]) {
  const fake = fakeSupabase(() => ({ data: lots, error: null }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: fake.client as any, userId: "user-1" };
}

describe("loadInvestmentValuation", () => {
  beforeEach(() => {
    resolveCurrentPrices.mockReset();
  });

  it("looks a holding without ticker up by name per account, and by its ISIN per month", async () => {
    resolveCurrentPrices.mockImplementation(async (requests: PriceRequest[]) => ({
      data: Object.fromEntries(
        requests.map((r) => [r.key, r.ticker === "Apple Inc" ? 999 : 200]),
      ),
    }));

    const result = await loadInvestmentValuation(
      context([lot({ isin: "US0378331005" })]),
      "USD",
      2026,
    );

    expect(resolveCurrentPrices.mock.calls[0][0]).toEqual([
      { key: "account:US0378331005", ticker: "Apple Inc", isin: "US0378331005", assetType: "stock" },
      { key: "month:US0378331005", ticker: null, isin: "US0378331005", assetType: "stock" },
    ]);
    expect(result).toEqual({
      data: {
        byAccount: { broker: { current: 2 * 999, cost: 300 } },
        byMonth: expect.objectContaining({
          3: { currentValue: 2 * 200, costBasis: 300 },
          12: { currentValue: 2 * 200, costBasis: 300 },
        }),
      },
    });
  });

  it("looks a crypto lot without ticker up by its coin code in both views", async () => {
    resolveCurrentPrices.mockImplementation(async (requests: PriceRequest[]) => ({
      data: Object.fromEntries(requests.map((r) => [r.key, 60_000])),
    }));

    await loadInvestmentValuation(
      context([lot({ asset_name: "BTC", asset_type: "crypto", quantity: 0.5, total_cost: 10_000 })]),
      "USD",
      2026,
    );

    expect(resolveCurrentPrices.mock.calls[0][0]).toEqual([
      { key: "account:BTC", ticker: "BTC", isin: null, assetType: "crypto" },
      { key: "month:BTC", ticker: "BTC", isin: null, assetType: "crypto" },
    ]);
  });

  it("only prices per account when no year is asked for", async () => {
    resolveCurrentPrices.mockResolvedValue({ data: {} });

    const result = await loadInvestmentValuation(context([lot({ ticker: "AAPL" })]), "USD", null);

    expect(resolveCurrentPrices.mock.calls[0][0]).toEqual([
      { key: "account:AAPL", ticker: "AAPL", isin: null, assetType: "stock" },
    ]);
    expect(result).toEqual({ data: { byAccount: { broker: { current: 300, cost: 300 } }, byMonth: null } });
  });
});
