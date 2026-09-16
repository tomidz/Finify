import "server-only";

import { forEachLimited } from "@/lib/concurrency";
import { getOrFetchFxRate } from "@/lib/server/fx";
import { readAllRows } from "@/lib/server/paginate";
import type { createClient } from "@/lib/supabase/server";
import { today as appToday } from "@/lib/dates";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type FxRequest = { date: string; from: string };
export type FxLookup = (date: string, from: string) => number | null;

const PROVIDER_CONCURRENCY = 4;

/**
 * Resolves many (date, currency) → `to` conversions with one paginated read of
 * the fx_rates cache instead of one query per pair, with the same answers as
 * calling getOrFetchFxRate for each: the cached quote for that exact date
 * (today's for future dates) and source, otherwise the provider, which caches
 * what it returns.
 *
 * An unresolvable rate is null — callers must not treat it as 1.
 */
export async function resolveFxRates(
  supabase: SupabaseServerClient,
  requests: FxRequest[],
  to: string,
): Promise<FxLookup> {
  const rates = new Map<string, number | null>();
  const key = (date: string, from: string) => `${date}|${from}`;
  const lookup: FxLookup = (date, from) =>
    from === to ? 1 : (rates.get(key(date, from)) ?? null);

  const pending = requests.filter((r) => r.date && r.from && r.from !== to);
  if (pending.length === 0) return lookup;

  const today = appToday();
  const cacheDate = (date: string) => (date > today ? today : date);
  const sourceFor = (from: string) =>
    from === "ARS" || to === "ARS" ? "dolarapi" : "frankfurter";

  const currencies = [...new Set(pending.map((r) => r.from))];
  const dates = pending.map((r) => cacheDate(r.date)).sort();

  // "date|from" → rate, only rows from the source getOrFetchFxRate would use.
  const cached = new Map<string, number>();
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
      if (row.source !== sourceFor(row.from_currency)) continue;
      cached.set(key(row.rate_date, row.from_currency), Number(row.rate));
    }
  }

  const unresolved: FxRequest[] = [];
  for (const request of pending) {
    const hit = cached.get(key(cacheDate(request.date), request.from));
    if (hit != null) {
      rates.set(key(request.date, request.from), hit);
    } else {
      unresolved.push(request);
    }
  }

  // dolarapi only quotes "now", and future dates resolve to the latest quote:
  // either way every date in the group gets the same answer, so ask once.
  const groups = new Map<string, { date: string; requests: FxRequest[] }>();
  for (const request of unresolved) {
    const involvesArs = sourceFor(request.from) === "dolarapi";
    const isFuture = request.date > today;
    const groupKey = key(involvesArs ? today : isFuture ? "future" : request.date, request.from);
    const group = groups.get(groupKey) ?? {
      date: involvesArs ? today : request.date,
      requests: [],
    };
    group.requests.push(request);
    groups.set(groupKey, group);
  }

  await forEachLimited([...groups.values()], PROVIDER_CONCURRENCY, async (group) => {
    const result = await getOrFetchFxRate({ date: group.date, from: group.requests[0].from, to });
    const rate = "error" in result ? null : result.data;
    for (const request of group.requests) rates.set(key(request.date, request.from), rate);
  });

  return lookup;
}
