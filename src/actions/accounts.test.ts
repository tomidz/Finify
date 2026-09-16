import { beforeEach, describe, expect, it, vi } from "vitest";

import { argsOf, fakeSupabase, type RecordedQuery } from "../../tests/support/fake-supabase";

type Response = { data: unknown; error: { code: string; message?: string } | null; count?: number | null };

let respond: (query: RecordedQuery) => Response;
const fake = fakeSupabase((query) => respond(query), { userId: "user-1" });
const recalculateOpeningBalances = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("@/lib/server/opening-balances", () => ({
  RECALCULATION_FAILED: "Guardado, pero no se pudieron recalcular los saldos.",
  recalculateOpeningBalances: (...args: unknown[]) => recalculateOpeningBalances(...args),
}));
vi.mock("@/lib/server/fx", () => ({ getOrFetchFxRate: async () => ({ data: 1 }) }));

const { createAccount, updateAccount } = await import("./accounts");

const ACCOUNT_ID = "6f1b3f5e-8a4b-4b8e-9d2e-0a1b2c3d4e5f";
const has = (query: RecordedQuery, method: string) => argsOf(query, method) !== undefined;

type Stored = { currency?: string; initial_amount?: number | null; initial_base_amount?: number | null };

function ledger(options: { stored?: Stored; historyCount?: number }) {
  const stored = {
    currency: "USD",
    initial_amount: null,
    initial_base_amount: null,
    ...options.stored,
  };
  return (query: RecordedQuery): Response => {
    if (query.table === "accounts" && (has(query, "update") || has(query, "insert"))) {
      return { data: { id: ACCOUNT_ID, currency: stored.currency }, error: null };
    }
    if (query.table === "accounts") return { data: stored, error: null };
    if (["transaction_amounts", "investments", "investment_sales", "recurring_transactions"].includes(query.table)) {
      return { data: null, error: null, count: query.table === "transaction_amounts" ? (options.historyCount ?? 0) : 0 };
    }
    if (query.table === "user_preferences") return { data: { base_currency: "USD" }, error: null };
    throw new Error(`unexpected query on ${query.table}`);
  };
}

const accountWrites = (method: "update" | "insert") =>
  fake.queries.filter((q) => q.table === "accounts" && has(q, method)).map((q) => argsOf(q, method)?.[0]);

beforeEach(() => {
  fake.queries.length = 0;
  recalculateOpeningBalances.mockReset().mockResolvedValue({ data: null });
});

describe("createAccount", () => {
  it("stores the initial balance on the account and rebuilds every month", async () => {
    respond = ledger({});
    const result = await createAccount({ name: "Banco", account_type: "bank", currency: "USD", initial_amount: 500 });
    expect(result).toEqual({ data: expect.objectContaining({ id: ACCOUNT_ID }) });
    expect(accountWrites("insert")).toEqual([
      expect.objectContaining({ initial_amount: 500, initial_base_amount: 500, initial_base_currency: "USD" }),
    ]);
    expect(recalculateOpeningBalances).toHaveBeenCalledWith(null);
    expect(fake.queries.some((q) => q.table === "opening_balances")).toBe(false);
  });

  it("reports a failed rebuild after the account is saved", async () => {
    respond = ledger({});
    recalculateOpeningBalances.mockResolvedValue({ error: "timeout" });
    const result = await createAccount({ name: "Banco", account_type: "bank", currency: "USD" });
    expect(accountWrites("insert")).toHaveLength(1);
    expect(result).toEqual({ error: expect.stringContaining("no se pudieron recalcular") });
  });
});

describe("updateAccount", () => {
  it("refuses a currency change once the account has movements", async () => {
    respond = ledger({ stored: { currency: "ARS" }, historyCount: 3 });
    const result = await updateAccount({ id: ACCOUNT_ID, name: "Banco", currency: "USD" });
    expect(result).toEqual({ error: expect.stringContaining("No se puede cambiar la moneda") });
    expect(accountWrites("update")).toHaveLength(0);
  });

  it("refuses a currency change on an account with an initial balance", async () => {
    respond = ledger({ stored: { currency: "ARS", initial_amount: 100, initial_base_amount: 1 } });
    const result = await updateAccount({ id: ACCOUNT_ID, name: "Banco", currency: "USD" });
    expect(result).toEqual({ error: expect.stringContaining("No se puede cambiar la moneda") });
    expect(accountWrites("update")).toHaveLength(0);
  });

  it("allows a currency change on an account without history", async () => {
    respond = ledger({ stored: { currency: "ARS" }, historyCount: 0 });
    const result = await updateAccount({ id: ACCOUNT_ID, name: "Banco", currency: "USD" });
    expect(result).toEqual({ data: expect.objectContaining({ id: ACCOUNT_ID }) });
    expect(accountWrites("update")).toHaveLength(1);
  });

  it("does not look for history when the currency stays the same", async () => {
    respond = ledger({ stored: { currency: "USD" } });
    await updateAccount({ id: ACCOUNT_ID, name: "Banco", currency: "USD" });
    expect(fake.queries.some((q) => q.table === "transaction_amounts")).toBe(false);
  });

  it("leaves balances alone when no balance is sent", async () => {
    respond = ledger({});
    await updateAccount({ id: ACCOUNT_ID, name: "Nuevo nombre" });
    expect(accountWrites("update")).toEqual([{ name: "Nuevo nombre" }]);
    expect(recalculateOpeningBalances).not.toHaveBeenCalled();
  });

  it("rewrites nothing when the balance sent equals the stored one", async () => {
    respond = ledger({ stored: { initial_amount: 1000, initial_base_amount: 1000 } });
    await updateAccount({ id: ACCOUNT_ID, initial_amount: 1000, base_amount: 1000, exchange_rate: 1 });
    expect(accountWrites("update")).toEqual([{}]);
    expect(recalculateOpeningBalances).not.toHaveBeenCalled();
  });

  it("stores a new balance on the account and reports a failed rebuild", async () => {
    respond = ledger({ stored: { initial_amount: 1000, initial_base_amount: 1000 } });
    recalculateOpeningBalances.mockResolvedValue({ error: "timeout" });
    const result = await updateAccount({ id: ACCOUNT_ID, initial_amount: 1200, base_amount: 1200, exchange_rate: 1 });
    expect(accountWrites("update")).toEqual([
      { initial_amount: 1200, initial_base_amount: 1200, initial_base_currency: "USD" },
    ]);
    expect(recalculateOpeningBalances).toHaveBeenCalledWith(null);
    expect(result).toEqual({ error: expect.stringContaining("no se pudieron recalcular") });
  });
});
