import { MONTH_NAMES } from "@/lib/format";
import { toYearMonthCode } from "@/lib/months";

/**
 * Pure model behind the month pickers: a year × 12 grid over the months the
 * user has (rows they created, not every calendar month).
 */

export type YearMonth = { year: number; month: number };

/** Anything with an id and a calendar month, e.g. a `Month` row. */
export type MonthOption = YearMonth & { id: string };

/** "Ene", "Feb", … (0-indexed like MONTH_NAMES). */
export const MONTH_SHORT_NAMES = MONTH_NAMES.map((name) => name.slice(0, 3));

const code = (m: YearMonth) => toYearMonthCode(m.year, m.month);

/** "Septiembre 2026". */
export function monthLabel(m: YearMonth): string {
  return `${MONTH_NAMES[m.month - 1]} ${m.year}`;
}

/** "Ene – Sep 2026", "Nov 2025 – Feb 2026", or "Septiembre 2026" for one month. */
export function rangeLabel(start: YearMonth, end: YearMonth): string {
  const [from, to] = code(start) <= code(end) ? [start, end] : [end, start];
  if (code(from) === code(to)) return monthLabel(from);
  const short = (m: YearMonth) => MONTH_SHORT_NAMES[m.month - 1];
  if (from.year === to.year) return `${short(from)} – ${short(to)} ${to.year}`;
  return `${short(from)} ${from.year} – ${short(to)} ${to.year}`;
}

/** Oldest first. */
export function sortMonths<T extends YearMonth>(months: readonly T[]): T[] {
  return [...months].sort((a, b) => code(a) - code(b));
}

/** Years that have at least one month, ascending. */
export function monthYears(months: readonly YearMonth[]): number[] {
  return [...new Set(months.map((m) => m.year))].sort((a, b) => a - b);
}

/** The nearest existing month before (-1) or after (1) the given one. */
export function adjacentMonth<T extends MonthOption>(
  months: readonly T[],
  id: string | null,
  direction: -1 | 1,
): T | null {
  const sorted = sortMonths(months);
  const index = sorted.findIndex((m) => m.id === id);
  if (index === -1) return null;
  return sorted[index + direction] ?? null;
}

/** The nearest year with months before (-1) or after (1) the given year. */
export function adjacentYear(years: readonly number[], year: number, direction: -1 | 1): number | null {
  const candidates = years.filter((y) => (direction === 1 ? y > year : y < year));
  if (candidates.length === 0) return null;
  return direction === 1 ? Math.min(...candidates) : Math.max(...candidates);
}

/** The year a grid opens on: the selection's, else the current one if it has months, else the latest. */
export function initialGridYear(
  months: readonly MonthOption[],
  selectedId: string | null | undefined,
  current: YearMonth,
): number {
  const selected = months.find((m) => m.id === selectedId);
  if (selected) return selected.year;
  const years = monthYears(months);
  if (years.length === 0 || years.includes(current.year)) return current.year;
  return years[years.length - 1];
}

export interface MonthGridCell<T extends MonthOption> {
  /** 1–12. */
  month: number;
  /** The existing month, or null when the user has no such month (disabled). */
  option: T | null;
  isCurrent: boolean;
  /** Start or end of the selection. */
  isEndpoint: boolean;
  /** Strictly between start and end. */
  isInRange: boolean;
}

/**
 * The 12 cells of one year. `start`/`end` are month ids in either order; a
 * single month passes only `start`. An unknown id is ignored.
 */
export function monthGridCells<T extends MonthOption>(
  months: readonly T[],
  year: number,
  selection: { start?: string | null; end?: string | null; current: YearMonth },
): MonthGridCell<T>[] {
  const byCode = new Map(months.map((m) => [code(m), m]));
  const find = (id: string | null | undefined) => (id == null ? undefined : months.find((m) => m.id === id));
  const first = find(selection.start) ?? find(selection.end);
  const second = find(selection.end) ?? first;
  const bounds =
    !first || !second
      ? null
      : ([Math.min(code(first), code(second)), Math.max(code(first), code(second))] as const);
  const currentCode = code(selection.current);

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const cellCode = toYearMonthCode(year, month);
    return {
      month,
      option: byCode.get(cellCode) ?? null,
      isCurrent: cellCode === currentCode,
      isEndpoint: bounds !== null && (cellCode === bounds[0] || cellCode === bounds[1]),
      isInRange: bounds !== null && cellCode > bounds[0] && cellCode < bounds[1],
    };
  });
}

/** Start and end ids in calendar order; unknown ids come back unchanged. */
export function orderRange(months: readonly MonthOption[], a: string, b: string): [string, string] {
  const first = months.find((m) => m.id === a);
  const second = months.find((m) => m.id === b);
  if (!first || !second) return [a, b];
  return code(first) <= code(second) ? [a, b] : [b, a];
}

export type RangePresetKey = "month" | "quarter" | "year" | "last-year";

export interface RangePreset<T extends MonthOption> {
  key: RangePresetKey;
  label: string;
  start: T;
  end: T;
}

/**
 * Shortcut ranges clamped to the months that exist inside each window; a
 * window with no months is left out.
 */
export function rangePresets<T extends MonthOption>(months: readonly T[], current: YearMonth): RangePreset<T>[] {
  const quarterStart = Math.floor((current.month - 1) / 3) * 3 + 1;
  const windows: Array<{ key: RangePresetKey; label: string; from: YearMonth; to: YearMonth }> = [
    { key: "month", label: "Este mes", from: current, to: current },
    {
      key: "quarter",
      label: "Este trimestre",
      from: { year: current.year, month: quarterStart },
      to: { year: current.year, month: quarterStart + 2 },
    },
    { key: "year", label: "Este año", from: { year: current.year, month: 1 }, to: { year: current.year, month: 12 } },
    {
      key: "last-year",
      label: "Año pasado",
      from: { year: current.year - 1, month: 1 },
      to: { year: current.year - 1, month: 12 },
    },
  ];
  const sorted = sortMonths(months);

  return windows.flatMap(({ key, label, from, to }) => {
    const inside = sorted.filter((m) => code(m) >= code(from) && code(m) <= code(to));
    if (inside.length === 0) return [];
    return [{ key, label, start: inside[0], end: inside[inside.length - 1] }];
  });
}

/** "2026-09": the id `calendarMonths` gives a month. */
export function monthKey(m: YearMonth): string {
  return `${m.year}-${String(m.month).padStart(2, "0")}`;
}

/**
 * Every calendar month from `from` to `to` (inclusive), for screens that
 * browse months the user never created. Ids are `monthKey`s.
 */
export function calendarMonths(from: YearMonth, to: YearMonth): MonthOption[] {
  const result: MonthOption[] = [];
  let { year, month } = from;
  while (toYearMonthCode(year, month) <= code(to)) {
    result.push({ id: monthKey({ year, month }), year, month });
    if (month === 12) {
      year += 1;
      month = 1;
    } else {
      month += 1;
    }
  }
  return result;
}
