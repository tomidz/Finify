import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { getExpectedDatesInMonth, toMonthlyAmount } from "./recurrence";

const local = (iso: string) => new Date(`${iso}T00:00:00`);
const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

describe("getExpectedDatesInMonth", () => {
  it.each([
    ["monthly on its day", "monthly", 15, null, 2026, 3, "2026-01-15", ["2026-03-15"]],
    ["monthly clamps to the last day", "monthly", 31, null, 2026, 2, "2026-01-31", ["2026-02-28"]],
    ["monthly without a day uses the start day", "monthly", null, null, 2024, 2, "2024-01-30", ["2024-02-29"]],
    ["weekly on every matching weekday", "weekly", null, 1, 2026, 6, "2026-01-05", ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"]],
    ["biweekly from its start date", "biweekly", null, null, 2026, 2, "2026-01-02", ["2026-02-13", "2026-02-27"]],
    ["quarterly in a month three apart from the start", "quarterly", 10, null, 2026, 2, "2025-11-10", ["2026-02-10"]],
    ["quarterly skips other months", "quarterly", 10, null, 2026, 3, "2025-11-10", []],
    ["yearly in the start month", "yearly", 20, null, 2027, 7, "2025-07-20", ["2027-07-20"]],
    ["yearly skips other months", "yearly", 20, null, 2027, 8, "2025-07-20", []],
    ["unknown recurrence", "daily", 1, null, 2026, 1, "2026-01-01", []],
  ])("%s", (_label, recurrence, dayOfMonth, dayOfWeek, year, month, start, expected) => {
    expect(getExpectedDatesInMonth(recurrence, dayOfMonth, dayOfWeek, year, month, local(start))).toEqual(expected);
  });

  it("biweekly dates are 14 days apart across month boundaries, starting on the start date", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date(2020, 0, 1), max: new Date(2030, 11, 31), noInvalidDate: true }), (raw) => {
        const start = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
        const dates: string[] = [];
        for (let i = 0; i < 14; i++) {
          const monthStart = new Date(start.getFullYear(), start.getMonth() + i, 1);
          dates.push(
            ...getExpectedDatesInMonth("biweekly", null, null, monthStart.getFullYear(), monthStart.getMonth() + 1, start),
          );
        }
        const startIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
        expect(dates[0]).toBe(startIso);
        for (let i = 1; i < dates.length; i++) {
          expect(dayNumber(dates[i]) - dayNumber(dates[i - 1])).toBe(14);
        }
      }),
    );
  });

  it("weekly dates all fall on the weekday, four or five times a month", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2000, max: 2100 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 0, max: 6 }), (year, month, dow) => {
        const dates = getExpectedDatesInMonth("weekly", null, dow, year, month, new Date(year, 0, 1));
        expect(dates.length === 4 || dates.length === 5).toBe(true);
        for (const iso of dates) expect(local(iso).getDay()).toBe(dow);
      }),
    );
  });
});

describe("toMonthlyAmount", () => {
  it("twelve monthly amounts add up to a year of the recurrence", () => {
    const perYear: Record<string, number> = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, yearly: 1 };
    fc.assert(
      fc.property(fc.constantFrom(...Object.keys(perYear)), fc.double({ min: -1e7, max: 1e7, noNaN: true }), (recurrence, amount) => {
        expect(toMonthlyAmount(amount, recurrence) * 12).toBeCloseTo(amount * perYear[recurrence], 4);
      }),
    );
  });

  it("leaves unknown recurrences unchanged", () => {
    expect(toMonthlyAmount(99, "daily")).toBe(99);
  });
});
