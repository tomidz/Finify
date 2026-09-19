import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { TransactionWithRelations } from "@/types/transactions";

import { fakeSupabase } from "../../../tests/support/fake-supabase";

/*
 * Level-0 evals of the AI CFO: what the model is told (instructions and tool
 * schemas, as snapshots a change has to update on purpose) and what the tools
 * answer, with the reads they call mocked.
 */

const getTransactionsForRange = vi.fn();
const getBudgetSummaryVsActual = vi.fn();
vi.mock("@/actions/transactions", () => ({
  getTransactionsForRange: (...args: unknown[]) => getTransactionsForRange(...args),
}));
vi.mock("@/actions/budget", () => ({
  getBudgetSummaryVsActual: (...args: unknown[]) => getBudgetSummaryVsActual(...args),
}));
vi.mock("@/actions/accounts", () => ({ getAccounts: vi.fn(), getAccountCurrentBalance: vi.fn() }));
vi.mock("@/actions/investments", () => ({ getInvestments: vi.fn(), getInvestmentSales: vi.fn() }));
vi.mock("@/actions/recurring", () => ({ getPendingRecurring: vi.fn() }));
vi.mock("@/actions/savings-goals", () => ({ getSavingsGoals: vi.fn() }));
vi.mock("@/lib/server/forecast", () => ({ loadForecast: vi.fn() }));
vi.mock("@/lib/server/fx", () => ({ getFxQuote: vi.fn() }));
vi.mock("@/lib/server/investment-valuation", () => ({ loadInvestmentValuation: vi.fn() }));
vi.mock("@/lib/server/net-worth", () => ({
  loadAccountNetWorth: vi.fn(),
  loadLiabilitiesForYear: vi.fn(),
  loadNetWorthEvolution: vi.fn(),
  warmCloseRates: vi.fn(),
}));
vi.mock("@/lib/server/period-summary", () => ({ loadPeriodSummary: vi.fn() }));

const { buildContext, createAicfoAgent, RULES } = await import("./aicfo-agent");
const { createAicfoTools, MAX_TRANSACTION_ROWS } = await import("./aicfo-tools");
const { checkAiLimits } = await import("./chat-store");
const { estimateCostUsd } = await import("./model");

const month = (id: string, year: number, m: number) => ({
  id,
  user_id: "u",
  year,
  month: m,
  created_at: "",
  updated_at: "",
});
const months = [month("m-2025-01", 2025, 1), month("m-2026-08", 2026, 8), month("m-2026-09", 2026, 9)];
const ctx = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: { supabase: {} as any, userId: "u" },
  baseCurrency: "USD",
  months,
};
// 2026-09-18 12:00 in Buenos Aires.
const NOW = new Date("2026-09-18T15:00:00Z");

