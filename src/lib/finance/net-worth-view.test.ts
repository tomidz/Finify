import { describe, expect, it } from "vitest";

import type {
  AccountNetWorthSummary,
  LiabilitiesSummary,
  NetWorthEvolutionPoint,
} from "@/types/net-worth";

import { buildNetWorthView, type NetWorthView } from "./net-worth-view";

type AccountRow = AccountNetWorthSummary["accounts"][number];

const TODAY = "2026-09-17";

function account(overrides: Partial<AccountRow> & Pick<AccountRow, "id">): AccountRow {
  return {
    name: overrides.id,
    account_type: "bank",
    currency: "USD",
    currency_symbol: "US$",
    is_active: true,
    balance: 0,
    balance_base: 0,
    balance_book_base: 0,
    balance_fx_missing: false,
    balance_fx_rate_date: null,
    investment_value: 0,
    investment_value_base: 0,
    investment_fx_rate_date: null,
    ...overrides,
  };
}

/*
 * What the RPCs return for a close: the evolution's last point is the listed
 * accounts' total minus the debts, at the same rates.
 */
function screen(closeDate: string, rows: AccountRow[], previous: NetWorthEvolutionPoint) {
  const total = rows.reduce((sum, row) => sum + row.balance_base + (row.investment_value_base ?? 0), 0);
  const accounts: AccountNetWorthSummary = {
    year: Number(closeDate.slice(0, 4)),
    month: Number(closeDate.slice(5, 7)),
    close_date: closeDate,
    total,
    accounts: rows,
  };
  const liabilities: LiabilitiesSummary = {
    year: accounts.year,
    close_date: closeDate,
    total: 110,
    items: [
      {
        item_id: "loan",
        name: "Préstamo",
        currency: "EUR",
        currency_symbol: "€",
        amount: 100,
        amount_base: 110,
        fx_rate_date: closeDate,
      },
    ],
  };
  const evolution: NetWorthEvolutionPoint[] = [
    previous,
    {
      month: accounts.month,
      closeDate,
      assets: total,
      liabilities: 110,
      netWorth: total - 110,
      fxMissing: rows.some((row) => row.investment_value_base === null),
      cashFxMissing: rows.some((row) => row.balance_fx_missing),
    },
  ];
  return { accounts, liabilities, evolution };
}

const currentMonth = () =>
  screen(
    TODAY,
    [
      // 1,000,000 pesos loaded at 1000 per dollar, worth 1300 per dollar today.
      account({
        id: "pesos",
        currency: "ARS",
        balance: 1_000_000,
        balance_base: 1_000_000 / 1300,
        balance_book_base: 1000,
        balance_fx_rate_date: TODAY,
      }),
      account({
        id: "broker",
        account_type: "investment_broker",
        balance: 100,
        balance_base: 100,
        balance_book_base: 100,
        investment_value: 200,
        investment_value_base: 220,
        investment_fx_rate_date: "2026-09-16",
      }),
      account({
        id: "euros",
        currency: "EUR",
        is_active: false,
        balance: 50,
        balance_base: 55,
        balance_book_base: 52,
        balance_fx_rate_date: TODAY,
      }),
    ],
    { month: 8, closeDate: "2026-08-31", assets: 1000, liabilities: 100, netWorth: 900, fxMissing: false, cashFxMissing: false },
  );

const lastPoint = (view: NetWorthView) => view.evolution[view.evolution.length - 1];

