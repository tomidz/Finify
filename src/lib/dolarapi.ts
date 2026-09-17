/**
 * The ARS↔USD rate. Frankfurter (ECB) doesn't cover ARS: today's quote comes
 * from dolarapi.com, and a past date's from argentinadatos.com, its sister API
 * with the history of the same quotes.
 *
 * We use the "oficial" quote.
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

/**
 * ARS per 1 USD (the "venta" price) for every past day argentinadatos has, by
 * yyyy-MM-dd, or null if unavailable. One request instead of one per date.
 */
export async function fetchArsPerUsdHistory(): Promise<Map<string, number> | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`https://api.argentinadatos.com/v1/cotizaciones/dolares/${ARS_CASA}`, {
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const rows: { fecha?: string; compra?: number; venta?: number }[] = await res.json();
      const history = new Map<string, number>();
      for (const row of rows) {
        const rate = row.venta ?? row.compra ?? null;
        if (row.fecha && rate != null && rate > 0) history.set(row.fecha, rate);
      }
      return history;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

/** ARS per 1 USD (the "venta" price) on a past date, or null if unavailable. */
export async function fetchArsPerUsdOn(date: string): Promise<number | null> {
  const [year, month, day] = date.split("-");
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(
        `https://api.argentinadatos.com/v1/cotizaciones/dolares/${ARS_CASA}/${year}/${month}/${day}`,
        { signal: controller.signal },
      );
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
