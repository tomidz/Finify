import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { invalidateBudgetPlan, invalidateLedger } from "./query-keys";

function seeded(keys: QueryKey[]) {
  const client = new QueryClient();
  for (const key of keys) client.setQueryData(key, { seeded: true });
  return client;
}

const isStale = (client: QueryClient, key: QueryKey) =>
  client.getQueryState(key)?.isInvalidated ?? false;

describe("invalidateLedger", () => {
  const ledgerReads: QueryKey[] = [
    ["dashboard", "latest", "latest"],
    ["net-worth", "screen", 2026],
    ["net-worth", "items"],
    ["transactions", "month", "m1"],
    ["months"],
    ["opening-balances", "m1"],
    ["accounts"],
    ["account", "a1", "current-balance"],
    ["budget", "summary", "m1"],
    ["debt-activities", "d1"],
    ["recurring", "pending", 2026, 9],
    ["ledger-drift"],
    ["savings-goals"],
  ];
  const untouched: QueryKey[] = [
    ["currencies"],
    ["budget", "categories"],
    ["investments", "prices", "USD", "BTC"],
    ["investments", "valuation", 2026],
    ["recurring"],
    ["rules"],
  ];

  it("stales every read derived from the ledger and nothing else", async () => {
    const client = seeded([...ledgerReads, ...untouched]);
    await invalidateLedger(client);
    for (const key of ledgerReads) expect(isStale(client, key), JSON.stringify(key)).toBe(true);
    for (const key of untouched) expect(isStale(client, key), JSON.stringify(key)).toBe(false);
  });
});

describe("invalidateBudgetPlan", () => {
  it("stales plan-vs-actual reads, including the dashboard", async () => {
    const client = seeded([
      ["budget", "lines", "m1"],
      ["budget", "summary-range", "m1", "m3"],
      ["dashboard", "m1", "m3"],
      ["transactions", "month", "m1"],
    ]);
    await invalidateBudgetPlan(client);
    expect(isStale(client, ["budget", "lines", "m1"])).toBe(true);
    expect(isStale(client, ["budget", "summary-range", "m1", "m3"])).toBe(true);
    expect(isStale(client, ["dashboard", "m1", "m3"])).toBe(true);
    expect(isStale(client, ["transactions", "month", "m1"])).toBe(false);
  });
});
