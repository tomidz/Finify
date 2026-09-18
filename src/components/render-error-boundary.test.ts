import { describe, expect, it } from "vitest";

import { resetKeysChanged } from "./render-error-boundary";

describe("resetKeysChanged", () => {
  it("is false for the same entries, even in a new array", () => {
    const data = { rows: [] };
    expect(resetKeysChanged([data, "2026-09"], [data, "2026-09"])).toBe(false);
    expect(resetKeysChanged(undefined, undefined)).toBe(false);
    expect(resetKeysChanged([Number.NaN], [Number.NaN])).toBe(false);
  });

  it("is true when an entry is replaced", () => {
    expect(resetKeysChanged([{ rows: [] }], [{ rows: [] }])).toBe(true);
    expect(resetKeysChanged(["2026-09"], ["2026-10"])).toBe(true);
  });

  it("is true when entries are added or removed", () => {
    expect(resetKeysChanged(["a"], ["a", "b"])).toBe(true);
    expect(resetKeysChanged(undefined, ["a"])).toBe(true);
  });
});
