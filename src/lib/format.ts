/**
 * Shared formatting utilities for Finify.
 * Used across BudgetPage, TransactionsTable, Dashboard, etc.
 */

/** Month names in Spanish (0-indexed: MONTH_NAMES[0] = "Enero") */
export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

const amountFormatters = new Map<number, Intl.NumberFormat>();

/** Format a number as es-AR currency (dot thousands, comma decimals, `decimals` places, 2 by default). */
export function formatAmount(value: number, decimals = 2): string {
  let formatter = amountFormatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    amountFormatters.set(decimals, formatter);
  }
  // Anything that rounds to 0 at the shown decimals (incl. -0 and tiny float
  // drift) is shown as "0,00", never "-0,00". (signDisplay "negative" would do
  // it, but Firefox before 116 throws on it.)
  const text = formatter.format(value);
  return /^-0(,0*)?$/.test(text) ? text.slice(1) : text;
}

/** "dd/mm" for a yyyy-MM-dd date. */
export function formatDayMonth(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/**
 * Text color class for the sign of an amount, as `formatAmount` shows it: a
 * value that rounds to 0 at `decimals` is muted. The success/destructive
 * tokens carry their own dark-mode shades.
 */
export function amountTone(value: number, decimals = 2): string {
  // The amount as formatAmount shows it, so the tone never disagrees with the
  // text next to it.
  const shown = parseMoney(formatAmount(value, decimals)) ?? 0;
  if (shown > 0) return "text-success";
  if (shown < 0) return "text-destructive";
  return "text-muted-foreground";
}

// ---------------------------------------------------------------------------
// Money input (es-AR: "." groups thousands, "," is the decimal mark)
//
// The typed text is the form value: `sanitizeMoneyInput` while typing,
// `parseMoney` to read it, `toMoneyInput` to prefill it from a number.
// ---------------------------------------------------------------------------

export interface MoneyInputOptions {
  /** Max decimal places: the currency's `decimals` (2 for fiat, up to 8 for crypto). Defaults to 2. */
  decimals?: number;
  /** Keep a leading minus. Defaults to false. */
  allowNegative?: boolean;
}

/** "1234567" → "1.234.567". */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Optional sign, optional currency prefix ("$", "US$", "ARS"), optional sign,
// integer part (dots only at thousands, so "0.500" and "1.5" are malformed),
// optional ",fraction". Whitespace is removed first. "−" is the minus sign
// amounts are displayed with.
const MONEY_PATTERN = /^([-−])?[A-Za-z$€£]*([-−])?([1-9]\d{0,2}(?:\.\d{3})+|\d*)(?:,(\d*))?$/;

/**
 * Read an es-AR amount: "1.234,56", "-12,5", "$ 1.234", "US$ -3". Returns
 * null for "", "-", "," and anything malformed ("12abc", "1.23", "1234.5"),
 * never 0. The result is the double nearest to the typed decimal.
 */
export function parseMoney(input: string | null | undefined): number | null {
  if (input == null) return null;
  const match = MONEY_PATTERN.exec(input.replace(/\s/g, ""));
  if (!match) return null;
  const [, signBefore, signAfter, intPart, fraction = ""] = match;
  if (signBefore && signAfter) return null;
  const digits = intPart.replace(/\./g, "");
  if (!digits && !fraction) return null;
  const value = Number(`${digits || "0"}.${fraction || "0"}`);
  if (!Number.isFinite(value)) return null;
  if (value === 0) return 0;
  return signBefore || signAfter ? -value : value;
}

/**
 * Clean the text of a money field on every keystroke. Keeps digits, the first
 * comma and (when allowed) a leading minus; regroups thousands with dots, so
 * a typed "." is dropped; drops decimals past `decimals`. Partial states stay
 * as typed: "", "-", "12,", "0,0".
 */
export function sanitizeMoneyInput(
  raw: string,
  { decimals = 2, allowNegative = false }: MoneyInputOptions = {},
): string {
  const kept = raw.replace(/[^\d,\-−]/g, "");
  const sign = allowNegative && /^[-−]/.test(kept) ? "-" : "";
  const unsigned = kept.replace(/[-−]/g, "");
  const commaAt = unsigned.indexOf(",");
  const intDigits = (commaAt === -1 ? unsigned : unsigned.slice(0, commaAt)).replace(/^0+(?=\d)/, "");
  if (commaAt === -1 || decimals <= 0) return sign + groupThousands(intDigits);
  const fraction = unsigned.slice(commaAt + 1).replace(/,/g, "").slice(0, decimals);
  return `${sign}${groupThousands(intDigits)},${fraction}`;
}

/**
 * Where the caret goes after `sanitizeMoneyInput(raw)`: past as many kept
 * characters (digits, comma, minus) as were before `caret` in `raw`, so
 * regrouping the thousands does not throw it to the end.
 */
export function moneyInputCaret(raw: string, caret: number, options?: MoneyInputOptions): number {
  const next = sanitizeMoneyInput(raw, options);
  const keptBefore = sanitizeMoneyInput(raw.slice(0, caret), options).replace(/\./g, "").length;
  let seen = 0;
  for (let i = 0; i < next.length; i++) {
    if (seen === keptBefore) return i;
    if (next[i] !== ".") seen++;
  }
  return next.length;
}

const plainFormatters = new Map<number, Intl.NumberFormat>();

/**
 * The text a money field shows for a stored number: rounded to `decimals`,
 * trailing zeros trimmed, never exponent notation (1e-7 → "0,0000001").
 * null, undefined and non-finite numbers give "".
 */
export function toMoneyInput(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "";
  const places = Math.min(Math.max(Math.trunc(decimals), 0), 20);
  let formatter = plainFormatters.get(places);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: places });
    plainFormatters.set(places, formatter);
  }
  const plain = formatter.format(value);
  const [intDigits, fraction] = plain.replace("-", "").split(".");
  if (/^0+$/.test(intDigits) && !fraction) return "0";
  const sign = plain.startsWith("-") ? "-" : "";
  return `${sign}${groupThousands(intDigits)}${fraction ? `,${fraction}` : ""}`;
}
