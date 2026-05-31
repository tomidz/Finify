import { fetchArsPerUsd } from "@/lib/dolarapi";

/**
 * Fetch an exchange rate. Frankfurter (ECB, fiat) covers most pairs; ARS is
 * not supported there, so ARS pairs are routed through dolarapi.com.
 *
 * Returns the rate to convert 1 unit of `from` into `to`.
 * When `date` is provided (yyyy-MM-dd) it fetches the historical rate for that
 * day (the ARS leg is current-only — dolarapi has no history).
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
  const arsPerUsd = await fetchArsPerUsd();
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
