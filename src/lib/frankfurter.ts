import { fetchArsPerUsd, fetchArsPerUsdOn } from "@/lib/dolarapi";
import { today } from "@/lib/dates";

/**
 * Fetch an exchange rate. Frankfurter (ECB, fiat) covers most pairs; ARS is
 * not supported there, so ARS pairs are routed through dolarapi.com.
 *
 * Returns the rate to convert 1 unit of `from` into `to`.
 * When `date` is provided (yyyy-MM-dd) it fetches the historical rate for that
 * day; without it, the latest.
 * Returns null if the request fails or the pair is unsupported.
 */
export async function fetchExchangeRate(
  from: string,
  to: string,
  date?: string
): Promise<number | null> {
  if (from === to) return 1;
  if (from === "ARS" || to === "ARS") {
    return fetchArsRate(from, to, date);
  }
  return fetchFrankfurter(from, to, date);
}

/**
 * The daily rates of `from` in `to` between two dates (yyyy-MM-dd), by date,
 * or null if the request fails. Only business days have a rate, and the series
 * starts at the last one on or before `start`.
 */
export async function fetchFrankfurterSeries(
  from: string,
  to: string,
  start: string,
  end: string,
): Promise<Map<string, number> | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(
        `https://api.frankfurter.dev/v1/${start}..${end}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`,
        { signal: controller.signal },
      );
      if (!res.ok) return null;
      const data: { rates?: Record<string, Record<string, number>> } = await res.json();
      const series = new Map<string, number>();
      for (const [date, rates] of Object.entries(data.rates ?? {})) {
        const rate = rates[to];
        if (rate != null && rate > 0) series.set(date, rate);
      }
      return series;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

async function fetchFrankfurter(
  from: string,
  to: string,
  date?: string
): Promise<number | null> {
  try {
    const endpoint = date ?? "latest";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(
        `https://api.frankfurter.dev/v1/${endpoint}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`,
        { signal: controller.signal }
      );
      if (!res.ok) return null;

      const data: { rates: Record<string, number> } = await res.json();
      return data.rates[to] ?? null;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

/**
 * Resolve any pair involving ARS using dolarapi for the ARS↔USD leg and, when
 * the other side isn't USD, Frankfurter for the USD↔other cross rate.
 */
async function fetchArsRate(
  from: string,
  to: string,
  date?: string
): Promise<number | null> {
  // The history only has past days; today and later take today's quote.
  const arsPerUsd = date && date < today() ? await fetchArsPerUsdOn(date) : await fetchArsPerUsd();
  if (!arsPerUsd) return null;

  if (from === "ARS" && to === "USD") return 1 / arsPerUsd;
  if (from === "USD" && to === "ARS") return arsPerUsd;

  if (from === "ARS") {
    const usdToTarget = await fetchFrankfurter("USD", to, date);
    return usdToTarget != null ? (1 / arsPerUsd) * usdToTarget : null;
  }

  // to === "ARS", from is some non-USD currency
  const fromToUsd = await fetchFrankfurter(from, "USD", date);
  return fromToUsd != null ? fromToUsd * arsPerUsd : null;
}
