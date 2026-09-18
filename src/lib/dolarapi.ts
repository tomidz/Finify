import { fetchJson, providerFailure } from "@/lib/providers/fetch-json";

/**
 * The ARS↔USD rate. Frankfurter (ECB) doesn't cover ARS: today's quote comes
 * from dolarapi.com, and a past date's from argentinadatos.com, its sister API
 * with the history of the same quotes.
 *
 * We use the "oficial" quote.
 */
const ARS_CASA = "oficial";

type Quote = { compra?: number; venta?: number } | null;

const rateOf = (quote: Quote) => {
  const rate = quote?.venta ?? quote?.compra ?? null;
  return rate != null && rate > 0 ? rate : null;
};

/** ARS per 1 USD (the "venta" price), or null if unavailable. */
export async function fetchArsPerUsd(): Promise<number | null> {
  const result = await fetchJson<Quote>("dolarapi.today", `https://dolarapi.com/v1/dolares/${ARS_CASA}`);
  if (!result.ok) return null;
  const rate = rateOf(result.data);
  if (rate == null) providerFailure("dolarapi.today", "bad_response");
  return rate;
}

/**
 * ARS per 1 USD (the "venta" price) for every past day argentinadatos has, by
 * yyyy-MM-dd, or null if unavailable. One request instead of one per date.
 */
export async function fetchArsPerUsdHistory(): Promise<Map<string, number> | null> {
  const result = await fetchJson<unknown>(
    "argentinadatos.history",
    `https://api.argentinadatos.com/v1/cotizaciones/dolares/${ARS_CASA}`,
    { timeoutMs: 15_000 },
  );
  if (!result.ok) return null;
  if (!Array.isArray(result.data)) {
    providerFailure("argentinadatos.history", "bad_response");
    return null;
  }
  const history = new Map<string, number>();
  for (const row of result.data as (Quote & { fecha?: string })[]) {
    const rate = rateOf(row);
    if (row?.fecha && rate != null) history.set(row.fecha, rate);
  }
  return history;
}

/** ARS per 1 USD (the "venta" price) on a past date, or null if unavailable. */
export async function fetchArsPerUsdOn(date: string): Promise<number | null> {
  const [year, month, day] = date.split("-");
  const result = await fetchJson<Quote>(
    "argentinadatos.date",
    `https://api.argentinadatos.com/v1/cotizaciones/dolares/${ARS_CASA}/${year}/${month}/${day}`,
  );
  if (!result.ok) return null;
  const rate = rateOf(result.data);
  if (rate == null) providerFailure("argentinadatos.date", "not_found");
  return rate;
}
