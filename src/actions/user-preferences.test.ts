import { beforeEach, describe, expect, it, vi } from "vitest";

import { argsOf, fakeSupabase, type RecordedQuery } from "../../tests/support/fake-supabase";

type Response = { data: unknown; error: { code: string; message?: string } | null; count?: number | null };

let respond: (query: RecordedQuery) => Response;
const fake = fakeSupabase((query) => respond(query), { userId: "user-1" });
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));

const { getUserPreferences, updateUserPreferences } = await import("./user-preferences");

function store(options: { base: string; accounts: number; budgetLines: number }) {
  return (query: RecordedQuery): Response => {
    if (query.table === "accounts") return { data: null, error: null, count: options.accounts };
    if (query.table === "budget_lines") return { data: null, error: null, count: options.budgetLines };
    if (query.table === "currencies") {
      const code = argsOf(query, "eq")?.[1];
      return { data: { currency_type: code === "BTC" ? "crypto" : "fiat" }, error: null };
    }
    if (query.table === "user_preferences" && argsOf(query, "upsert")) {
      const row = argsOf(query, "upsert")![0] as { base_currency: string; fx_source?: string };
      return { data: { base_currency: row.base_currency, fx_source: row.fx_source ?? "frankfurter" }, error: null };
    }
    if (query.table === "user_preferences") {
      return { data: { base_currency: options.base, fx_source: "frankfurter" }, error: null };
    }
    throw new Error(`unexpected query on ${query.table}`);
  };
}

const upserts = () => fake.queries.filter((q) => argsOf(q, "upsert"));

describe("base currency lock", () => {
  beforeEach(() => {
    fake.queries.length = 0;
  });

  it("reports the base currency as locked once there are accounts", async () => {
    respond = store({ base: "USD", accounts: 2, budgetLines: 0 });
    expect(await getUserPreferences()).toEqual({
      data: { base_currency: "USD", fx_source: "frankfurter", base_currency_locked: true },
    });
  });

  it("refuses to change the base currency when budgets hold base amounts", async () => {
    respond = store({ base: "USD", accounts: 0, budgetLines: 4 });
    const result = await updateUserPreferences({ base_currency: "EUR" });
    expect(result).toEqual({ error: expect.stringContaining("no se puede cambiar") });
    expect(upserts()).toHaveLength(0);
  });

  it("changes the base currency while there is nothing stored in it", async () => {
    respond = store({ base: "USD", accounts: 0, budgetLines: 0 });
    expect(await updateUserPreferences({ base_currency: "EUR" })).toEqual({
      data: { base_currency: "EUR", fx_source: "frankfurter", base_currency_locked: false },
    });
  });

  it("refuses a crypto base currency", async () => {
    respond = store({ base: "USD", accounts: 0, budgetLines: 0 });
    expect(await updateUserPreferences({ base_currency: "BTC" })).toEqual({
      error: "La moneda base tiene que ser una moneda fiat.",
    });
    expect(upserts()).toHaveLength(0);
  });

  it("still saves other preferences with data present", async () => {
    respond = store({ base: "USD", accounts: 3, budgetLines: 0 });
    expect(await updateUserPreferences({ base_currency: "USD", fx_source: "manual" })).toEqual({
      data: { base_currency: "USD", fx_source: "manual", base_currency_locked: true },
    });
  });
});
