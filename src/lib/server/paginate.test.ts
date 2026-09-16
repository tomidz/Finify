import { describe, expect, it } from "vitest";

import { chunk, readAllRows } from "./paginate";

/** A table of `total` rows served by a PostgREST capped at `maxRows`. */
function table(total: number, maxRows: number) {
  const rows = Array.from({ length: total }, (_, i) => i);
  const calls: { from: number; to: number; count: string | undefined }[] = [];
  const query = async (page: { from: number; to: number; count: "exact" | undefined }) => {
    calls.push(page);
    const size = Math.min(page.to - page.from + 1, maxRows);
    return {
      data: rows.slice(page.from, page.from + size),
      error: null,
      count: page.count ? total : null,
    };
  };
  return { rows, calls, query };
}

describe("readAllRows", () => {
  it("reads everything in one request when it fits", async () => {
    const t = table(20, 1000);
    expect(await readAllRows(t.query)).toEqual({ data: t.rows });
    expect(t.calls).toEqual([{ from: 0, to: 999, count: "exact" }]);
  });

  it("keeps reading when the server caps pages below the page size", async () => {
    const t = table(1200, 500);
    expect(await readAllRows(t.query)).toEqual({ data: t.rows });
    expect(t.calls.map((c) => c.from)).toEqual([0, 500, 1000]);
    expect(t.calls.slice(1).every((c) => c.count === undefined)).toBe(true);
  });

  it("reads an exact multiple of the page size without an empty trailing request", async () => {
    const t = table(2000, 1000);
    expect(await readAllRows(t.query)).toEqual({ data: t.rows });
    expect(t.calls).toHaveLength(2);
  });

  it("stops on an empty page when the total is unknown", async () => {
    const t = table(3, 1000);
    const noCount = async (page: { from: number; to: number; count: "exact" | undefined }) => ({
      ...(await t.query(page)),
      count: null,
    });
    expect(await readAllRows(noCount)).toEqual({ data: t.rows });
    expect(t.calls).toHaveLength(2);
  });

  it("returns the error of any page", async () => {
    let call = 0;
    const result = await readAllRows(async () =>
      call++ === 0
        ? { data: Array.from({ length: 1000 }, (_, i) => i), error: null, count: 1500 }
        : { data: null, error: { code: "57014", message: "timeout" } },
    );
    expect(result).toEqual({ error: { code: "57014", message: "timeout" } });
  });
});

describe("chunk", () => {
  it("splits into fixed-size pieces", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});
