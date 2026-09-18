import { formatAmount } from "@/lib/format";
import type { UnpricedReason } from "@/lib/server/prices";

/** Quantities and unit prices are stored with 8 decimals, whatever the asset. */
export const QUANTITY_DECIMALS = 8;
export const UNIT_PRICE_DECIMALS = 8;
/**
 * Costs, proceeds, fees and taxes are stored with 4, so no more are typed. A
 * prefill keeps them exact: saving a lot whose cost changed rewrites its cash.
 */
export const STORED_AMOUNT_DECIMALS = 4;

const eightDecimals = new Intl.NumberFormat("en-US", {
  useGrouping: false,
  minimumFractionDigits: 8,
  maximumFractionDigits: 8,
});

/** The fewest decimals, from `min` up to 8, that show `value` as stored. */
function decimalsNeeded(value: number, min: number): number {
  if (!Number.isFinite(value)) return min;
  const fraction = eightDecimals.format(Math.abs(value)).split(".")[1] ?? "";
  return Math.max(min, fraction.replace(/0+$/, "").length);
}

function isCryptoLike(assetType: string): boolean {
  return assetType === "crypto" || assetType === "stablecoin";
}

/** Crypto and stablecoins show up to 8 decimals (0,004 BTC is not "0,00"); the rest 2. */
export function quantityDecimals(value: number, assetType: string): number {
  return isCryptoLike(assetType) ? decimalsNeeded(value, 2) : 2;
}

export function formatQuantity(value: number, assetType: string): string {
  return formatAmount(value, quantityDecimals(value, assetType));
}

/** Every stored decimal, for a form: "Disponible: 0,1234567" of a fractional share. */
export function formatExactQuantity(value: number): string {
  return formatAmount(value, decimalsNeeded(value, 2));
}

/** 2 decimals, or about 4 significant digits below 1 (a coin at 0,00001234), up to 8. */
export function unitPriceDecimals(value: number): number {
  const abs = Math.abs(value);
  if (!(abs > 0) || abs >= 1) return 2;
  const significant = Math.min(8, Math.ceil(-Math.log10(abs)) + 3);
  return Math.max(2, Math.min(decimalsNeeded(value, 2), significant));
}

export function formatUnitPrice(value: number): string {
  return formatAmount(value, unitPriceDecimals(value));
}

/**
 * Whether `requested` is more than `available`. A position is its lots summed
 * in floating point (0,7 + 0,1 = 0,7999…) and quantities are stored with 8
 * decimals, so a difference under half the 8th decimal is that drift.
 */
export function exceedsQuantity(requested: number, available: number): boolean {
  return requested - available > Math.max(5e-9, Math.abs(available) * 1e-14);
}

const UNPRICED_REASONS: Record<UnpricedReason, string> = {
  not_found: "el proveedor no lo encontró",
  rate_limited: "el proveedor limitó las consultas",
  timeout: "el proveedor no respondió a tiempo",
  unavailable: "el proveedor no está disponible",
  bad_response: "el proveedor respondió con un error",
  unquotable: "ninguna fuente lo cotiza, cargá uno manual",
  no_rate: "falta el tipo de cambio",
};

export function unpricedReasonText(reason: UnpricedReason): string {
  return `Sin precio: ${UNPRICED_REASONS[reason] ?? "sin respuesta"}`;
}
