import { describe, expect, it } from "vitest";

import type { BudgetCategoryType } from "@/types/budget";
import type { OpeningBalance } from "@/types/months";
import type { TransactionType, TransactionWithRelations } from "@/types/transactions";

import { computePeriodSummary, type BalanceRates } from "./period-summary";

let nextId = 0;

function opening(account: string, amount: number, currency = "USD", base = amount): OpeningBalance {
  return {
    id: `ob-${account}`,
    month_id: "m9",
    account_id: account,
    opening_amount: amount,
    opening_base_amount: base,
    created_at: "2026-09-01T00:00:00Z",
    account_name: account,
    account_currency: currency,
    account_currency_symbol: currency === "USD" ? "US$" : currency,
  };
}

function tx(
  type: TransactionType,
  legs: { account: string; amount: number; base?: number; currency?: string; rateDate?: string }[],
  extra: { category?: { id: string; type: BudgetCategoryType }; fee?: number; date?: string } = {},
): TransactionWithRelations {
  const id = `t${(nextId += 1)}`;
  return {
    id,
    user_id: "u",
    month_id: "m9",
    category_id: extra.category?.id ?? null,
    transaction_type: type,
    date: extra.date ?? "2026-09-10",
    description: id,
    notes: null,
    fee: extra.fee ?? 0,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    category_name: extra.category?.id ?? null,
    category_type: extra.category?.type ?? null,
    amounts: legs.map((leg, i) => ({
      id: `${id}-${i}`,
      transaction_id: id,
      account_id: leg.account,
      amount: leg.amount,
      original_currency: leg.currency ?? "USD",
      exchange_rate: 1,
      base_amount: leg.base ?? leg.amount,
      created_at: "2026-09-10T00:00:00Z",
      account_name: leg.account,
      account_currency_symbol: "US$",
      current_rate_date: leg.rateDate,
    })),
  };
}

const usdOnly: BalanceRates = { openDate: "2026-08-31", closeDate: "2026-09-17", opening: {}, closing: {} };

function summarize(
  transactions: TransactionWithRelations[],
  openingBalances: OpeningBalance[],
  rates: BalanceRates = usdOnly,
) {
  return computePeriodSummary({ transactions, openingBalances, baseCurrency: "USD", rates, today: "2026-09-17" });
}

const groceries = { id: "groceries", type: "essential_expenses" as const };
const salary = { id: "salary", type: "income" as const };

