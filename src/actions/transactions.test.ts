import { beforeEach, describe, expect, it, vi } from "vitest";

import { argsOf, fakeSupabase, type RecordedQuery } from "../../tests/support/fake-supabase";

type Response = { data: unknown; error: { code: string; message: string } | null };

let respond: (query: RecordedQuery) => Response;
const fake = fakeSupabase((query) => respond(query), { userId: "user-1" });

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("@/lib/server/fx", () => ({ getOrFetchFxRate: async () => ({ data: 1 }) }));

const { createTransaction, deleteTransaction, updateTransaction } = await import("./transactions");

const TX_ID = "0b6a1f7e-3c2d-4e5f-8a9b-0c1d2e3f4a5b";
const ACCOUNT_ID = "6f1b3f5e-8a4b-4b8e-9d2e-0a1b2c3d4e5f";
const CATEGORY_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const rpcCalls = (name: string) =>
  fake.queries.filter((q) => q.table === `rpc:${name}`).map((q) => argsOf(q, "rpc")?.[0]);

beforeEach(() => {
  fake.queries.length = 0;
});

describe("createTransaction", () => {
  it("sends an expense as one negative leg and returns its id", async () => {
    respond = () => ({ data: TX_ID, error: null });
    const result = await createTransaction({
      date: "2026-03-10",
      transaction_type: "expense",
      category_id: CATEGORY_ID,
      description: "Super",
      amounts: [{ account_id: ACCOUNT_ID, amount: 50, exchange_rate: 1, base_amount: 50 }],
    });
    expect(result).toEqual({ data: { id: TX_ID } });
    expect(rpcCalls("save_ledger_transaction")).toEqual([
      {
        p_header: {
          transaction_type: "expense",
          date: "2026-03-10",
          description: "Super",
          category_id: CATEGORY_ID,
          notes: null,
          fee: 0,
        },
        p_legs: [{ account_id: ACCOUNT_ID, amount: -50, exchange_rate: 1, base_amount: -50 }],
        p_id: undefined,
      },
    ]);
  });

  it("shows the message the function raises for the user", async () => {
    respond = () => ({ data: null, error: { code: "P0001", message: "Categoría no encontrada" } });
    const result = await createTransaction({
      date: "2026-03-10",
      transaction_type: "income",
      category_id: CATEGORY_ID,
      description: "Sueldo",
      amounts: [{ account_id: ACCOUNT_ID, amount: 10, exchange_rate: 1, base_amount: 10 }],
    });
    expect(result).toEqual({ error: "Categoría no encontrada" });
  });

  it("hides any other database error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    respond = () => ({ data: null, error: { code: "XX000", message: "could not read block 7 of relation 1663/5/16384" } });
    const result = await createTransaction({
      date: "2026-03-10",
      transaction_type: "income",
      category_id: CATEGORY_ID,
      description: "Sueldo",
      amounts: [{ account_id: ACCOUNT_ID, amount: 10, exchange_rate: 1, base_amount: 10 }],
    });
    expect(result).toEqual({ error: "No se pudo guardar la transacción" });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("updateTransaction", () => {
  it("keeps the stored fields and legs that the edit leaves out", async () => {
    respond = (query) => {
      if (query.table === "transactions") {
        return {
          data: {
            id: TX_ID,
            transaction_type: "expense",
            date: "2026-03-10",
            fee: 0,
            category_id: CATEGORY_ID,
            description: "Super",
            notes: "semanal",
          },
          error: null,
        };
      }
      if (query.table === "transaction_amounts") {
        return {
          data: [{ account_id: ACCOUNT_ID, amount: -50, exchange_rate: 1, base_amount: -50 }],
          error: null,
        };
      }
      return { data: TX_ID, error: null };
    };
    const result = await updateTransaction({ id: TX_ID, description: "Supermercado" });
    expect(result).toEqual({ data: { id: TX_ID } });
    expect(rpcCalls("save_ledger_transaction")).toEqual([
      {
        p_header: {
          transaction_type: "expense",
          date: "2026-03-10",
          description: "Supermercado",
          category_id: CATEGORY_ID,
          notes: "semanal",
          fee: 0,
        },
        p_legs: [{ account_id: ACCOUNT_ID, amount: -50, exchange_rate: 1, base_amount: -50 }],
        p_id: TX_ID,
      },
    ]);
  });

  it("reports a failed read as a failure, not as a missing transaction", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    respond = (query) =>
      query.table === "transactions"
        ? { data: null, error: { code: "XX000", message: "internal error on row 42" } }
        : { data: [], error: null };
    const result = await updateTransaction({ id: TX_ID, description: "Supermercado" });
    expect(result).toEqual({ error: "No se pudo leer la transacción" });
    expect(rpcCalls("save_ledger_transaction")).toEqual([]);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("deleteTransaction", () => {
  it("soft-deletes through the database function", async () => {
    respond = () => ({ data: null, error: null });
    expect(await deleteTransaction(TX_ID)).toEqual({ data: null });
    expect(rpcCalls("set_ledger_transaction_deleted")).toEqual([{ p_id: TX_ID, p_deleted: true }]);
  });
});
