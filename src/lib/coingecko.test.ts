import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchCryptoPricesWithReasons } from "./coingecko";

const fetchMock = vi.fn();

describe("fetchCryptoPricesWithReasons", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says why a coin has no price", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));

    const result = await fetchCryptoPricesWithReasons(["BTC", "ETH"], "EUR");

    expect(result).toEqual({ prices: {}, failed: { BTC: "rate_limited", ETH: "rate_limited" } });
  });

  it("does not remember a failed search as an unknown coin", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    const limited = await fetchCryptoPricesWithReasons(["WIF"], "USD");
    expect(limited.failed).toEqual({ WIF: "rate_limited" });

    fetchMock
      .mockResolvedValueOnce(Response.json({ coins: [{ id: "dogwifcoin", symbol: "wif", market_cap_rank: 90 }] }))
      .mockResolvedValueOnce(Response.json({ dogwifcoin: { usd: 2.5 } }));
    const priced = await fetchCryptoPricesWithReasons(["WIF"], "USD");
    expect(priced).toEqual({ prices: { WIF: 2.5 }, failed: {} });
  });

  it("says not found for a coin the price answer leaves out", async () => {
    fetchMock.mockResolvedValue(Response.json({ bitcoin: { eur: 90_000 } }));

    const result = await fetchCryptoPricesWithReasons(["BTC", "ETH"], "EUR");

    expect(result).toEqual({ prices: { BTC: 90_000 }, failed: { ETH: "not_found" } });
  });
});
