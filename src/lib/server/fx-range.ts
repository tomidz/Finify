import "server-only";

import { forEachLimited } from "@/lib/concurrency";
import { fetchArsPerUsdHistory } from "@/lib/dolarapi";
import { fetchFrankfurterSeries } from "@/lib/frankfurter";
import { getFxQuote } from "@/lib/server/fx";
import { readAllRows } from "@/lib/server/paginate";
import type { createClient } from "@/lib/supabase/server";
import { addDays, today as appToday } from "@/lib/dates";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type FxRequest = { date: string; from: string };
/**
 * The rate for (date, from), null when there is none; `rateDate` says the
 * date that rate was quoted for, which can be before the date asked.
 */
export type FxLookup = ((date: string, from: string) => number | null) & {
  rateDate: (date: string, from: string) => string | null;
};

const PROVIDER_CONCURRENCY = 4;
/** Uncached past days of the peso from which the whole history is fetched at once. */
const ARS_HISTORY_THRESHOLD = 3;
/** Days a peso quote carries over to the days after it without one (weekends, holidays). */
const ARS_CARRY_DAYS = 3;
/** The same for the ECB, which closes up to four days in a row at Easter. */
const ECB_CARRY_DAYS = 4;

/** The value on `date`, or on the closest day up to `carryDays` before it. */
function carried(series: Map<string, number> | null | undefined, date: string, carryDays: number) {
  for (let back = 0; back <= carryDays; back += 1) {
    const value = series?.get(addDays(date, -back));
    if (value != null) return value;
  }
  return undefined;
}

/**
 * Resolves many (date, currency) → `to` conversions with one paginated read of
 * the fx_rates cache instead of one query per pair, with the same answers as
 * calling getFxQuote for each: the cached quote for that exact date (today's
 * for future dates) and source, otherwise getFxQuote, which asks the provider
 * and falls back to a recent cached quote.
 *
 * An unresolvable rate is null — callers must not treat it as 1.
 */
export async function resolveFxRates(
  supabase: SupabaseServerClient,
  requests: FxRequest[],
  to: string,
): Promise<FxLookup> {
  const today = appToday();
  const cacheDate = (date: string) => (date > today ? today : date);
  const key = (date: string, from: string) => `${cacheDate(date)}|${from}`;
  const quotes = new Map<string, { rate: number; rateDate: string } | null>();
  const lookup: FxLookup = Object.assign(
    (date: string, from: string) => (from === to ? 1 : (quotes.get(key(date, from))?.rate ?? null)),
    {
      rateDate: (date: string, from: string) =>
        from === to ? cacheDate(date) : (quotes.get(key(date, from))?.rateDate ?? null),
    },
  );

  const pending = requests.filter((r) => r.date && r.from && r.from !== to);
  if (pending.length === 0) return lookup;

  const sourceFor = (from: string) =>
    from === "ARS" || to === "ARS" ? "dolarapi" : "frankfurter";

  const currencies = [...new Set(pending.map((r) => r.from))];
  const dates = pending.map((r) => cacheDate(r.date)).sort();

  const read = await readAllRows(({ from, to: last, count }) =>
    supabase
      .from("fx_rates")
      .select("from_currency, rate_date, rate, source", { count })
      .eq("to_currency", to)
      .in("from_currency", currencies)
      .gte("rate_date", dates[0])
      .lte("rate_date", dates[dates.length - 1])
      .order("rate_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, last),
  );
  if ("error" in read) {
    console.error("resolveFxRates: cache read failed, falling back to per-pair lookups:", read.error.code);
  } else {
    for (const row of read.data) {
      // Only rows from the source getFxQuote would use.
      if (row.source !== sourceFor(row.from_currency)) continue;
      quotes.set(key(row.rate_date, row.from_currency), { rate: Number(row.rate), rateDate: row.rate_date });
    }
  }

  // One question per uncached (date, currency); future dates share today's.
  const unresolved = new Map<string, FxRequest>();
  for (const request of pending) {
    const requestKey = key(request.date, request.from);
    if (!quotes.has(requestKey)) unresolved.set(requestKey, { date: cacheDate(request.date), from: request.from });
  }

  // Many past days of the peso: its whole history in one request, and for a
  // cross with another currency, that currency's dollar series in one more,
  // cached under each day asked, instead of requests per day.
  const arsPast = [...unresolved].filter(([, r]) => r.date < today && (r.from === "ARS" || to === "ARS"));
  if (arsPast.length >= ARS_HISTORY_THRESHOLD) {
    const history = await fetchArsPerUsdHistory();
    // The currency on the other side of the peso, quoted per dollar.
    const otherOf = (request: FxRequest) => (to === "ARS" ? request.from : to);
    const pastDates = arsPast.map(([, r]) => r.date).sort();
    const perUsd = new Map<string, Map<string, number> | null>();
    if (history) {
      const others = [...new Set(arsPast.map(([, r]) => otherOf(r)))].filter((c) => c !== "USD");
      await Promise.all(
        others.map(async (other) =>
          perUsd.set(other, await fetchFrankfurterSeries("USD", other, pastDates[0], pastDates[pastDates.length - 1])),
        ),
      );
    }
    const rows: { rate_date: string; from_currency: string; to_currency: string; rate: number; source: string }[] = [];
    for (const [requestKey, request] of history ? arsPast : []) {
      const arsPerUsd = carried(history, request.date, ARS_CARRY_DAYS);
      const other = otherOf(request);
      const otherPerUsd = other === "USD" ? 1 : carried(perUsd.get(other), request.date, ECB_CARRY_DAYS);
      if (arsPerUsd == null || otherPerUsd == null) continue;
      const rate = request.from === "ARS" ? otherPerUsd / arsPerUsd : arsPerUsd / otherPerUsd;
      quotes.set(requestKey, { rate, rateDate: request.date });
      unresolved.delete(requestKey);
      rows.push({ rate_date: request.date, from_currency: request.from, to_currency: to, rate, source: "dolarapi" });
    }
    if (rows.length > 0) {
      const { error } = await supabase
        .from("fx_rates")
        .upsert(rows, { onConflict: "rate_date,from_currency,to_currency,source", ignoreDuplicates: true });
      if (error) console.error("resolveFxRates: could not cache the peso history:", error.code);
    }
  }

  // Once a currency's provider fails, the rest of the batch only reads the
  // cache: waiting out the timeout for every date would stall the page.
  const providerDown = new Set<string>();
  await forEachLimited([...unresolved], PROVIDER_CONCURRENCY, async ([requestKey, request]) => {
    const result = await getFxQuote({
      date: request.date,
      from: request.from,
      to,
      offline: providerDown.has(request.from),
    });
    if ("error" in result || result.data.rateDate < request.date) providerDown.add(request.from);
    quotes.set(requestKey, "error" in result ? null : { rate: result.data.rate, rateDate: result.data.rateDate });
  });

  return lookup;
}
