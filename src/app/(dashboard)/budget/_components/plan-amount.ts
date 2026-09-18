import { parseMoney } from "@/lib/format";

/**
 * What an edited plan cell saves: the typed amount, or null for no change,
 * when the field is empty or unreadable ("" is never 0) or shows the same
 * amount at the currency's decimals.
 */
export function planAmountToSave(draft: string, current: number, decimals: number): number | null {
  const amount = parseMoney(draft);
  if (amount === null) return null;
  const scale = 10 ** decimals;
  return Math.round(amount * scale) === Math.round(current * scale) ? null : amount;
}
