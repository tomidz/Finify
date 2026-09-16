export type SignedTransactionType = "income" | "expense" | "correction";

/**
 * Income is stored positive and expense negative whatever sign the input had;
 * a correction keeps its sign because it moves the balance either way.
 */
export function normalizeSignedAmount(transactionType: SignedTransactionType, value: number): number {
  if (transactionType === "income") return Math.abs(value);
  if (transactionType === "expense") return -Math.abs(value);
  return value;
}
