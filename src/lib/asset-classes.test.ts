import { describe, expect, it } from "vitest";

import { cashCurrencyOf, isCashLike, lotValueInBase, namesMoney, priceRequestFor } from "./asset-classes";

describe("asset classes", () => {
  it("prices cash in the currency its ticker names", () => {
    expect(cashCurrencyOf({ asset_type: "cash", ticker: "eur", asset_name: "Euros" })).toBe("EUR");
    expect(cashCurrencyOf({ asset_type: "cash", ticker: null, asset_name: "USD" })).toBe("USD");
  });

  it("prices a stablecoin in the currency it tracks", () => {
    expect(cashCurrencyOf({ asset_type: "stablecoin", ticker: "USDT", asset_name: "Tether" })).toBe("USD");
    expect(cashCurrencyOf({ asset_type: "stablecoin", ticker: "EURC", asset_name: "Euro Coin" })).toBe("EUR");
  });

  it("gives other classes no cash currency", () => {
    expect(cashCurrencyOf({ asset_type: "crypto", ticker: "USDT", asset_name: "Tether" })).toBeNull();
    expect(isCashLike("etf")).toBe(false);
    expect(isCashLike("stablecoin")).toBe(true);
  });

  it("recognizes lookups that name money", () => {
    expect(namesMoney({ ticker: "USD", currency: "USD", assetType: "stock" })).toBe(true);
    expect(namesMoney({ ticker: " usdc ", currency: "USD", assetType: "etf" })).toBe(true);
    expect(namesMoney({ ticker: "EUR", currency: "USD", assetType: "other" })).toBe(true);
    expect(namesMoney({ ticker: "SPY", currency: "USD", assetType: "etf" })).toBe(false);
    expect(namesMoney({ ticker: null, currency: "USD", assetType: "other" })).toBe(false);
  });

  it("does not take a stock whose ticker is a currency code for money", () => {
    expect(namesMoney({ ticker: "NOK", currency: "USD", assetType: "stock" })).toBe(false);
    expect(namesMoney({ ticker: "COP", currency: "USD", assetType: "stock" })).toBe(false);
  });

  it("asks the same question for a lot from every view", () => {
    const lot = { asset_type: "stock", ticker: " AAPL ", isin: "", asset_name: "Apple", currency: "USD" };
    expect(priceRequestFor(lot)).toEqual({
      key: "stock:USD:AAPL|",
      ticker: "AAPL",
      isin: null,
      name: "Apple",
      assetType: "stock",
      currency: "USD",
    });
  });

  it("looks crypto, cash and stablecoins up by the code in their name when they have no ticker", () => {
    const base = { ticker: null, isin: null, currency: "USD" };
    expect(priceRequestFor({ ...base, asset_type: "crypto", asset_name: "BTC" }).ticker).toBe("BTC");
    expect(priceRequestFor({ ...base, asset_type: "cash", asset_name: "EUR" }).ticker).toBe("EUR");
    expect(priceRequestFor({ ...base, asset_type: "bond", asset_name: "Plazo fijo" }).ticker).toBeNull();
  });

  it("prices the same code filed under two classes or currencies separately", () => {
    const usdt = { ticker: "USDT", isin: null, asset_name: "Tether" };
    const keys = new Set([
      priceRequestFor({ ...usdt, asset_type: "crypto", currency: "USD" }).key,
      priceRequestFor({ ...usdt, asset_type: "stablecoin", currency: "USD" }).key,
      priceRequestFor({ ...usdt, asset_type: "stablecoin", currency: "EUR" }).key,
    ]);
    expect(keys.size).toBe(3);
  });

  it("keeps lots of one holding that are looked up differently apart", () => {
    const lot = { asset_type: "stock", ticker: "GGAL", asset_name: "Galicia", currency: "ARS" };
    expect(priceRequestFor({ ...lot, isin: null }).key).not.toBe(
      priceRequestFor({ ...lot, isin: "ARP495251018" }).key,
    );
  });

  it("values a lot in the base currency, at cost without a price", () => {
    const lot = { asset_type: "stock", ticker: "SAP", isin: null, asset_name: "SAP", currency: "EUR", quantity: 2, total_cost: 300 };
    const key = priceRequestFor(lot).key;
    expect(lotValueInBase(lot, { [key]: 200 }, { EUR: 1.1 })).toEqual({
      current: expect.closeTo(440, 6),
      cost: expect.closeTo(330, 6),
    });
    expect(lotValueInBase(lot, {}, { EUR: 1.1 })).toEqual({
      current: expect.closeTo(330, 6),
      cost: expect.closeTo(330, 6),
    });
    expect(lotValueInBase(lot, { [key]: 200 }, {})).toBeNull();
  });
});
