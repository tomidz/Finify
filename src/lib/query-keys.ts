import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Cached reads computed from the ledger: movements, balances, budget actuals,
 * net worth, goals linked to an account and the screens that bundle them. Any
 * write to the ledger (or to the accounts, months, categories and debts those
 * reads embed) stales all of them. Catalogs (currencies, rules) and market
 * prices are not derived from the ledger and stay cached.
 */
export const LEDGER_DERIVED_KEYS: readonly QueryKey[] = [
  ["transactions"],
  ["months"],
  ["accounts"],
  ["account"],
  ["accountInitialBalance"],
  ["budget", "lines"],
  ["budget", "summary"],
  ["budget", "summary-range"],
  ["net-worth"],
  ["debt-activities"],
  ["recurring", "pending"],
  ["dashboard"],
  ["ledger-drift"],
  ["savings-goals"],
];

/** Reads that compare the budget plan with actuals. */
export const BUDGET_PLAN_DERIVED_KEYS: readonly QueryKey[] = [
  ["budget", "lines"],
  ["budget", "summary"],
  ["budget", "summary-range"],
  ["dashboard"],
];

function invalidateAll(queryClient: QueryClient, keys: readonly QueryKey[]) {
  return Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

export function invalidateLedger(queryClient: QueryClient) {
  return invalidateAll(queryClient, LEDGER_DERIVED_KEYS);
}

export function invalidateBudgetPlan(queryClient: QueryClient) {
  return invalidateAll(queryClient, BUDGET_PLAN_DERIVED_KEYS);
}

/** The forecast only ships inside the dashboard payload. */
export function invalidateForecast(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ["dashboard"] });
}
