import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  formatAmount,
  amountTone,
  parseMoney,
  sanitizeMoneyInput,
  moneyInputCaret,
  toMoneyInput,
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

  it("takes the currency's decimals", () => {
    expect(formatAmount(0.00012345, 8)).toBe("0,00012345");
    expect(formatAmount(1234.5, 0)).toBe("1.235");
    expect(formatAmount(-0.000000001, 8)).toBe("0,00000000");
  });
});

describe("amountTone", () => {
  it("returns a color class by sign", () => {
    expect(amountTone(5)).toBe("text-success");
    expect(amountTone(-5)).toBe("text-destructive");
    expect(amountTone(0)).toBe("text-muted-foreground");
  });

  it("is muted when the amount shows as zero", () => {
    expect(amountTone(-0.004)).toBe("text-muted-foreground");
    expect(amountTone(0.004)).toBe("text-muted-foreground");
    expect(amountTone(0.004, 3)).toBe("text-success");
    expect(amountTone(Number.NaN)).toBe("text-muted-foreground");
  });
});

describe("parseMoney", () => {
  it("parses es-AR amounts", () => {
    expect(parseMoney("1.234,56")).toBe(1234.56);
    expect(parseMoney("-12,5")).toBe(-12.5);
    expect(parseMoney("$ 1.234")).toBe(1234);
    expect(parseMoney("US$ -3")).toBe(-3);
    expect(parseMoney("-$1.000.000,00")).toBe(-1000000);
    expect(parseMoney("ARS 0,5")).toBe(0.5);
    expect(parseMoney("−1.234,5")).toBe(-1234.5);
    expect(parseMoney(" 1 234,5 ")).toBe(1234.5);
    expect(parseMoney("0,00000001")).toBe(0.00000001);
  });

  it("reads the partial states a field passes through", () => {
    expect(parseMoney("12,")).toBe(12);
    expect(parseMoney("0,0")).toBe(0);
    expect(parseMoney(",5")).toBe(0.5);
    expect(Object.is(parseMoney("-0"), 0)).toBe(true);
  });

  it("returns null, never 0, for empty or malformed text", () => {
    for (const text of [
      "",
      "   ",
      "-",
      ",",
      "-,",
      "$",
      "abc",
      "12abc",
      "1,2,3",
      "--5",
      "-$-5",
      "1.23",
      "1234.5",
      "0.500",
      "1.2345",
      "1e-7",
      "Infinity",
    ]) {
      expect(parseMoney(text), text).toBeNull();
    }
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });

  it("reads back what formatAmount shows", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e12, max: 1e12, noNaN: true }), (value) => {
        // Intl rounds the shortest decimal form (…,955 → …,96), so the shown
        // amount is within half a cent of the value, not always toFixed's.
        const shown = parseMoney(formatAmount(value));
        expect(shown).not.toBeNull();
        expect(Math.abs(shown! - value)).toBeLessThanOrEqual(0.005 + Math.abs(value) * 1e-15);
        expect(amountTone(value)).toBe(
          shown! > 0 ? "text-success" : shown! < 0 ? "text-destructive" : "text-muted-foreground",
        );
      }),
    );
    expect(formatAmount(-0.004)).toBe("0,00");
    expect(formatAmount(-0.005)).toBe("-0,01");
    expect(amountTone(-0.004)).toBe("text-muted-foreground");
  });
});

