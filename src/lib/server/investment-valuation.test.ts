import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PriceRequest } from "@/lib/asset-classes";
import { fakeSupabase } from "../../../tests/support/fake-supabase";

const resolvePricesWithSources = vi.fn();
vi.mock("@/lib/server/prices", () => ({
  resolvePricesWithSources: (...args: unknown[]) => resolvePricesWithSources(...args),
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

const priced = (prices: Record<string, number>, ratesToBase: Record<string, number> = { USD: 1 }) => ({
  data: {
    prices,
    manualDates: {},
    ratesToBase,
    rateDatesToBase: Object.fromEntries(Object.keys(ratesToBase).map((currency) => [currency, "2026-09-15"])),
  },
});

describe("loadInvestmentValuation", () => {
  beforeEach(() => {
    resolvePricesWithSources.mockReset();
  });

  it("asks once per lot lookup, the way the holdings table does", async () => {
    resolvePricesWithSources.mockResolvedValue(priced({ "stock:USD:|US0378331005": 200 }));

    const result = await loadInvestmentValuation(context([lot({ isin: "US0378331005" })]), "USD");

    expect(resolvePricesWithSources.mock.calls[0][0]).toEqual([
      {
        key: "stock:USD:|US0378331005",
        ticker: null,
        isin: "US0378331005",
        name: "Apple Inc",
        assetType: "stock",
        currency: "USD",
      },
    ]);
    expect(result).toEqual({
      data: { byAccount: { broker: { current: 2 * 200, cost: 300 } }, fxRateDate: null },
    });
  });

  it("values an unpriced lot at its cost in the base currency", async () => {
    resolvePricesWithSources.mockResolvedValue(priced({}, { USD: 1, EUR: 1.1 }));

    const result = await loadInvestmentValuation(
      context([lot({ ticker: "SAP", currency: "EUR", total_cost: 1000 })]),
      "USD",
    );

    expect(result).toEqual({ data: { byAccount: { broker: { current: 1100, cost: 1100 } }, fxRateDate: "2026-09-15" } });
  });

  it("converts a crypto lot's value and cost from its own currency", async () => {
    resolvePricesWithSources.mockResolvedValue(priced({ "crypto:EUR:BTC": 60_000 }, { EUR: 1.1 }));

    const result = await loadInvestmentValuation(
      context([lot({ asset_name: "BTC", asset_type: "crypto", currency: "EUR", quantity: 0.5, total_cost: 10_000 })]),
      "USD",
    );

    expect(result).toEqual({ data: { byAccount: { broker: { current: 33_000, cost: 11_000 } }, fxRateDate: "2026-09-15" } });
  });

  it("values cash held at the exchange rate, against what it cost", async () => {
    resolvePricesWithSources.mockResolvedValue(priced({ "cash:USD:EUR": 1.1 }));

    const result = await loadInvestmentValuation(
      context([lot({ asset_name: "Euros", ticker: "EUR", asset_type: "cash", quantity: 1000, total_cost: 1050 })]),
      "USD",
    );

    expect(result).toEqual({ data: { byAccount: { broker: { current: 1100, cost: 1050 } }, fxRateDate: null } });
  });

  it("prices the same code held against two currencies separately", async () => {
    resolvePricesWithSources.mockResolvedValue(
      priced({ "stablecoin:USD:USDT": 1, "stablecoin:EUR:USDT": 0.9 }, { USD: 1, EUR: 1.1 }),
    );

    const result = await loadInvestmentValuation(
      context([
        lot({ asset_name: "Tether", ticker: "USDT", asset_type: "stablecoin", quantity: 100, total_cost: 100 }),
        lot({
          account_id: "exchange",
          asset_name: "Tether",
          ticker: "USDT",
          asset_type: "stablecoin",
          currency: "EUR",
          quantity: 100,
          total_cost: 90,
        }),
      ]),
      "USD",
    );

    expect((resolvePricesWithSources.mock.calls[0][0] as PriceRequest[]).map((r) => r.key)).toEqual([
      "stablecoin:USD:USDT",
      "stablecoin:EUR:USDT",
    ]);
    expect(result).toEqual({
      data: {
        byAccount: {
          broker: { current: 100, cost: 100 },
          exchange: { current: expect.closeTo(99, 6), cost: expect.closeTo(99, 6) },
        },
        fxRateDate: "2026-09-15",
      },
    });
  });

  it("fails rather than mixing currencies when a lot's currency has no rate", async () => {
    resolvePricesWithSources.mockResolvedValue(priced({}, { USD: 1 }));

    const result = await loadInvestmentValuation(context([lot({ ticker: "SAP", currency: "EUR" })]), "USD");

    expect(result).toEqual({ error: "No hay tipo de cambio de EUR a USD" });
  });
});
