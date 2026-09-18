import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("yahoo-finance2", () => ({
  default: class {
    async quote() {
      throw new Error("not found");
    }
  },
}));

const { fetchTwelveDataPrices } = await import("./twelvedata");

const fetchMock = vi.fn();

/** Answers the symbol search with `symbol` and the quote with `quote`. */
function twelveData(quote: object) {
  fetchMock.mockImplementation(async (url: string) =>
    Response.json(url.includes("/symbol_search") ? { data: [{ symbol: "AAPL", mic_code: "XNAS" }] } : quote),
  );
}

describe("fetchTwelveDataPrices", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TWELVEDATA_API_KEY", "td-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the key in a header, never in the URL", async () => {
    twelveData({ symbol: "AAPL", close: "231.5", currency: "USD" });

    const result = await fetchTwelveDataPrices([{ key: "aapl", symbol: "AAPL" }]);

    expect(result).toEqual({ prices: { aapl: { price: 231.5, currency: "USD" } }, failed: {} });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).not.toContain("td-key");
      expect(init.headers.Authorization).toBe("apikey td-key");
    }
  });

  it("reads a rate limit reported in a 200 body", async () => {
    twelveData({ code: 429, message: "You have run out of API credits", status: "error" });

    const result = await fetchTwelveDataPrices([{ key: "aapl", symbol: "AAPL" }]);

    expect(result).toEqual({ prices: {}, failed: { aapl: "rate_limited" } });
  });

  it("says not found only when every attempt said so", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("US0378331005")
        ? new Response("{}", { status: 503 })
        : Response.json({ code: 404, message: "symbol not found", status: "error" }),
    );

    const unknown = await fetchTwelveDataPrices([{ key: "nope", symbol: "NOPE" }]);
    const unanswered = await fetchTwelveDataPrices([{ key: "aapl", symbol: "NOPE", isin: "US0378331005" }]);

    expect(unknown.failed).toEqual({ nope: "not_found" });
    expect(unanswered.failed).toEqual({ aapl: "unavailable" });
  });

  it("asks nothing without a key", async () => {
    vi.stubEnv("TWELVEDATA_API_KEY", "");

    const result = await fetchTwelveDataPrices([{ key: "aapl", symbol: "AAPL" }]);

    expect(result).toEqual({ prices: {}, failed: { aapl: "unavailable" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
