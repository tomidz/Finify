import { describe, expect, it } from "vitest";

import { planAmountToSave } from "./plan-amount";

describe("planAmountToSave", () => {
  it("changes nothing for an empty or unreadable field", () => {
    expect(planAmountToSave("", 1500, 2)).toBeNull();
    expect(planAmountToSave(",", 1500, 2)).toBeNull();
    expect(planAmountToSave("-", 0, 2)).toBeNull();
  });

  it("changes nothing when the amount is the same at the shown decimals", () => {
    expect(planAmountToSave("1.500", 1500, 2)).toBeNull();
    expect(planAmountToSave("1.500,00", 1500.004, 2)).toBeNull();
  });

  it("saves a typed 0 and any other new amount", () => {
    expect(planAmountToSave("0", 1500, 2)).toBe(0);
    expect(planAmountToSave("1.234,56", 1500, 2)).toBe(1234.56);
  });
});
