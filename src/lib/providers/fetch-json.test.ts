import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { combineFailures, fetchJson } from "./fetch-json";

const fetchMock = vi.fn();
let logged: ReturnType<typeof vi.spyOn>;

const respond = (status: number, body: string) => fetchMock.mockResolvedValue(new Response(body, { status }));
const lines = () => logged.mock.calls.map(([line]) => JSON.parse(line as string));

describe("fetchJson", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    logged = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    logged.mockRestore();
  });

  it("returns the parsed body, with the headers asked for", async () => {
    respond(200, '{"rate":1.1}');

    const result = await fetchJson("test", "https://example.test/rate", { headers: { Authorization: "apikey k" } });

    expect(result).toEqual({ ok: true, data: { rate: 1.1 } });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: "apikey k" });
    expect(logged).not.toHaveBeenCalled();
  });

  it.each([
    [404, "not_found"],
    [400, "not_found"],
    [429, "rate_limited"],
    [500, "unavailable"],
    [503, "unavailable"],
    [401, "unavailable"],
  ])("says a %i is %s", async (status, reason) => {
    respond(status, "{}");
    expect(await fetchJson("test", "https://example.test")).toEqual({ ok: false, reason });
  });

  it("says a body that is not JSON is a bad response", async () => {
    respond(200, "<html>maintenance</html>");
    expect(await fetchJson("test", "https://example.test")).toEqual({ ok: false, reason: "bad_response" });
  });

  it("says a request that never got an answer is unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await fetchJson("test", "https://example.test")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
        ),
    );

    const pending = fetchJson("test", "https://example.test", { timeoutMs: 5_000 });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await pending).toEqual({ ok: false, reason: "timeout" });
  });

  it("logs a failure under its tag with the reason and status only, never the URL", async () => {
    respond(429, "{}");

    await fetchJson("twelvedata.quote", "https://example.test/quote?apikey=secret");

    expect(lines()).toEqual([{ level: "error", tag: "twelvedata.quote", message: "rate_limited", status: 429 }]);
    expect(JSON.stringify(lines())).not.toContain("secret");
  });
});

describe("combineFailures", () => {
  it("says not found only when every attempt did", () => {
    expect(combineFailures(["not_found", "not_found"])).toBe("not_found");
    expect(combineFailures(["not_found", "rate_limited"])).toBe("rate_limited");
    expect(combineFailures(["timeout", "not_found"])).toBe("timeout");
    expect(combineFailures([])).toBe("not_found");
  });
});
