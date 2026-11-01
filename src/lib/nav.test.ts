import { describe, expect, it } from "vitest";

import { NAV_SECTIONS, navItemForPath } from "./nav";

describe("NAV_SECTIONS", () => {
  // The command palette keys its items by label, and the sidebar by href.
  it("names and links every page once", () => {
    const items = NAV_SECTIONS.flatMap((section) => section.items);
    expect(new Set(items.map((item) => item.label)).size).toBe(items.length);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
  });
});

describe("navItemForPath", () => {
  it("picks the deepest page a path sits under", () => {
    expect(navItemForPath("/")?.href).toBe("/");
    expect(navItemForPath("/budget")?.href).toBe("/budget");
    expect(navItemForPath("/budget/categories")?.href).toBe("/budget/categories");
    expect(navItemForPath("/accounts/abc")?.href).toBe("/accounts");
    expect(navItemForPath("/budgeting")).toBeUndefined();
  });
});
