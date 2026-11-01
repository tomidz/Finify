import type { TransactionWithRelations } from "@/types/transactions";

/**
 * Cash put into investments in a set of transactions, in the base currency:
 * what was sent to a broker minus what came back from it.
 */
export function netInvestmentContributions(transactions: readonly TransactionWithRelations[]): number {
  return transactions
    .filter((tx) => tx.transaction_type === "investment")
    .flatMap((tx) => tx.amounts)
    .reduce((sum, leg) => sum - leg.base_amount, 0);
}