describe("computePeriodSummary", () => {
  it("closes a transfer with a fee at what the accounts hold, the fee as another movement", () => {
    const { summary, accountBalances } = summarize(
      [tx("transfer", [{ account: "A", amount: -105 }, { account: "B", amount: 100 }], { fee: 5 })],
      [opening("A", 1000)],
    );

    expect(summary.closingBase).toBe(995);
    expect(summary.netMonth).toBe(0);
    expect(summary.other.transferFees).toBe(-5);
    expect(summary.other.transferFx).toBe(0);
    expect(summary.ties).toBe(true);
    expect(accountBalances.map((a) => [a.name, a.closing])).toEqual([
      ["A", 895],
      ["B", 100],
    ]);
  });

  it("adds up: opening + income − expenses + other movements = closing", () => {
    const { summary } = summarize(
      [
        tx("income", [{ account: "A", amount: 2000 }], { category: salary }),
        tx("expense", [{ account: "A", amount: -300 }], { category: groceries }),
        tx("expense", [{ account: "A", amount: -40 }]),
        tx("investment", [{ account: "A", amount: -500 }]),
        tx("correction", [{ account: "A", amount: 12 }]),
      ],
      [opening("A", 1000)],
    );

    expect(summary.income).toBe(2000);
    expect(summary.essentialExpenses).toBe(300);
    expect(summary.uncategorizedExpenses).toBe(40);
    expect(summary.totalExpenses).toBe(340);
    expect(summary.netMonth).toBe(1660);
    expect(summary.other).toMatchObject({ investments: -500, corrections: 12, total: -488 });
    expect(summary.closingBase).toBe(2172);
    expect(summary.openingBase + summary.netMonth + summary.other.total).toBe(summary.closingBase);
  });

  // The same movements and figures as supabase/tests/budget_period_summary_parity_test.sql:
  // change both together.
  it("matches the budget's actual per category", () => {
    const fun = { id: "Parity fun", type: "discretionary_expenses" as const };
    const { summary } = summarize(
      [
        tx("income", [{ account: "Banco", amount: 2000 }], { category: { id: "Parity salary", type: "income" } }),
        tx("expense", [{ account: "Banco", amount: -300 }], { category: { id: "Parity groceries", type: "essential_expenses" } }),
        tx("income", [{ account: "Banco", amount: 30 }], { category: { id: "Parity groceries", type: "essential_expenses" } }),
        tx("expense", [{ account: "Caja", amount: -120 }], { category: fun }),
        tx("expense", [{ account: "Banco", amount: -40 }]),
        tx("transfer", [{ account: "Banco", amount: -105 }, { account: "Caja", amount: 100 }], { fee: 5 }),
        tx("correction", [{ account: "Banco", amount: -10 }], { category: { id: "Parity groceries", type: "essential_expenses" } }),
        tx("correction", [{ account: "Banco", amount: 7 }]),
        // Valued at the day's rate, 1.2 (the stored base was at 1.05).
        tx("expense", [{ account: "Euros", amount: -10, base: -12, currency: "EUR" }], { category: fun }),
      ],
      [opening("Banco", 1000), opening("Caja", 0)],
    );

    expect(
      summary.categoryBreakdown
        .map((c) => [c.categoryName, c.amount])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    ).toEqual([
      ["Parity fun", 132],
      ["Parity groceries", 280],
      ["Parity salary", 2000],
    ]);
    expect(summary.other.corrections).toBe(7);
    expect(summary.ties).toBe(true);
  });

  it("lowers a category's spending with a refund, like the budget", () => {
    const { summary } = summarize(
      [
        tx("expense", [{ account: "A", amount: -100 }], { category: groceries }),
        tx("income", [{ account: "A", amount: 30 }], { category: groceries }),
      ],
      [opening("A", 0)],
    );

    expect(summary.essentialExpenses).toBe(70);
    expect(summary.income).toBe(0);
    expect(summary.categoryBreakdown).toEqual([
      { categoryId: "groceries", categoryName: "groceries", categoryType: "essential_expenses", amount: 70 },
    ]);
  });

  it("values a balance in another currency at the opening and closing rates, the difference as revaluation", () => {
    const { summary } = summarize([], [opening("Pesos", 1_000_000, "ARS", 1000)], {
      openDate: "2026-08-31",
      closeDate: "2026-09-17",
      opening: { ARS: 1 / 1000 },
      closing: { ARS: { rate: 1 / 1300, rateDate: "2026-09-17" } },
    });

    expect(summary.openingBase).toBeCloseTo(1000);
    expect(summary.closingBase).toBeCloseTo(769.23);
    expect(summary.other.revaluation).toBeCloseTo(-230.77);
    expect(summary.ties).toBe(true);
    expect(summary.fxMissing).toBe(0);
    expect(summary.closingRateDate).toBeNull();
  });

  it("keeps the stored opening and the movements' values when a currency has no rate, and says so", () => {
    const { summary } = summarize(
      [tx("expense", [{ account: "Pesos", amount: -10_000, base: -8, currency: "ARS" }], { category: groceries })],
      [opening("Pesos", 1_000_000, "ARS", 950)],
      { openDate: "2026-08-31", closeDate: "2026-09-17", opening: { ARS: null }, closing: { ARS: null } },
    );

    expect(summary.openingBase).toBe(950);
    expect(summary.closingBase).toBe(942);
    expect(summary.other.revaluation).toBe(0);
    expect(summary.fxMissing).toBe(1);
  });

  it("reports a closing rate quoted before the close date", () => {
    const { summary } = summarize([], [opening("Euros", 100, "EUR", 110)], {
      openDate: "2026-08-31",
      closeDate: "2026-09-17",
      opening: { EUR: 1.1 },
      closing: { EUR: { rate: 1.2, rateDate: "2026-09-14" } },
    });

    expect(summary.closingBase).toBeCloseTo(120);
    expect(summary.closingRateDate).toBe("2026-09-14");
  });

  it("does not tie when an expense has a leg no line counts", () => {
    const { summary } = summarize(
      [tx("expense", [{ account: "A", amount: -50 }, { account: "B", amount: -20 }], { category: groceries })],
      [opening("A", 100), opening("B", 100)],
    );

    expect(summary.ties).toBe(false);
    expect(summary.unexplained).toBe(-20);
  });

  it("counts movements valued at a rate older than their date", () => {
    const { summary } = summarize(
      [
        tx("expense", [{ account: "A", amount: -1, rateDate: "2026-09-08" }], { date: "2026-09-10" }),
        tx("expense", [{ account: "A", amount: -1, rateDate: "2026-09-17" }], { date: "2026-09-30" }),
      ],
      [opening("A", 10)],
    );

    expect(summary.olderRates).toBe(1);
  });
});
