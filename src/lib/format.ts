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

const amountFormatter = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a number as es-AR currency (dot thousands, comma decimals, 2 places). */
export function formatAmount(value: number): string {
  // Anything that rounds to 0 at 2 decimals (incl. -0 and tiny float drift)
  // is shown as "0,00", never "-0,00".
  const normalized = Math.round(value * 100) === 0 ? 0 : value;
  return amountFormatter.format(normalized);
}

/** Return a Tailwind text color class based on the sign of a number. */
export function amountTone(value: number): string {
  if (value > 0) return "text-green-600";
  if (value < 0) return "text-red-600";
  return "text-muted-foreground";
}

/**
 * Parse a money string in es-AR format (e.g. "1.234,56" or "$1.234,56") to a number.
 * Returns null if the input is empty or invalid.
 */
export function parseMoneyInput(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/\$/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");

  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Sanitize a money input string while the user types.
 * Allows digits, a single comma as decimal separator, and dots as thousand separators.
 * Does NOT force decimal places — that would make typing impossible.
 */
export function formatMoneyInput(value: string): string {
  // Strip everything except digits, commas, and dots
  let cleaned = value.replace(/[^0-9.,]/g, "");

  // Treat dots as thousand separators and commas as decimal separator (es-AR).
  // If there are multiple commas, keep only the last one as decimal.
  const commaIdx = cleaned.lastIndexOf(",");
  if (commaIdx !== -1) {
    const beforeComma = cleaned.slice(0, commaIdx).replace(/,/g, "");
    const afterComma = cleaned.slice(commaIdx + 1).replace(/,/g, "").replace(/\./g, "");
    cleaned = beforeComma + "," + afterComma;
  }

  return cleaned;
}

/**
 * Format a raw money input string by parsing and re-formatting it with full decimals.
 * Use this for pre-populating fields (on load / reset), NOT during typing.
 */
export function formatMoneyDisplay(value: string): string {
  const parsed = parseMoneyInput(value);
  if (parsed == null) return "";
  return formatAmount(parsed);
}

/** Hex colors for each budget category type, used across charts. */
export const CATEGORY_COLORS: Record<string, string> = {
  income: "#34d399",
  essential_expenses: "#f87171",
  discretionary_expenses: "#fb923c",
  debt_payments: "#fb7185",
  savings: "#22d3ee",
  investments: "#818cf8",
};
