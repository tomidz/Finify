import { describe, expect, it } from "vitest";

import { addDays, currentYearMonth, today } from "./dates";

describe("today", () => {
  it("is still the last day of the month at 22:00 in Buenos Aires", () => {
    const lateOnAugust31 = new Date("2026-09-01T01:00:00Z");
    expect(today(lateOnAugust31)).toBe("2026-08-31");
    expect(currentYearMonth(lateOnAugust31)).toEqual({ year: 2026, month: 8 });
  });

  it("turns at midnight in Buenos Aires", () => {
    expect(today(new Date("2026-09-01T03:00:00Z"))).toBe("2026-09-01");
  });
});

describe("addDays", () => {
  it("crosses months and years both ways", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addDays("2026-01-02", -3)).toBe("2025-12-30");
  });
});
