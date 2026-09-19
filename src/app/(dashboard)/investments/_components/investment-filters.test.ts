import { describe, expect, it } from "vitest";
import { holdingMatches, isHoldingsView, saleMatches, saleYear } from "./investment-filters";

const holding = {
  asset_name: "Vanguard S&P 500",
  ticker: "VOO",
  isin: "US9229083632",
  account_id: "acc-1",
  account_name: "Interactive Brokers",
  currency: "USD",
  asset_type: "etf",
};

const all = { query: "", assetType: null, accountId: null };

describe("holdingMatches", () => {
  it("matches everything with no filter", () => {
    expect(holdingMatches(holding, all)).toBe(true);
  });

  it("matches every word in any field, ignoring case and accents", () => {
    expect(holdingMatches(holding, { ...all, query: "voo interactive" })).toBe(true);
    expect(holdingMatches(holding, { ...all, query: "us92290" })).toBe(true);
    expect(holdingMatches(holding, { ...all, query: "usd vanguard" })).toBe(true);
    expect(holdingMatches(holding, { ...all, query: "voo binance" })).toBe(false);
  });

  it("filters by type and by account", () => {
    expect(holdingMatches(holding, { ...all, assetType: "etf" })).toBe(true);
    expect(holdingMatches(holding, { ...all, assetType: "stock" })).toBe(false);
    expect(holdingMatches(holding, { ...all, accountId: "acc-1" })).toBe(true);
    expect(holdingMatches(holding, { ...all, accountId: "acc-2" })).toBe(false);
  });

  it("does not trip on a holding without ticker or ISIN", () => {
    expect(holdingMatches({ ...holding, ticker: null, isin: null }, { ...all, query: "vanguard" })).toBe(true);
  });
});

describe("saleMatches", () => {
  const sale = {
    asset_name: "Bitcoin",
    ticker: "BTC",
    isin: null,
    account_name: "Binance",
    currency: "USD",
    asset_type: "crypto",
    sale_date: "2025-03-14",
  };
  const none = { query: "", assetType: null, year: null };

  it("filters by year, type and words", () => {
    expect(saleMatches(sale, none)).toBe(true);
    expect(saleMatches(sale, { ...none, year: "2025" })).toBe(true);
    expect(saleMatches(sale, { ...none, year: "2024" })).toBe(false);
    expect(saleMatches(sale, { ...none, assetType: "stock" })).toBe(false);
    expect(saleMatches(sale, { ...none, query: "btc binance" })).toBe(true);
    expect(saleMatches(sale, { ...none, query: "eth" })).toBe(false);
  });

  it("reads the year from the date", () => {
    expect(saleYear("2026-01-01")).toBe(2026);
  });
});

describe("isHoldingsView", () => {
  it("accepts only the known views", () => {
    expect(isHoldingsView("account")).toBe(true);
    expect(isHoldingsView("other")).toBe(false);
    expect(isHoldingsView(null)).toBe(false);
  });
});
