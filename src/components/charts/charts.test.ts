import { describe, expect, it } from "vitest";

import { BUDGET_CATEGORY_TYPES } from "@/types/budget";

import { formatCompactAmount } from "./axis";
import { CATEGORY_TYPE_COLORS, CHART_SERIES, seriesColor } from "./palette";

describe("formatCompactAmount", () => {
  it("keeps small values and abbreviates thousands and millions", () => {
    expect(formatCompactAmount(0)).toBe("0");
    expect(formatCompactAmount(850)).toBe("850");
    expect(formatCompactAmount(12.5)).toBe("12,5");
    expect(formatCompactAmount(1000)).toBe("1 k");
    expect(formatCompactAmount(12_500)).toBe("12,5 k");
    expect(formatCompactAmount(1_234_567)).toBe("1,2 M");
    expect(formatCompactAmount(250_000_000)).toBe("250 M");
    expect(formatCompactAmount(3_400_000_000)).toBe("3,4 mil M");
  });

  it("keeps the sign, but not on a value that rounds to zero", () => {
    expect(formatCompactAmount(-2_500_000)).toBe("-2,5 M");
    expect(formatCompactAmount(-0.01)).toBe("0");
    expect(formatCompactAmount(-0)).toBe("0");
  });

  it("moves up a unit when rounding reaches it", () => {
    expect(formatCompactAmount(999_999)).toBe("1 M");
    expect(formatCompactAmount(999.97)).toBe("1 k");
    expect(formatCompactAmount(950)).toBe("950");
  });

  it("renders nothing for a non-number", () => {
    expect(formatCompactAmount(Number.NaN)).toBe("");
  });
});

describe("seriesColor", () => {
  it("uses the five theme hues, then greys them", () => {
    expect([0, 1, 2, 3, 4].map(seriesColor)).toEqual([...CHART_SERIES]);
    expect(seriesColor(5)).toBe("color-mix(in oklch, var(--chart-1) 60%, var(--muted-foreground))");
    expect(seriesColor(11)).toBe("color-mix(in oklch, var(--chart-2) 30%, var(--muted-foreground))");
    expect(seriesColor(15)).toBe("var(--chart-1)");
  });

  it("gives distinct colors to the first 15 series", () => {
    const colors = Array.from({ length: 15 }, (_, i) => seriesColor(i));
    expect(new Set(colors).size).toBe(15);
  });
});

describe("CATEGORY_TYPE_COLORS", () => {
  it("colors every budget category type with a theme variable, never a hex", () => {
    for (const type of BUDGET_CATEGORY_TYPES) {
      expect(CATEGORY_TYPE_COLORS[type]).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });

  it("gives each type its own color", () => {
    const colors = BUDGET_CATEGORY_TYPES.map((type) => CATEGORY_TYPE_COLORS[type]);
    expect(new Set(colors).size).toBe(BUDGET_CATEGORY_TYPES.length);
  });
});
