import { describe, it, expect } from "vitest";

import { authCookieNames, clearAuthCookies } from "./cookies";

describe("authCookieNames", () => {
  it("picks every Supabase auth cookie, including the chunked ones", () => {
    expect(
      authCookieNames([
        "sb-phnpbtsgloueftqkwwfa-auth-token",
        "sb-phnpbtsgloueftqkwwfa-auth-token.0",
        "sb-phnpbtsgloueftqkwwfa-auth-token.1",
        "sidebar_state",
        "theme",
      ]),
    ).toEqual([
      "sb-phnpbtsgloueftqkwwfa-auth-token",
      "sb-phnpbtsgloueftqkwwfa-auth-token.0",
      "sb-phnpbtsgloueftqkwwfa-auth-token.1",
    ]);
  });

  it("leaves app cookies alone", () => {
    expect(authCookieNames(["sidebar_state", "theme"])).toEqual([]);
    expect(authCookieNames([])).toEqual([]);
  });

  it("does not match a cookie that merely contains the prefix", () => {
    expect(authCookieNames(["not-sb-auth", "xsb-token"])).toEqual([]);
  });
});

describe("clearAuthCookies", () => {
  it("deletes the auth cookies and nothing else", () => {
    const deleted: string[] = [];
    const response = { cookies: { delete: (name: string) => deleted.push(name) } };

    clearAuthCookies(response, [
      "sb-ref-auth-token.0",
      "sidebar_state",
      "sb-ref-auth-token.1",
    ]);

    expect(deleted).toEqual(["sb-ref-auth-token.0", "sb-ref-auth-token.1"]);
  });
});
