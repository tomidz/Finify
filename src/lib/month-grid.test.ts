import { describe, expect, it } from "vitest";

import {
  adjacentMonth,
  adjacentYear,
  calendarMonths,
  initialGridYear,
  monthGridCells,
  monthKey,
  monthLabel,
  monthYears,
  orderRange,
  rangeLabel,
  rangePresets,
  sortMonths,
} from "./month-grid";

const month = (year: number, m: number) => ({ id: `${year}-${m}`, year, month: m });
const current = { year: 2026, month: 9 };

// Newest first, like getMonths returns them, with a gap in 2026-05.
const months = [month(2026, 10), month(2026, 9), month(2026, 6), month(2026, 4), month(2025, 11)];

describe("labels", () => {
  it("names a month in full", () => {
    expect(monthLabel({ year: 2026, month: 9 })).toBe("Septiembre 2026");
  });

  it("shares the year inside one year and names both across years", () => {
    expect(rangeLabel({ year: 2026, month: 1 }, { year: 2026, month: 9 })).toBe("Ene – Sep 2026");
    expect(rangeLabel({ year: 2025, month: 11 }, { year: 2026, month: 2 })).toBe("Nov 2025 – Feb 2026");
  });

  it("orders a reversed range and collapses a single month", () => {
    expect(rangeLabel({ year: 2026, month: 9 }, { year: 2026, month: 1 })).toBe("Ene – Sep 2026");
    expect(rangeLabel({ year: 2026, month: 9 }, { year: 2026, month: 9 })).toBe("Septiembre 2026");
  });
});

describe("sortMonths / monthYears", () => {
  it("sorts oldest first and lists the years with months", () => {
    expect(sortMonths(months).map((m) => m.id)).toEqual(["2025-11", "2026-4", "2026-6", "2026-9", "2026-10"]);
    expect(monthYears(months)).toEqual([2025, 2026]);
  });
});

describe("adjacentMonth", () => {
  it("skips months that do not exist", () => {
    expect(adjacentMonth(months, "2026-6", -1)?.id).toBe("2026-4");
    expect(adjacentMonth(months, "2026-6", 1)?.id).toBe("2026-9");
    expect(adjacentMonth(months, "2026-4", -1)?.id).toBe("2025-11");
  });

  it("stops at both ends", () => {
    expect(adjacentMonth(months, "2025-11", -1)).toBeNull();
    expect(adjacentMonth(months, "2026-10", 1)).toBeNull();
  });

  it("has no neighbour for an unknown or missing value", () => {
    expect(adjacentMonth(months, "nope", 1)).toBeNull();
    expect(adjacentMonth(months, null, -1)).toBeNull();
  });
});

describe("adjacentYear", () => {
  it("jumps over years without months", () => {
    expect(adjacentYear([2022, 2025, 2026], 2025, -1)).toBe(2022);
    expect(adjacentYear([2022, 2025, 2026], 2025, 1)).toBe(2026);
    expect(adjacentYear([2022, 2025, 2026], 2026, 1)).toBeNull();
    expect(adjacentYear([2022, 2025, 2026], 2022, -1)).toBeNull();
  });

  it("works from a year that has no months", () => {
    expect(adjacentYear([2022, 2026], 2024, -1)).toBe(2022);
    expect(adjacentYear([2022, 2026], 2024, 1)).toBe(2026);
  });
});

describe("initialGridYear", () => {
  it("opens on the selected month's year", () => {
    expect(initialGridYear(months, "2025-11", current)).toBe(2025);
  });

  it("falls back to the current year, else the latest year with months", () => {
    expect(initialGridYear(months, null, current)).toBe(2026);
    expect(initialGridYear([month(2023, 5), month(2024, 2)], null, current)).toBe(2024);
    expect(initialGridYear([], null, current)).toBe(2026);
  });
});

