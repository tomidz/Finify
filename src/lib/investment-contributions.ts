import type { TransactionWithRelations } from "@/types/transactions";

/**
 * Cash put into investments in a set of transactions, in the base currency:
 * purchase debits minus sale credits (and cash fees of moving a position). A
 * swap between assets moves no cash and adds nothing; neither does a lot's
 * cost, which for a swapped or adjusted lot was never paid in cash.
 */
export function netInvestmentContributions(transactions: readonly TransactionWithRelations[]): number {
  return transactions
    .filter((tx) => tx.transaction_type === "investment")
    .flatMap((tx) => tx.amounts)
    .reduce((sum, leg) => sum - leg.base_amount, 0);
}
