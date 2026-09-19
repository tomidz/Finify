import { describe, expect, it } from "vitest";

import { progressPercent } from "./progress";

describe("progressPercent", () => {
  it("scales the value to a share of max", () => {
    expect(progressPercent(50)).toBe(50);
    expect(progressPercent(250, 1000)).toBe(25);
  });

  it("clamps an overspent or negative value", () => {
    expect(progressPercent(130)).toBe(100);
    expect(progressPercent(-20)).toBe(0);
  });

  it("reads a missing value or an unusable max as empty", () => {
    expect(progressPercent(null)).toBe(0);
    expect(progressPercent(undefined)).toBe(0);
    expect(progressPercent(Number.NaN)).toBe(0);
    expect(progressPercent(10, 0)).toBe(0);
    expect(progressPercent(10, -5)).toBe(0);
  });
});
