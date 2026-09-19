import { fetchArsPerUsd, fetchArsPerUsdOn } from "@/lib/dolarapi";
import { today } from "@/lib/dates";
import { fetchJson, providerFailure } from "@/lib/providers/fetch-json";

const FRANKFURTER = "https://api.frankfurter.dev/v1";

const pairQuery = (from: string, to: string) =>
  `base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;

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
  const result = await fetchJson<{ rates?: Record<string, Record<string, number> | null> } | null>(
    "frankfurter.series",
    `${FRANKFURTER}/${start}..${end}?${pairQuery(from, to)}`,
    { timeoutMs: 15_000 },
  );
  if (!result.ok) return null;
  const series = new Map<string, number>();
  for (const [date, rates] of Object.entries(result.data?.rates ?? {})) {
    const rate = rates?.[to];
    if (rate != null && rate > 0) series.set(date, rate);
  }
  return series;
}

async function fetchFrankfurter(
  from: string,
  to: string,
  date?: string
): Promise<number | null> {
  const result = await fetchJson<{ rates?: Record<string, number> } | null>(
    "frankfurter.rate",
    `${FRANKFURTER}/${date ?? "latest"}?${pairQuery(from, to)}`,
  );
  if (!result.ok) return null;
  const rate = result.data?.rates?.[to] ?? null;
  if (rate == null) providerFailure("frankfurter.rate", "not_found");
  return rate;
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
