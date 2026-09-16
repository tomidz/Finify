/** Sortable integer for a calendar month: 2026-09 → 202609. */
export function toYearMonthCode(year: number, month: number): number {
  return year * 100 + month;
}
