import { describe, expect, it } from "vitest";

import type { TransactionWithRelations } from "@/types/transactions";
import { netInvestmentContributions } from "./investment-contributions";

const tx = (transaction_type: string, baseAmounts: number[]) =>
  ({
    transaction_type,
    amounts: baseAmounts.map((base_amount) => ({ base_amount })),
  }) as unknown as TransactionWithRelations;

describe("netInvestmentContributions", () => {
  it("counts contributions minus withdrawals, in base currency", () => {
    expect(netInvestmentContributions([tx("investment", [-1000]), tx("investment", [250])])).toBe(750);
  });

  it("ignores every other movement", () => {
    expect(netInvestmentContributions([tx("expense", [-80]), tx("transfer", [-500, 500])])).toBe(0);
  });
});
