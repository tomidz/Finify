/**
 * Fetch the ARS↔USD rate from dolarapi.com (https://dolarapi.com).
 * Frankfurter (ECB) doesn't cover ARS, so we source it here.
 *
 * We use the "oficial" quote. dolarapi only exposes the current value (no
 * history), so historical conversions fall back to the current rate.
 */
const ARS_CASA = "oficial";

/** ARS per 1 USD (the "venta" price), or null if unavailable. */
export async function fetchArsPerUsd(): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`https://dolarapi.com/v1/dolares/${ARS_CASA}`, {
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data: { compra?: number; venta?: number } = await res.json();
      const rate = data.venta ?? data.compra ?? null;
      return rate != null && rate > 0 ? rate : null;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}
