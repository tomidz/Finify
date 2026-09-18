import { describe, expect, it } from "vitest";

import type { TransactionType, TransactionWithRelations } from "@/types/transactions";

import {
  categoryKeyOf,
  closedMonthsHistory,
  forecastFlow,
  INVESTMENTS_KEY,
  recordedAhead,
  recordedByMonth,
} from "./forecast-inputs";

let nextId = 0;

function tx(
  type: TransactionType,
  date: string,
  legs: number[],
  extra: {
    category?: { id: string; type: "income" | "essential_expenses" | "investments" };
    recurringId?: string;
    occurrenceDate?: string;
  } = {},
): TransactionWithRelations {
  const id = `t${(nextId += 1)}`;
  return {
    id,
    user_id: "u",
    month_id: "m",
    category_id: extra.category?.id ?? null,
    recurring_id: extra.recurringId ?? null,
    occurrence_date: extra.occurrenceDate ?? null,
    transaction_type: type,
    date,
    description: id,
    notes: null,
    fee: 0,
    created_at: `${date}T00:00:00Z`,
    updated_at: `${date}T00:00:00Z`,
    category_name: extra.category?.id ?? null,
    category_type: extra.category?.type ?? null,
    amounts: legs.map((amount, i) => ({
      id: `${id}-${i}`,
      transaction_id: id,
      account_id: "a",
      amount,
      original_currency: "USD",
      exchange_rate: 1,
      base_amount: amount,
      created_at: `${date}T00:00:00Z`,
      account_name: "a",
      account_currency_symbol: "US$",
    })),
  };
}

const keyOf = categoryKeyOf(new Map([["etf", "investments"], ["rent", "essential_expenses"]]));
const rent = { id: "rent", type: "essential_expenses" as const };
const templates = new Map([["r1", { category_id: "rent", type: "expense" }]]);

describe("forecastFlow", () => {
  it("counts investment categories and the module's purchases as one line, and a sale as nothing bought", () => {
    expect(forecastFlow(tx("expense", "2026-09-05", [-50], { category: { id: "etf", type: "investments" } }), keyOf))
      .toEqual({ key: INVESTMENTS_KEY, income: false, amount: 50 });
    expect(forecastFlow(tx("investment", "2026-09-05", [-100]), keyOf)).toEqual({ key: INVESTMENTS_KEY, income: false, amount: 100 });
    expect(forecastFlow(tx("investment", "2026-09-06", [500]), keyOf)).toEqual({ key: INVESTMENTS_KEY, income: false, amount: 0 });
  });
});

describe("recordedByMonth", () => {
  const recorded = (transactions: TransactionWithRelations[]) =>
    recordedByMonth({ transactions, templates, keyOf, currentCode: 202609 });

  it("keeps a month's purchases when a larger sale follows them", () => {
    const byMonth = recorded([tx("investment", "2026-09-05", [-100]), tx("investment", "2026-09-06", [500])]);
    expect(byMonth.get(202609)?.get(INVESTMENTS_KEY)).toBe(100);
  });

  it("counts a recurring date paid early against its own month", () => {
    const byMonth = recorded([
      tx("expense", "2026-09-29", [-500], { category: rent, recurringId: "r1", occurrenceDate: "2026-10-01" }),
    ]);
    expect(byMonth.get(202609)?.get("rent")).toBeUndefined();
    expect(byMonth.get(202610)?.get("rent")).toBe(500);
  });

  it("does not let a late payment for a past date cover this month's", () => {
    const byMonth = recorded([
      tx("expense", "2026-09-02", [-500], { category: rent, recurringId: "r1", occurrenceDate: "2026-08-31" }),
    ]);
    expect(byMonth.get(202609)?.get("rent")).toBeUndefined();
  });

  it("counts a registered transaction under its template's category even if moved to another one", () => {
    const byMonth = recorded([
      tx("expense", "2026-09-01", [-500], {
        category: { id: "other", type: "essential_expenses" },
        recurringId: "r1",
        occurrenceDate: "2026-09-01",
      }),
    ]);
    expect(byMonth.get(202609)?.get("rent")).toBe(500);
    expect(byMonth.get(202609)?.get("other")).toBeUndefined();
  });
});

describe("recordedAhead", () => {
  it("keeps only what is dated after today, other movements apart", () => {
    expect(
      recordedAhead(
        [tx("expense", "2026-09-17", [-10]), tx("expense", "2026-09-20", [-20]), tx("transfer", "2026-09-21", [-5, 4])],
        "2026-09-17",
      ),
    ).toEqual([
      { date: "2026-09-20", base: -20, income: false },
      { date: "2026-09-21", base: -1, income: null },
    ]);
  });
});

describe("closedMonthsHistory", () => {
  it("lines each key's amounts up with the closed months, zero where it had none", () => {
    const history = closedMonthsHistory(
      [tx("expense", "2026-08-10", [-30], { category: rent }), tx("expense", "2026-06-10", [-10], { category: rent })],
      [202608, 202607, 202606],
      keyOf,
    );
    expect(history.get("rent")).toEqual({ income: false, amounts: [30, 0, 10] });
  });
});
