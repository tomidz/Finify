import { describe, expect, it } from "vitest";

import {
  chainOpeningBalances,
  type ChainMonth,
  type ChainMovement,
  type ChainOpening,
} from "./opening-balance-chain";
import { roundLikeNumeric } from "./decimal";

// What the database keeps for a written opening (see decimal.test.ts).
const toStored = (value: number) => roundLikeNumeric(value, 8);

/**
 * The month-by-month algorithm this replaces, run against an in-memory copy
 * of the tables: read the previous month's stored openings, add its
 * movements, upsert the active accounts, move on.
 */
function sequentialReference(input: {
  months: ChainMonth[];
  baseMonthId: string;
  stored: Map<string, Map<string, { amount: number; base: number }>>;
  movements: ChainMovement[];
  activeAccountIds: string[];
}) {
  const stored = new Map(
    [...input.stored].map(([monthId, rows]) => [monthId, new Map(rows)]),
  );
  const base = input.months.find((m) => m.id === input.baseMonthId)!;
  const code = (m: ChainMonth) => m.year * 100 + m.month;
  const written: { month_id: string; account_id: string; opening_amount: number; opening_base_amount: number }[] = [];

  for (const month of input.months.filter((m) => code(m) > code(base))) {
    const prev = input.months.filter((m) => code(m) < code(month)).pop()!;
    const byAccount = new Map(stored.get(prev.id) ?? []);
    for (const mv of input.movements.filter((m) => m.month_id === prev.id)) {
      const cur = byAccount.get(mv.account_id) ?? { amount: 0, base: 0 };
      byAccount.set(mv.account_id, { amount: cur.amount + mv.amount, base: cur.base + mv.base_amount });
    }
    const monthRows = stored.get(month.id) ?? new Map();
    for (const accountId of input.activeAccountIds) {
      const v = byAccount.get(accountId) ?? { amount: 0, base: 0 };
      const row = { amount: toStored(v.amount), base: toStored(v.base) };
      monthRows.set(accountId, row);
      written.push({ month_id: month.id, account_id: accountId, opening_amount: row.amount, opening_base_amount: row.base });
    }
    stored.set(month.id, monthRows);
  }
  return written;
}

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

describe("chainOpeningBalances", () => {
  it("carries openings and movements forward, only for active accounts", () => {
    const months: ChainMonth[] = [
      { id: "jan", year: 2026, month: 1 },
      { id: "feb", year: 2026, month: 2 },
      { id: "apr", year: 2026, month: 4 }, // gap: March was never created
    ];
    const rows = chainOpeningBalances({
      months,
      baseMonthId: "jan",
      baseOpenings: [
        { account_id: "cash", opening_amount: 100, opening_base_amount: 100 },
        { account_id: "old", opening_amount: 50, opening_base_amount: 50 },
      ],
      movements: [
        { month_id: "jan", account_id: "cash", amount: -30, base_amount: -30 },
        { month_id: "jan", account_id: "bank", amount: 10.123456789, base_amount: 9 },
        { month_id: "feb", account_id: "cash", amount: 5, base_amount: 5 },
      ],
      activeAccountIds: ["cash", "bank"],
    });

    expect(rows).toEqual([
      { month_id: "feb", account_id: "cash", opening_amount: 70, opening_base_amount: 70 },
      { month_id: "feb", account_id: "bank", opening_amount: 10.12345679, opening_base_amount: 9 },
      { month_id: "apr", account_id: "cash", opening_amount: 75, opening_base_amount: 75 },
      { month_id: "apr", account_id: "bank", opening_amount: 10.12345679, opening_base_amount: 9 },
    ]);
  });

  it("writes nothing for the latest month or without active accounts", () => {
    const months: ChainMonth[] = [{ id: "jan", year: 2026, month: 1 }];
    expect(
      chainOpeningBalances({ months, baseMonthId: "jan", baseOpenings: [], movements: [], activeAccountIds: ["a"] }),
    ).toEqual([]);
    expect(
      chainOpeningBalances({
        months: [...months, { id: "feb", year: 2026, month: 2 }],
        baseMonthId: "jan",
        baseOpenings: [],
        movements: [],
        activeAccountIds: [],
      }),
    ).toEqual([]);
  });

  it("matches the month-by-month algorithm on random ledgers", () => {
    const random = seededRandom(20260916);
    const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];

    for (let run = 0; run < 300; run++) {
      const accounts = ["a", "b", "c", "d"].slice(0, 1 + Math.floor(random() * 4));
      const activeAccountIds = accounts.filter(() => random() < 0.8);

      const months: ChainMonth[] = [];
      let year = 2024;
      let month = 1;
      const monthCount = 1 + Math.floor(random() * 14);
      for (let i = 0; i < monthCount; i++) {
        months.push({ id: `m${i}`, year, month });
        month += 1 + (random() < 0.2 ? 1 : 0); // occasional gap
        if (month > 12) {
          month -= 12;
          year += 1;
        }
      }

      const amount = () => Number(((random() - 0.5) * 10 ** (1 + Math.floor(random() * 8))).toFixed(8));
      const stored = new Map<string, Map<string, { amount: number; base: number }>>();
      for (const m of months) {
        const rows = new Map<string, { amount: number; base: number }>();
        for (const accountId of accounts) {
          if (random() < 0.7) rows.set(accountId, { amount: amount(), base: amount() });
        }
        stored.set(m.id, rows);
      }
      const movements: ChainMovement[] = [];
      for (const m of months) {
        const count = Math.floor(random() * 6);
        for (let i = 0; i < count; i++) {
          movements.push({ month_id: m.id, account_id: pick(accounts), amount: amount(), base_amount: amount() });
        }
      }
      const base = pick(months);
      const baseOpenings: ChainOpening[] = [...(stored.get(base.id) ?? [])].map(([account_id, v]) => ({
        account_id,
        opening_amount: v.amount,
        opening_base_amount: v.base,
      }));

      const expected = sequentialReference({ months, baseMonthId: base.id, stored, movements, activeAccountIds });
      const actual = chainOpeningBalances({ months, baseMonthId: base.id, baseOpenings, movements, activeAccountIds });
      expect(actual, `run ${run}`).toEqual(expected);
    }
  });
});
