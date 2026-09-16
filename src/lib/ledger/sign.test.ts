import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { normalizeSignedAmount } from "./sign";

describe("normalizeSignedAmount", () => {
  it.each([
    ["income", 50, 50],
    ["income", -50, 50],
    ["expense", 50, -50],
    ["expense", -50, -50],
    ["correction", 50, 50],
    ["correction", -50, -50],
  ] as const)("%s %s → %s", (type, value, expected) => {
    expect(normalizeSignedAmount(type, value)).toBe(expected);
  });

  it("never changes the magnitude", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("income", "expense", "correction" as const),
        fc.double({ noNaN: true, min: -1e12, max: 1e12 }),
        (type, value) => Math.abs(normalizeSignedAmount(type, value)) === Math.abs(value),
      ),
    );
  });
});
