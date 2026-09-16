import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/", "/"],
    ["/budget", "/budget"],
    ["/transactions?month=abc#top", "/transactions?month=abc#top"],
    ["/%5Cexample.com", "/%5Cexample.com"],
  ])("keeps same-origin path %s", (raw, expected) => {
    expect(safeRedirectPath(raw)).toBe(expected);
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["absolute URL", "https://example.com"],
    ["protocol-relative", "//example.com"],
    ["backslash after slash", "/\\example.com"],
    ["slash-backslash-slash", "/\\/example.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["relative path", "budget"],
    ["tab-prefixed", "/\t/example.com"],
    ["newline", "/\nexample.com"],
  ])("falls back for %s", (_label, raw) => {
    expect(safeRedirectPath(raw)).toBe("/");
  });

  it("uses the provided fallback", () => {
    expect(safeRedirectPath("//example.com", "/auth/login")).toBe("/auth/login");
  });
});
