import { describe, expect, it } from "vitest";
import {
  exceedsQuantity,
  formatExactQuantity,
  formatQuantity,
  formatUnitPrice,
  quantityDecimals,
  unitPriceDecimals,
  unpricedReasonText,
} from "./investment-format";

describe("formatQuantity", () => {
  it("shows a crypto quantity with the decimals it has, up to 8", () => {
    expect(formatQuantity(0.004, "crypto")).toBe("0,004");
    expect(formatQuantity(0.12345678, "crypto")).toBe("0,12345678");
    expect(formatQuantity(1.5, "crypto")).toBe("1,50");
    expect(formatQuantity(2, "stablecoin")).toBe("2,00");
    expect(formatQuantity(1234.000001, "stablecoin")).toBe("1.234,000001");
  });

  it("rounds a crypto quantity past 8 decimals and hides the float drift of a sum", () => {
    expect(formatQuantity(0.123456789, "crypto")).toBe("0,12345679");
    expect(formatQuantity(0.7 + 0.1, "crypto")).toBe("0,80");
  });

  it("keeps 2 decimals for every other asset", () => {
    expect(formatQuantity(10, "stock")).toBe("10,00");
    expect(formatQuantity(0.004, "etf")).toBe("0,00");
    expect(formatQuantity(1500.5, "cash")).toBe("1.500,50");
  });

  it("never shows -0", () => {
    expect(formatQuantity(-1e-12, "crypto")).toBe("0,00");
  });
});

describe("formatExactQuantity", () => {
  it("shows every stored decimal whatever the asset", () => {
    expect(formatExactQuantity(0.1234567)).toBe("0,1234567");
    expect(formatExactQuantity(10)).toBe("10,00");
    expect(formatExactQuantity(0.7 + 0.1)).toBe("0,80");
  });
});

describe("quantityDecimals", () => {
  it("is 2 at least and 8 at most", () => {
    expect(quantityDecimals(3, "crypto")).toBe(2);
    expect(quantityDecimals(1e-8, "crypto")).toBe(8);
    expect(quantityDecimals(1e-9, "crypto")).toBe(2);
    expect(quantityDecimals(Number.NaN, "crypto")).toBe(2);
    expect(quantityDecimals(0.123, "bond")).toBe(2);
  });
});

describe("formatUnitPrice", () => {
  it("shows 2 decimals from 1 up", () => {
    expect(formatUnitPrice(50000.123)).toBe("50.000,12");
    expect(formatUnitPrice(1)).toBe("1,00");
  });

  it("shows about 4 significant digits below 1, up to 8 decimals", () => {
    expect(formatUnitPrice(0.0523)).toBe("0,0523");
    expect(formatUnitPrice(0.025)).toBe("0,025");
    expect(formatUnitPrice(0.00001234)).toBe("0,00001234");
    expect(formatUnitPrice(0.000000123456)).toBe("0,00000012");
    expect(formatUnitPrice(0.99876696)).toBe("0,9988");
    expect(formatUnitPrice(0.5)).toBe("0,50");
    expect(formatUnitPrice(-0.0523)).toBe("-0,0523");
  });

  it("keeps 2 decimals for 0 and what rounds to it", () => {
    expect(unitPriceDecimals(0)).toBe(2);
    expect(unitPriceDecimals(0.000000001)).toBe(2);
    expect(unitPriceDecimals(Number.NaN)).toBe(2);
  });
});

describe("exceedsQuantity", () => {
  it("takes the float drift of a sum of lots as equal", () => {
    expect(0.8 > 0.7 + 0.1).toBe(true);
    expect(exceedsQuantity(0.8, 0.7 + 0.1)).toBe(false);
    expect(exceedsQuantity(0.3, 0.1 + 0.2)).toBe(false);
  });

  it("flags one 8th decimal more than held", () => {
    expect(exceedsQuantity(0.80000001, 0.8)).toBe(true);
    expect(exceedsQuantity(2, 1)).toBe(true);
  });

  it("accepts less than or exactly what is held", () => {
    expect(exceedsQuantity(0.5, 1)).toBe(false);
    expect(exceedsQuantity(1, 1)).toBe(false);
  });

  it("scales the tolerance with large positions", () => {
    let lots = 0;
    for (let i = 0; i < 10; i++) lots += 12_345_678.12345678;
    expect(exceedsQuantity(123_456_781.2345678, lots)).toBe(false);
    expect(exceedsQuantity(123_456_782, lots)).toBe(true);
  });
});

describe("unpricedReasonText", () => {
  it("says why a holding has no price", () => {
    expect(unpricedReasonText("rate_limited")).toBe("Sin precio: el proveedor limitó las consultas");
    expect(unpricedReasonText("no_rate")).toBe("Sin precio: falta el tipo de cambio");
    expect(unpricedReasonText("unquotable")).toBe("Sin precio: ninguna fuente lo cotiza, cargá uno manual");
  });
});
