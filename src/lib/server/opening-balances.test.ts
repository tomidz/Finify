import { beforeEach, describe, expect, it, vi } from "vitest";

import { argsOf, fakeSupabase, type RecordedQuery } from "../../../tests/support/fake-supabase";

type Response = { data: unknown; error: { code: string; message?: string } | null };

let respond: (query: RecordedQuery) => Response;
const fake = fakeSupabase((query) => respond(query));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fake.client,
}));

const { recalculateOpeningBalances } = await import("./opening-balances");

describe("recalculateOpeningBalances", () => {
  beforeEach(() => {
    fake.queries.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rebuilds from the given month in the database", async () => {
    respond = () => ({ data: null, error: null });
    expect(await recalculateOpeningBalances("month-1")).toEqual({ data: null });
    expect(fake.queries.map((q) => q.table)).toEqual(["rpc:rebuild_opening_balances"]);
    expect(argsOf(fake.queries[0], "rpc")).toEqual([{ p_from_month_id: "month-1" }]);
  });

  it("rebuilds every month without a starting month", async () => {
    respond = () => ({ data: null, error: null });
    await recalculateOpeningBalances(null);
    expect(argsOf(fake.queries[0], "rpc")).toEqual([{}]);
  });

  it("reports a failed rebuild in Spanish, never with the database's message", async () => {
    respond = () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
    expect(await recalculateOpeningBalances("month-1")).toEqual({
      error: "La base de datos tardó demasiado. Probá de nuevo.",
    });
  });
});