describe("buildNetWorthView", () => {
  it("keeps positions at cost without a valuation, and the last point is the net worth", () => {
    const view = buildNetWorthView({ ...currentMonth(), valuation: undefined, today: TODAY });

    expect(view.marketValued).toBe(false);
    expect(view.totalAssets).toBeCloseTo(1_000_000 / 1300 + 100 + 220 + 55, 6);
    expect(view.netWorth).toBeCloseTo(view.totalAssets - 110, 6);
    expect(lastPoint(view).netWorth).toBeCloseTo(view.netWorth, 6);
    expect(lastPoint(view).assets).toBeCloseTo(view.totalAssets, 6);
  });

  it("values positions at market for a period that closes today, and moves only today's point", () => {
    const view = buildNetWorthView({
      ...currentMonth(),
      valuation: { byAccount: { broker: { current: 300 } }, fxRateDate: "2026-09-15" },
      today: TODAY,
    });

    expect(view.marketValued).toBe(true);
    expect(view.accounts.find((a) => a.id === "broker")).toMatchObject({ investment_value_base: 300, total: 400 });
    expect(view.totalAssets).toBeCloseTo(1_000_000 / 1300 + 100 + 300 + 55, 6);
    expect(lastPoint(view).netWorth).toBeCloseTo(view.netWorth, 6);
    expect(lastPoint(view).assets).toBeCloseTo(view.totalAssets, 6);
    expect(view.evolution[0]).toEqual({
      month: 8,
      closeDate: "2026-08-31",
      assets: 1000,
      liabilities: 100,
      netWorth: 900,
      fxMissing: false,
      cashFxMissing: false,
    });
    // The valuation's rate replaces the positions' rate at cost.
    expect(view.fxRateDate).toBe("2026-09-15");
  });

  it("keeps positions at cost for a past close, even with a valuation", () => {
    const close = "2025-12-31";
    const past = screen(
      close,
      [
        account({
          id: "pesos",
          currency: "ARS",
          balance: 1_000_000,
          balance_base: 800,
          balance_book_base: 1000,
          balance_fx_rate_date: "2025-12-30",
        }),
        account({
          id: "broker",
          account_type: "investment_broker",
          investment_value: 200,
          investment_value_base: 210,
          investment_fx_rate_date: close,
        }),
      ],
      { month: 11, closeDate: "2025-11-30", assets: 900, liabilities: 100, netWorth: 800, fxMissing: false, cashFxMissing: false },
    );

    const view = buildNetWorthView({
      ...past,
      valuation: { byAccount: { broker: { current: 999 } }, fxRateDate: TODAY },
      today: TODAY,
    });

    expect(view.marketValued).toBe(false);
    expect(view.totalAssets).toBe(1010);
    expect(view.netWorth).toBe(900);
    expect(lastPoint(view)).toMatchObject({ assets: 1010, netWorth: 900 });
    expect(view.fxRateDate).toBe("2025-12-30");
    expect(view.fxRevaluation).toBe(-200);
  });

  it("keeps a balance without a rate at its stored base, out of the revaluation, and marks it", () => {
    const data = screen(
      TODAY,
      [
        account({
          id: "tether",
          currency: "USDT",
          balance: 5000,
          balance_base: 4990,
          balance_book_base: 4990,
          balance_fx_missing: true,
        }),
        account({ id: "dollars", balance: 40, balance_base: 40, balance_book_base: 40 }),
      ],
      { month: 8, closeDate: "2026-08-31", assets: 40, liabilities: 110, netWorth: -70, fxMissing: false, cashFxMissing: false },
    );

    const view = buildNetWorthView({ ...data, valuation: undefined, today: TODAY });

    expect(view.totalAssets).toBe(5030);
    expect(view.cashAtBookValue).toBe(true);
    expect(view.fxMissing).toBe(false);
    expect(view.fxRevaluation).toBe(0);
    expect(lastPoint(view)).toMatchObject({ netWorth: view.netWorth, fxMissing: false, cashFxMissing: true });
  });

  it("marks what an earlier month of the chart leaves out", () => {
    const data = screen(TODAY, [account({ id: "dollars", balance: 40, balance_base: 40, balance_book_base: 40 })], {
      month: 3,
      closeDate: "2026-03-31",
      assets: 40,
      liabilities: 0,
      netWorth: 40,
      fxMissing: true,
      cashFxMissing: false,
    });

    expect(buildNetWorthView({ ...data, valuation: undefined, today: TODAY }).fxMissing).toBe(true);
  });

  it("adds up what the close rate changes over the stored base amounts", () => {
    const view = buildNetWorthView({ ...currentMonth(), valuation: undefined, today: TODAY });

    expect(view.fxRevaluation).toBeCloseTo(1_000_000 / 1300 - 1000 + (55 - 52), 6);
  });

  it("groups accounts by type with their totals, inactive ones included", () => {
    const view = buildNetWorthView({ ...currentMonth(), valuation: undefined, today: TODAY });

    expect(view.groups.map((group) => [group.label, group.accounts.map((a) => a.id)])).toEqual([
      ["Banco", ["pesos", "euros"]],
      ["Broker de inversiones", ["broker"]],
    ]);
    expect(view.groups[0].total).toBeCloseTo(1_000_000 / 1300 + 55, 6);
  });

  it("shows no rate date when every rate is the close date's", () => {
    const data = screen(
      TODAY,
      [account({ id: "euros", currency: "EUR", balance: 50, balance_base: 55, balance_book_base: 52, balance_fx_rate_date: TODAY })],
      { month: 8, closeDate: "2026-08-31", assets: 0, liabilities: 0, netWorth: 0, fxMissing: false, cashFxMissing: false },
    );

    expect(buildNetWorthView({ ...data, valuation: undefined, today: TODAY }).fxRateDate).toBeNull();
  });
});
