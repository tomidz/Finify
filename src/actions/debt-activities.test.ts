import { beforeEach, describe, expect, it, vi } from "vitest";

import { argsOf, fakeSupabase, type RecordedQuery } from "../../tests/support/fake-supabase";

type Response = { data: unknown; error: { code: string; message: string } | null };

let respond: (query: RecordedQuery) => Response;
const fake = fakeSupabase((query) => respond(query), { userId: "user-1" });
const RATES: Record<string, number> = { "ARS:USD": 0.001, "ARS:EUR": 0.0009, "EUR:USD": 1.1 };

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("@/lib/server/fx", () => ({
  getOrFetchFxRate: async ({ from, to }: { from: string; to: string }) =>
    RATES[`${from}:${to}`] != null ? { data: RATES[`${from}:${to}`] } : { error: "sin cotización" },
}));

const { recordDebtPayment } = await import("./debt-activities");

const DEBT_ID = "0b6a1f7e-3c2d-4e5f-8a9b-0c1d2e3f4a5b";
const ACCOUNT_ID = "6f1b3f5e-8a4b-4b8e-9d2e-0a1b2c3d4e5f";
const CATEGORY_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

function store(debtCurrency: string, accountCurrency: string) {
  return (query: RecordedQuery): Response => {
    if (query.table === "nw_items") return { data: { id: DEBT_ID, currency: debtCurrency }, error: null };
    if (query.table === "accounts") return { data: { currency: accountCurrency }, error: null };
    if (query.table === "user_preferences") return { data: { base_currency: "USD" }, error: null };
    if (query.table === "rpc:record_debt_payment") return { data: "activity-1", error: null };
    throw new Error(`unexpected query on ${query.table}`);
  };
}

const payment = { nw_item_id: DEBT_ID, date: "2026-03-10", amount: 100000, account_id: ACCOUNT_ID, category_id: CATEGORY_ID, description: "Cuota" };

beforeEach(() => {
  fake.queries.length = 0;
});

describe("recordDebtPayment", () => {
  it("records the expense in the account's currency and the balance change in the debt's", async () => {
    respond = store("EUR", "ARS");
    const result = await recordDebtPayment(payment);
    expect(result).toEqual({ data: { id: "activity-1" } });

    const args = argsOf(fake.queries.find((q) => q.table === "rpc:record_debt_payment")!, "rpc")?.[0] as Record<string, unknown>;
    expect(args.p_leg).toEqual({ account_id: ACCOUNT_ID, amount: -100000, exchange_rate: 0.001, base_amount: -100 });
    expect(args.p_debt_amount).toBeCloseTo(90);
    expect(args.p_debt_rate).toBe(1.1);
    expect(args.p_header).toMatchObject({ transaction_type: "expense", date: "2026-03-10", category_id: CATEGORY_ID });
  });

  it("records nothing when the base currency cannot be read", async () => {
    const stored = store("EUR", "ARS");
    respond = (query) =>
      query.table === "user_preferences" ? { data: null, error: { code: "57014", message: "timeout" } } : stored(query);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await recordDebtPayment(payment);
    log.mockRestore();
    expect(result).toEqual({ error: expect.any(String) });
    expect(fake.queries.some((q) => q.table === "rpc:record_debt_payment")).toBe(false);
  });

  it("records nothing when a rate is missing", async () => {
    respond = store("BRL", "ARS");
    const result = await recordDebtPayment(payment);
    expect(result).toEqual({ error: "No se pudo obtener el tipo de cambio para la deuda" });
    expect(fake.queries.some((q) => q.table === "rpc:record_debt_payment")).toBe(false);
  });
});
