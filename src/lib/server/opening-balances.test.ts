import { beforeEach, describe, expect, it, vi } from "vitest";

import { argsOf, fakeSupabase, type RecordedQuery } from "../../../tests/support/fake-supabase";

type Response = {
  data: unknown;
  error: { code: string; message?: string } | null;
  count?: number | null;
};

let respond: (query: RecordedQuery) => Response;
const fake = fakeSupabase((query) => respond(query));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fake.client,
}));

const { recalculateOpeningBalances } = await import("./opening-balances");

const threeMonths = [
  { id: "jan", year: 2026, month: 1 },
  { id: "feb", year: 2026, month: 2 },
  { id: "mar", year: 2026, month: 3 },
];

function ledger(
  overrides: {
    months?: { id: string; year: number; month: number }[];
    accounts?: string[];
    movements?: Response;
  } = {},
) {
  const months = overrides.months ?? threeMonths;
  return (query: RecordedQuery): Response => {
    const has = (method: string) => argsOf(query, method) !== undefined;
    if (query.table === "months" && has("single")) {
      return { data: { ...months[0], user_id: "u1" }, error: null };
    }
    if (query.table === "months") return { data: months, error: null };
    if (query.table === "accounts") {
      return { data: (overrides.accounts ?? ["cash"]).map((id) => ({ id })), error: null };
    }
    if (query.table === "opening_balances" && has("upsert")) return { data: null, error: null };
    if (query.table === "opening_balances") {
      return { data: [{ account_id: "cash", opening_amount: 100, opening_base_amount: 100 }], error: null };
    }
    if (query.table === "transaction_amounts") {
      if (overrides.movements) return overrides.movements;
      const data = [
        { id: "1", account_id: "cash", amount: -10, base_amount: -10, transactions: { month_id: "jan", deleted_at: null } },
        { id: "2", account_id: "cash", amount: -5, base_amount: -5, transactions: { month_id: "feb", deleted_at: null } },
      ].filter((row) => (argsOf(query, "in")?.[1] as string[]).includes(row.transactions.month_id));
      return { data, error: null, count: data.length };
    }
    throw new Error(`unexpected query on ${query.table}`);
  };
}

const upsertsOf = () => fake.queries.filter((q) => argsOf(q, "upsert")).map((q) => argsOf(q, "upsert")![0] as { month_id: string }[]);

describe("recalculateOpeningBalances", () => {
  beforeEach(() => {
    fake.queries.length = 0;
  });

  it("reads the movements of every feeding month at once and writes all later months together", async () => {
    respond = ledger();

    expect(await recalculateOpeningBalances("jan")).toEqual({ data: null });

    const movementQueries = fake.queries.filter((q) => q.table === "transaction_amounts");
    expect(movementQueries).toHaveLength(1);
    expect(argsOf(movementQueries[0], "in")).toEqual(["transactions.month_id", ["jan", "feb"]]);
    expect(argsOf(movementQueries[0], "select")?.[1]).toEqual({ count: "exact" });

    expect(upsertsOf()).toEqual([
      [
        { month_id: "feb", account_id: "cash", opening_amount: 90, opening_base_amount: 90 },
        { month_id: "mar", account_id: "cash", opening_amount: 85, opening_base_amount: 85 },
      ],
    ]);
  });

  it("splits a long month list across reads", async () => {
    const months = Array.from({ length: 120 }, (_, i) => ({
      id: `m${i}`,
      year: 2016 + Math.floor(i / 12),
      month: (i % 12) + 1,
    }));
    respond = ledger({ months });

    expect(await recalculateOpeningBalances("m0")).toEqual({ data: null });

    const monthLists = fake.queries
      .filter((q) => q.table === "transaction_amounts")
      .map((q) => argsOf(q, "in")![1] as string[]);
    expect(monthLists.map((ids) => ids.length)).toEqual([50, 50, 19]);
    expect(monthLists.flat()).toEqual(months.slice(0, 119).map((m) => m.id));
  });

  it("never splits a month across writes", async () => {
    const months = ["jan", "feb", "mar", "apr"].map((id, i) => ({ id, year: 2026, month: i + 1 }));
    const accounts = Array.from({ length: 200 }, (_, i) => `acc${i}`);
    respond = ledger({ months, accounts });

    expect(await recalculateOpeningBalances("jan")).toEqual({ data: null });

    const batches = upsertsOf().map((rows) => [...new Set(rows.map((r) => r.month_id))]);
    expect(batches).toEqual([["feb", "mar"], ["apr"]]);
    expect(upsertsOf().map((rows) => rows.length)).toEqual([400, 200]);
  });

  it("writes nothing when a read fails", async () => {
    respond = ledger({ movements: { data: null, error: { code: "57014", message: "timeout" } } });

    expect(await recalculateOpeningBalances("jan")).toEqual({ error: "timeout" });
    expect(upsertsOf()).toHaveLength(0);
  });
});
