import { roundLikeNumeric } from "@/lib/decimal";

export type ChainMonth = { id: string; year: number; month: number };

export type ChainOpening = {
  account_id: string;
  opening_amount: number;
  opening_base_amount: number;
};

export type ChainMovement = {
  month_id: string;
  account_id: string;
  amount: number;
  base_amount: number;
};

export type ChainOpeningRow = ChainOpening & { month_id: string };

// opening_balances columns are NUMERIC(18,8): the next month builds on the
// stored value, not on the unrounded sum.
const toStored = (value: number) => roundLikeNumeric(value, 8);

/**
 * Openings of every month after `baseMonthId`: each month opens with the
 * previous month's openings plus that month's movements. Only active accounts
 * get a row, and an account with nothing to carry opens at zero.
 *
 * `months` must be the user's months in chronological order, `baseOpenings`
 * the stored openings of the base month, and `movements` the non-deleted legs
 * of the base month and of every later month except the last.
 */
export function chainOpeningBalances(input: {
  months: ChainMonth[];
  baseMonthId: string;
  baseOpenings: ChainOpening[];
  movements: ChainMovement[];
  activeAccountIds: string[];
}): ChainOpeningRow[] {
  const baseIndex = input.months.findIndex((m) => m.id === input.baseMonthId);
  if (baseIndex < 0 || input.activeAccountIds.length === 0) return [];

  const movementsByMonth = new Map<string, ChainMovement[]>();
  for (const movement of input.movements) {
    const list = movementsByMonth.get(movement.month_id) ?? [];
    list.push(movement);
    movementsByMonth.set(movement.month_id, list);
  }

  let previous = new Map(
    input.baseOpenings.map((row) => [
      row.account_id,
      { amount: row.opening_amount, base: row.opening_base_amount },
    ]),
  );
  const rows: ChainOpeningRow[] = [];

  for (let i = baseIndex + 1; i < input.months.length; i++) {
    const running = new Map(previous);
    for (const movement of movementsByMonth.get(input.months[i - 1].id) ?? []) {
      const current = running.get(movement.account_id) ?? { amount: 0, base: 0 };
      running.set(movement.account_id, {
        amount: current.amount + movement.amount,
        base: current.base + movement.base_amount,
      });
    }

    const next = new Map<string, { amount: number; base: number }>();
    for (const accountId of input.activeAccountIds) {
      const values = running.get(accountId) ?? { amount: 0, base: 0 };
      const stored = { amount: toStored(values.amount), base: toStored(values.base) };
      next.set(accountId, stored);
      rows.push({
        month_id: input.months[i].id,
        account_id: accountId,
        opening_amount: stored.amount,
        opening_base_amount: stored.base,
      });
    }
    // Inactive accounts keep whatever was stored for them; it never reaches
    // an active account's row, so carrying only the written ones is enough.
    previous = next;
  }

  return rows;
}
