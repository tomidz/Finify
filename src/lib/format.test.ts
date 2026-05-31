import { describe, it, expect } from "vitest";
import {
  formatAmount,
  amountTone,
  parseMoneyInput,
  formatMoneyInput,
  formatMoneyDisplay,
} from "./format";

describe("formatAmount", () => {
  it("formats with es-AR dot thousands and comma decimals", () => {
    expect(formatAmount(1234.5)).toBe("1.234,50");
    expect(formatAmount(0)).toBe("0,00");
    expect(formatAmount(-1234.56)).toBe("-1.234,56");
    expect(formatAmount(1000000)).toBe("1.000.000,00");
  });

  it("never renders negative zero", () => {
    expect(formatAmount(-0)).toBe("0,00");
    expect(formatAmount(-0.004)).toBe("0,00");
    expect(formatAmount(-0.000001)).toBe("0,00");
  });
});

describe("amountTone", () => {
  it("returns a color class by sign", () => {
    expect(amountTone(5)).toBe("text-green-600");
    expect(amountTone(-5)).toBe("text-red-600");
    expect(amountTone(0)).toBe("text-muted-foreground");
  });
});

describe("parseMoneyInput", () => {
  it("parses es-AR money strings", () => {
    expect(parseMoneyInput("1.234,56")).toBe(1234.56);
    expect(parseMoneyInput("$1.234,56")).toBe(1234.56);
    expect(parseMoneyInput("1.000.000,00")).toBe(1000000);
    expect(parseMoneyInput("0,50")).toBe(0.5);
    expect(parseMoneyInput("-42,00")).toBe(-42);
  });

  it("returns null for empty or invalid input", () => {
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("   ")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
  });
});

describe("formatMoneyInput", () => {
  it("keeps digits and a single trailing comma decimal", () => {
    expect(formatMoneyInput("1.234,56")).toBe("1.234,56");
    expect(formatMoneyInput("12ab34")).toBe("1234");
    // Only the last comma is kept as the decimal separator; earlier commas
    // (thousand separators) are stripped from the integer part.
    expect(formatMoneyInput("1,2,3")).toBe("12,3");
  });
});

describe("formatMoneyDisplay", () => {
  it("re-formats a raw input string with full decimals", () => {
    expect(formatMoneyDisplay("1234,5")).toBe("1.234,50");
    expect(formatMoneyDisplay("")).toBe("");
    expect(formatMoneyDisplay("not a number")).toBe("");
  });
});