function tx(type: TransactionWithRelations["transaction_type"], legs: number[], category?: string): TransactionWithRelations {
  return {
    id: `t${Math.random()}`,
    user_id: "u",
    month_id: "m-2026-09",
    category_id: category ?? null,
    transaction_type: type,
    date: "2026-09-10",
    description: "d",
    notes: null,
    fee: 0,
    created_at: "",
    updated_at: "",
    category_name: category ?? null,
    category_type: category ? (type === "income" ? "income" : "essential_expenses") : null,
    amounts: legs.map((amount, i) => ({
      id: `l${i}`,
      transaction_id: "t",
      account_id: "a",
      amount,
      original_currency: "USD",
      exchange_rate: 1,
      base_amount: amount,
      created_at: "",
      account_name: "Banco",
      account_currency_symbol: "US$",
    })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (tool: any, input: unknown) => tool.execute(input, { toolCallId: "c", messages: [] });

describe("what the model is told", () => {
  it("keeps the rules and the context", () => {
    expect(RULES).toMatchSnapshot();
    expect(buildContext(ctx, NOW)).toMatchSnapshot();
  });

  it("keeps the tools and their input schemas", () => {
    const tools = createAicfoTools(ctx);
    const described = Object.entries(tools).map(([name, definition]) => ({
      name,
      description: definition.description,
      input: z.toJSONSchema(definition.inputSchema as z.ZodType),
    }));
    expect(described).toMatchSnapshot();
  });
});

describe("get_transactions", () => {
  beforeEach(() => getTransactionsForRange.mockReset());

  it("totals the whole range without transfers, and cuts only the rows", async () => {
    const rows = [
      ...Array.from({ length: MAX_TRANSACTION_ROWS }, () => tx("expense", [-1], "groceries")),
      tx("income", [500], "salary"),
      tx("transfer", [-105, 100]),
      tx("investment", [-50]),
    ];
    getTransactionsForRange.mockResolvedValue({ data: rows });

    const result = await run(createAicfoTools(ctx).get_transactions, {
      startMonthId: "m-2026-08",
      endMonthId: "m-2026-09",
    });

    expect(result.count).toBe(MAX_TRANSACTION_ROWS + 3);
    expect(result.truncated).toBe(true);
    expect(result.transactions).toHaveLength(MAX_TRANSACTION_ROWS);
    expect(result.totals).toEqual({ income: 500, expenses: MAX_TRANSACTION_ROWS, other: -50 });
  });

  it("refuses more than a year before reading anything", async () => {
    const result = await run(createAicfoTools(ctx).get_transactions, {
      startMonthId: "m-2025-01",
      endMonthId: "m-2026-09",
    });
    expect(result).toEqual({ error: "El rango tiene 21 meses; pedí como máximo 12." });
    expect(getTransactionsForRange).not.toHaveBeenCalled();
  });

  it("points at get_months for an unknown month", async () => {
    const result = await run(createAicfoTools(ctx).get_transactions, { startMonthId: "x", endMonthId: "m-2026-09" });
    expect(result).toEqual({ error: "Mes no encontrado: usá los ids de get_months." });
  });

  it("passes a failed read on in one fixed phrase", async () => {
    getTransactionsForRange.mockResolvedValue({ error: "timeout" });
    const result = await run(createAicfoTools(ctx).get_transactions, {
      startMonthId: "m-2026-09",
      endMonthId: "m-2026-09",
    });
    expect(result).toEqual({ error: "No se pudo leer los movimientos: timeout" });
  });
});

describe("the agent's tools", () => {
  it("answer the same question once per turn", async () => {
    getTransactionsForRange.mockReset().mockResolvedValue({ data: [] });
    const { tools } = createAicfoAgent(ctx);
    const input = { startMonthId: "m-2026-09", endMonthId: "m-2026-09" };
    await run(tools.get_transactions, input);
    await run(tools.get_transactions, input);
    await run(tools.get_transactions, { startMonthId: "m-2026-08", endMonthId: "m-2026-09" });
    expect(getTransactionsForRange).toHaveBeenCalledTimes(2);
  });
});

describe("get_budget_summary", () => {
  it("judges each category by its purpose", async () => {
    getBudgetSummaryVsActual.mockResolvedValue({
      data: {
        totals: {},
        categories: [
          { category_name: "Súper", category_type: "essential_expenses", planned_amount: 100, actual_amount: 120, variance: -20 },
          { category_name: "Sueldo", category_type: "income", planned_amount: 1000, actual_amount: 1100, variance: -100 },
        ],
      },
    });
    const result = await run(createAicfoTools(ctx).get_budget_summary, { monthId: "m-2026-09" });
    expect(result.categories).toEqual([
      expect.objectContaining({ name: "Súper", status: "unfavorable", favorableVariance: -20 }),
      expect.objectContaining({ name: "Sueldo", status: "favorable", favorableVariance: 100 }),
    ]);
  });
});

describe("checkAiLimits", () => {
  it("blocks the turn when usage cannot be read", async () => {
    const fake = fakeSupabase(() => ({ data: null, error: { code: "57014", message: "timeout" }, count: null }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkAiLimits(fake.client as any, "u");
    expect(result).toMatchObject({ ok: false, status: 503, code: "usage_check_failed" });
  });
});

describe("estimateCostUsd", () => {
  it("bills cache reads at a tenth and cache writes at 1.25× the input price", () => {
    expect(
      estimateCostUsd({ inputTokens: 1_000_000, cachedInputTokens: 500_000, cacheWriteTokens: 250_000, outputTokens: 0 }),
    ).toBeCloseTo(0.25 * 5 + 0.5 * 0.5 + 0.25 * 6.25, 6);
  });
});
