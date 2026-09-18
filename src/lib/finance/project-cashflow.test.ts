import { describe, expect, it } from "vitest";

import { median, projectCashflow, type CashflowInput } from "./project-cashflow";

const base: CashflowInput = {
  today: "2026-09-17",
  monthsAhead: 3,
  balanceToday: 1000,
  recordedAhead: [],
  occurrences: [],
  plans: [],
  recordedByMonth: new Map(),
  history: new Map(),
};

describe("median", () => {
  it("takes the middle value, or the mean of the two middle ones", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("projectCashflow", () => {
  it("starts at today's balance and ends the current month first", () => {
    const months = projectCashflow(base);
    expect(months.map((m) => [m.year, m.month, m.balance])).toEqual([
      [2026, 9, 1000],
      [2026, 10, 1000],
      [2026, 11, 1000],
      [2026, 12, 1000],
    ]);
  });

  it("puts a yearly payment on its month instead of spreading it", () => {
    const months = projectCashflow({
      ...base,
      occurrences: [{ date: "2026-11-05", base: -1200, key: "insurance" }],
      history: new Map([["insurance", { income: false, amounts: [0, 0, 1200, 0] }]]),
    });
    expect(months.map((m) => m.balance)).toEqual([1000, 1000, -200, -200]);
    expect(months[2].sources).toEqual(["recurrentes"]);
  });

  it("counts this month's recurring dates, minus what the month already recorded, and what was recorded after today", () => {
    const months = projectCashflow({
      ...base,
      occurrences: [
        { date: "2026-09-01", base: -500, key: "rent" },
        { date: "2026-09-25", base: 3000, key: "salary" },
      ],
      // The rent was entered by hand, under another description.
      recordedByMonth: new Map([[202609, new Map([["rent", 500], ["groceries", 150]])]]),
      recordedAhead: [
        { date: "2026-09-20", base: -150, income: false },
        { date: "2026-09-21", base: -5, income: null },
      ],
    });
    expect(months[0]).toMatchObject({ income: 3000, expenses: 150, balance: 3845 });
    expect(months[0].sources.sort()).toEqual(["cargados", "recurrentes"]);
  });

  it("uses the plan when it is larger than the category's recurring dates, minus what the month already has", () => {
    const months = projectCashflow({
      ...base,
      plans: [
        { year: 2026, month: 9, key: "groceries", income: false, planned: 500 },
        { year: 2026, month: 10, key: "services", income: false, planned: 300 },
        { year: 2026, month: 10, key: "salary", income: true, planned: 3000 },
      ],
      occurrences: [
        { date: "2026-10-01", base: 2800, key: "salary" },
        { date: "2026-10-10", base: -30, key: "services" },
      ],
      recordedByMonth: new Map([[202609, new Map([["groceries", 350]])]]),
    });
    expect(months[0]).toMatchObject({ expenses: 150, balance: 850 });
    expect(months[1]).toMatchObject({ income: 3000, expenses: 300, balance: 3550, sources: ["presupuesto"] });
  });

  it("falls back to the median of closed months for the rest", () => {
    const months = projectCashflow({
      ...base,
      history: new Map([
        ["dining", { income: false, amounts: [100, 400, 200] }],
        ["freelance", { income: true, amounts: [0, 0, 900] }],
      ]),
      recordedByMonth: new Map([[202609, new Map([["dining", 250]])]]),
    });
    expect(months[0]).toMatchObject({ expenses: 0, balance: 1000, sources: [] });
    expect(months[1]).toMatchObject({ income: 0, expenses: 200, balance: 800, sources: ["historial"] });
  });
});
