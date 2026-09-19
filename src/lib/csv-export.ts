/**
 * CSV for Excel in es-AR: ";" between fields and "," as the decimal mark
 * (Excel takes both from the OS locale, and a "," decimal locale reads ";" as
 * the list separator), CRLF line ends and a UTF-8 BOM so accents open right.
 */

export interface CsvColumn<T> {
  header: string;
  /** A number stays a number in Excel ("1234,5"); a string is text. Pass amounts as numbers. */
  value: (row: T) => string | number | null | undefined;
}

const SEPARATOR = ";";
const BOM = "﻿";

// A text cell starting with one of these runs as a formula in a spreadsheet.
const FORMULA_START = /^[=+\-@\t\r]/;

// Up to 8 decimals (crypto), without float noise or exponent notation.
const numberFormat = new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: 8 });

function textCell(text: string): string {
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function numberCell(value: number): string {
  if (!Number.isFinite(value)) return "";
  const plain = numberFormat.format(value).replace(".", ",");
  return plain === "-0" ? "0" : plain;
}

function cell(value: string | number | null | undefined): string {
  if (value == null) return "";
  return typeof value === "number" ? numberCell(value) : textCell(value);
}

/** The whole file: BOM, header row, one row per item. */
export function buildCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [
    columns.map((column) => textCell(column.header)),
    ...rows.map((row) => columns.map((column) => cell(column.value(row)))),
  ];
  return BOM + lines.map((cells) => cells.join(SEPARATOR)).join("\r\n");
}

/** Save `csv` (from `buildCsv`) as `filename` in the browser. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Some browsers read the URL after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
