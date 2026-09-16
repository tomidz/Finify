import { describe, expect, it } from "vitest";

import { roundLikeNumeric } from "./decimal";

describe("roundLikeNumeric", () => {
  it.each([
    // [value, stored in NUMERIC(18,8)]
    [123.45, 123.45],
    [1.000000005, 1.00000001],
    [-1.000000005, -1.00000001],
    [12345678.100000015, 12345678.10000002],
    [5e-9, 1e-8],
    [-5e-9, -1e-8],
    [4.9e-9, 0],
    [10.123456789, 10.12345679],
    [1e21, 1e21],
  ])("stores %s as %s", (value, stored) => {
    expect(roundLikeNumeric(value, 8)).toBe(stored);
  });

  it("rounds the decimal text, not the binary value", () => {
    expect(Number((1.000000005).toFixed(8))).toBe(1);
    expect(roundLikeNumeric(1.000000005, 8)).toBe(1.00000001);
  });

  it("never returns negative zero", () => {
    expect(Object.is(roundLikeNumeric(-4e-9, 8), 0)).toBe(true);
  });
});
