/** Sortable integer for a calendar month: 2026-09 → 202609. */
export function toYearMonthCode(year: number, month: number): number {
  return year * 100 + month;
}

type YearMonth = { year: number; month: number };

/**
 * The month a screen opens on: the current one, else the latest before it. A
 * month created ahead (a budget for next month, a future-dated transaction)
 * is never the default while an earlier one exists.
 */
export function defaultMonth<T extends YearMonth>(months: readonly T[], current: YearMonth): T | null {
  const currentCode = toYearMonthCode(current.year, current.month);
  const code = (m: YearMonth) => toYearMonthCode(m.year, m.month);
  const pastOrCurrent = months.filter((m) => code(m) <= currentCode);
  const candidates = pastOrCurrent.length > 0 ? pastOrCurrent : months;
  const pick = pastOrCurrent.length > 0 ? Math.max : Math.min;
  const target = pick(...candidates.map(code));
  return candidates.find((m) => code(m) === target) ?? null;
}