describe("monthGridCells", () => {
  it("gives 12 cells, disabled where the user has no month", () => {
    const cells = monthGridCells(months, 2026, { current });
    expect(cells).toHaveLength(12);
    expect(cells.map((c) => c.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(cells.filter((c) => c.option).map((c) => c.option?.id)).toEqual(["2026-4", "2026-6", "2026-9", "2026-10"]);
    expect(cells[4].option).toBeNull();
  });

  it("marks the current calendar month only in its year", () => {
    expect(monthGridCells(months, 2026, { current }).filter((c) => c.isCurrent).map((c) => c.month)).toEqual([9]);
    expect(monthGridCells(months, 2025, { current }).some((c) => c.isCurrent)).toBe(false);
  });

  it("marks a single selected month as the only endpoint", () => {
    const cells = monthGridCells(months, 2026, { start: "2026-6", current });
    expect(cells.filter((c) => c.isEndpoint).map((c) => c.month)).toEqual([6]);
    expect(cells.some((c) => c.isInRange)).toBe(false);
  });

  it("fills a range in either order, gaps included", () => {
    const cells = monthGridCells(months, 2026, { start: "2026-9", end: "2026-4", current });
    expect(cells.filter((c) => c.isEndpoint).map((c) => c.month)).toEqual([4, 9]);
    expect(cells.filter((c) => c.isInRange).map((c) => c.month)).toEqual([5, 6, 7, 8]);
  });

  it("fills the part of a range that falls in the shown year", () => {
    const cells = monthGridCells(months, 2025, { start: "2025-11", end: "2026-6", current });
    expect(cells.filter((c) => c.isEndpoint).map((c) => c.month)).toEqual([11]);
    expect(cells.filter((c) => c.isInRange).map((c) => c.month)).toEqual([12]);
  });

  it("ignores an unknown id", () => {
    expect(monthGridCells(months, 2026, { start: "nope", current }).some((c) => c.isEndpoint)).toBe(false);
    const onlyEnd = monthGridCells(months, 2026, { start: "nope", end: "2026-6", current });
    expect(onlyEnd.filter((c) => c.isEndpoint).map((c) => c.month)).toEqual([6]);
  });
});

describe("orderRange", () => {
  it("swaps an end before its start", () => {
    expect(orderRange(months, "2026-9", "2026-4")).toEqual(["2026-4", "2026-9"]);
    expect(orderRange(months, "2026-4", "2026-9")).toEqual(["2026-4", "2026-9"]);
    expect(orderRange(months, "2026-6", "2026-6")).toEqual(["2026-6", "2026-6"]);
  });
});

describe("rangePresets", () => {
  it("clamps each window to the months that exist", () => {
    const presets = rangePresets(months, current);
    expect(presets.map((p) => [p.key, p.start.id, p.end.id])).toEqual([
      ["month", "2026-9", "2026-9"],
      ["quarter", "2026-9", "2026-9"],
      ["year", "2026-4", "2026-10"],
      ["last-year", "2025-11", "2025-11"],
    ]);
  });

  it("leaves out windows without months", () => {
    const presets = rangePresets([month(2026, 4), month(2026, 6)], current);
    expect(presets.map((p) => p.key)).toEqual(["year"]);
    expect(rangePresets([], current)).toEqual([]);
  });

  it("finds the quarter of the current month", () => {
    const all = calendarMonths({ year: 2026, month: 1 }, { year: 2026, month: 12 });
    const quarter = rangePresets(all, { year: 2026, month: 12 }).find((p) => p.key === "quarter");
    expect([quarter?.start.month, quarter?.end.month]).toEqual([10, 12]);
  });
});

describe("calendarMonths", () => {
  it("lists every month across a year boundary with monthKey ids", () => {
    expect(calendarMonths({ year: 2025, month: 11 }, { year: 2026, month: 2 }).map((m) => m.id)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(monthKey({ year: 2026, month: 3 })).toBe("2026-03");
  });

  it("is empty when the range is reversed", () => {
    expect(calendarMonths({ year: 2026, month: 2 }, { year: 2025, month: 11 })).toEqual([]);
  });
});