describe("sanitizeMoneyInput", () => {
  it("regroups thousands and keeps the first comma", () => {
    expect(sanitizeMoneyInput("1234567,89")).toBe("1.234.567,89");
    expect(sanitizeMoneyInput("1.2345")).toBe("12.345");
    expect(sanitizeMoneyInput("12ab34")).toBe("1.234");
    expect(sanitizeMoneyInput("1,2,3")).toBe("1,23");
    expect(sanitizeMoneyInput("US$ 1.234,5")).toBe("1.234,5");
  });

  it("keeps the partial states of typing", () => {
    expect(sanitizeMoneyInput("")).toBe("");
    expect(sanitizeMoneyInput("12,")).toBe("12,");
    expect(sanitizeMoneyInput("0,0")).toBe("0,0");
    expect(sanitizeMoneyInput(",")).toBe(",");
    expect(sanitizeMoneyInput("-", { allowNegative: true })).toBe("-");
  });

  it("drops leading zeros but keeps a single one", () => {
    expect(sanitizeMoneyInput("007")).toBe("7");
    expect(sanitizeMoneyInput("00")).toBe("0");
    expect(sanitizeMoneyInput("00,5")).toBe("0,5");
  });

  it("limits the decimals to the currency's", () => {
    expect(sanitizeMoneyInput("1,239")).toBe("1,23");
    expect(sanitizeMoneyInput("0,123456789", { decimals: 8 })).toBe("0,12345678");
    expect(sanitizeMoneyInput("12,5", { decimals: 0 })).toBe("12");
  });

  it("keeps a leading minus only when negatives are allowed", () => {
    expect(sanitizeMoneyInput("-12")).toBe("12");
    expect(sanitizeMoneyInput("-12", { allowNegative: true })).toBe("-12");
    expect(sanitizeMoneyInput("−12", { allowNegative: true })).toBe("-12");
    expect(sanitizeMoneyInput("$ -1.234", { allowNegative: true })).toBe("-1.234");
    expect(sanitizeMoneyInput("12-", { allowNegative: true })).toBe("12");
    expect(sanitizeMoneyInput("--5", { allowNegative: true })).toBe("-5");
  });

  const typed = fc.string({
    unit: fc.constantFrom("0", "1", "5", "9", ",", ".", "-", "−", "$", " ", "a"),
    maxLength: 20,
  });
  const options = fc.record({ decimals: fc.integer({ min: 0, max: 8 }), allowNegative: fc.boolean() });

  it("is idempotent", () => {
    fc.assert(
      fc.property(typed, options, (raw, opts) => {
        const once = sanitizeMoneyInput(raw, opts);
        expect(sanitizeMoneyInput(once, opts)).toBe(once);
      }),
    );
  });

  it("always yields text parseMoney reads (or an empty partial state)", () => {
    fc.assert(
      fc.property(typed, options, (raw, opts) => {
        const clean = sanitizeMoneyInput(raw, opts);
        const parsed = parseMoney(clean);
        if (parsed === null) {
          expect(/\d/.test(clean)).toBe(false);
          return;
        }
        expect(Number.isFinite(parsed)).toBe(true);
        if (!opts.allowNegative) expect(parsed >= 0).toBe(true);
        expect(parseMoney(toMoneyInput(parsed, opts.decimals)) === parsed).toBe(true);
      }),
    );
  });
});

describe("moneyInputCaret", () => {
  it("keeps the caret after the same digit when thousands regroup", () => {
    // "1.234" with a 5 typed after the 2.
    expect(moneyInputCaret("1.2534", 4)).toBe(4); // "12.5|34"
    // A digit typed at the end lands at the end.
    expect(moneyInputCaret("1.2345", 6)).toBe(6); // "12.345|"
  });

  it("follows dropped characters", () => {
    expect(moneyInputCaret("12a3", 3)).toBe(2); // "12|3"
    expect(moneyInputCaret("05", 2)).toBe(1); // "5|"
    expect(moneyInputCaret("1,239", 5)).toBe(4); // "1,23|"
    expect(moneyInputCaret("-12", 1)).toBe(0); // "|12"
    expect(moneyInputCaret("-12", 1, { allowNegative: true })).toBe(1); // "-|12"
  });

  it("stays within the sanitized text", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), fc.nat(25), (raw, at) => {
        const caret = moneyInputCaret(raw, Math.min(at, raw.length));
        expect(caret).toBeGreaterThanOrEqual(0);
        expect(caret).toBeLessThanOrEqual(sanitizeMoneyInput(raw).length);
      }),
    );
  });
});

describe("toMoneyInput", () => {
  it("formats a stored number for a field, without exponent notation", () => {
    expect(toMoneyInput(1234.5)).toBe("1.234,5");
    expect(toMoneyInput(100)).toBe("100");
    expect(toMoneyInput(-1234567.891, 2)).toBe("-1.234.567,89");
    expect(toMoneyInput(1e-7, 8)).toBe("0,0000001");
    expect(toMoneyInput(1e21)).toBe("1.000.000.000.000.000.000.000");
    expect(toMoneyInput(0.1 + 0.2)).toBe("0,3");
    expect(toMoneyInput(12.5, 0)).toBe("13");
  });

  it("gives 0 for zero and '' for nothing", () => {
    expect(toMoneyInput(0)).toBe("0");
    expect(toMoneyInput(-0)).toBe("0");
    expect(toMoneyInput(-0.001)).toBe("0");
    expect(toMoneyInput(null)).toBe("");
    expect(toMoneyInput(undefined)).toBe("");
    expect(toMoneyInput(Number.NaN)).toBe("");
    expect(toMoneyInput(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("round-trips through parseMoney and is already sanitized", () => {
    fc.assert(
      fc.property(
        fc.maxSafeInteger().map((n) => n % 2 ** 51),
        fc.integer({ min: 0, max: 8 }),
        (units, decimals) => {
          const value = units / 10 ** decimals;
          const text = toMoneyInput(value, decimals);
          expect(text).not.toMatch(/e/i);
          expect(parseMoney(text) === value).toBe(true);
          expect(sanitizeMoneyInput(text, { decimals, allowNegative: true })).toBe(text);
        },
      ),
    );
  });
});
