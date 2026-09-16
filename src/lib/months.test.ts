import { describe, expect, it } from "vitest";

import { defaultMonth } from "./months";

const month = (year: number, m: number) => ({ id: `${year}-${m}`, year, month: m });

describe("defaultMonth", () => {
  it("opens the current month over a later one", () => {
    const months = [month(2026, 10), month(2026, 9), month(2026, 8)];
    expect(defaultMonth(months, { year: 2026, month: 9 })?.id).toBe("2026-9");
  });

  it("falls back to the latest month before the current one", () => {
    const months = [month(2026, 11), month(2026, 7), month(2026, 6)];
    expect(defaultMonth(months, { year: 2026, month: 9 })?.id).toBe("2026-7");
  });

  it("takes the nearest month when every month is ahead", () => {
    const months = [month(2027, 2), month(2026, 12)];
    expect(defaultMonth(months, { year: 2026, month: 9 })?.id).toBe("2026-12");
  });

  it("has no default without months", () => {
    expect(defaultMonth([], { year: 2026, month: 9 })).toBeNull();
  });
});
