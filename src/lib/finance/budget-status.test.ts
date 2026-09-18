import { describe, expect, it } from "vitest";

import {
  budgetExecution,
  budgetTotalsByGroup,
  categoryExecution,
  remainingPlannedExpenses,
} from "./budget-status";

describe("budgetExecution", () => {
  it("keeps an expense within its plan favorable, near the limit on watch, and over it unfavorable", () => {
    expect(budgetExecution("expenses", 100, 50).status).toBe("favorable");
    expect(budgetExecution("expenses", 100, 90).status).toBe("favorable");
    expect(budgetExecution("expenses", 100, 95).status).toBe("watch");
    expect(budgetExecution("expenses", 100, 100).status).toBe("watch");
    expect(budgetExecution("expenses", 100, 101).status).toBe("unfavorable");
  });

  it("wants income, savings and investments at or over the plan", () => {
    expect(budgetExecution("income", 1000, 1000).status).toBe("favorable");
    expect(budgetExecution("savings", 1000, 850).status).toBe("watch");
    expect(budgetExecution("investments", 1000, 500).status).toBe("unfavorable");
  });

  it("signs the variance so that positive is favorable", () => {
    expect(budgetExecution("expenses", 100, 80).favorableVariance).toBe(20);
    expect(budgetExecution("income", 100, 80).favorableVariance).toBe(-20);
  });

  it("has no percent and no verdict without a plan", () => {
    expect(budgetExecution("expenses", 0, 40)).toEqual({
      planned: 0,
      actual: 40,
      favorableVariance: -40,
      percent: null,
      status: "no-plan",
    });
  });
});

describe("budget by category", () => {
  const categories = [
    { category_type: "income" as const, planned_amount: 3000, actual_amount: 3200 },
    { category_type: "essential_expenses" as const, planned_amount: 1000, actual_amount: 900 },
    { category_type: "discretionary_expenses" as const, planned_amount: 500, actual_amount: 700 },
    { category_type: "debt_payments" as const, planned_amount: 200, actual_amount: 0 },
    { category_type: "savings" as const, planned_amount: 400, actual_amount: 400 },
  ];

  it("totals each group apart", () => {
    const totals = budgetTotalsByGroup(categories);
    expect(totals.income).toMatchObject({ planned: 3000, actual: 3200, status: "favorable" });
    expect(totals.expenses).toMatchObject({ planned: 1700, actual: 1600, favorableVariance: 100, status: "watch" });
    expect(totals.savings).toMatchObject({ planned: 400, actual: 400 });
    expect(totals.investments.status).toBe("no-plan");
  });

  it("leaves only the unspent part of each expense plan pending", () => {
    expect(remainingPlannedExpenses(categories)).toBe(100 + 200);
  });

  it("judges a category by its type", () => {
    expect(categoryExecution(categories[2]).status).toBe("unfavorable");
  });
});
