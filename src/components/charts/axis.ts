const compactFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

// Largest first; "mil M" is the Spanish thousand million.
const UNITS = [
  [1e9, " mil M"],
  [1e6, " M"],
  [1e3, " k"],
  [1, ""],
] as const;

const roundTenth = (n: number) => Math.round(n * 10) / 10;

/** Compact amount for axis ticks: "850", "12,5 k", "1,2 M", "3,4 mil M". */
export function formatCompactAmount(value: number): string {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  let index = UNITS.findIndex(([size]) => abs >= size);
  if (index === -1) index = UNITS.length - 1;
  // Rounding can reach the next unit: 999.96 k reads "1 M".
  if (index > 0 && roundTenth(abs / UNITS[index][0]) >= 1e3) index -= 1;
  const [size, suffix] = UNITS[index];
  // `|| 0` drops the sign of a value that rounds to zero.
  return `${compactFormatter.format(roundTenth(value / size) || 0)}${suffix}`;
}

/** Shared XAxis/YAxis props: 11px muted ticks, no axis or tick lines. */
export const chartAxisProps = {
  tick: { fontSize: 11, fill: "var(--muted-foreground)" },
  axisLine: false,
  tickLine: false,
} as const;
