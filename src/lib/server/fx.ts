import "server-only";

import { cache } from "react";

import type { ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { fetchExchangeRate } from "@/lib/frankfurter";
import { addDays, today as appToday } from "@/lib/dates";
import { logError } from "@/lib/log";
import { dbError } from "@/lib/server/db-errors";

interface FxInput {
  date: string; // yyyy-MM-dd
  from: string;
  to: string;
  source?: string;
  /** Only the cache: the provider is known to be down. */
  offline?: boolean;
}

/** A rate and the date it was quoted for, which can be before the date asked. */
export type FxQuote = { rate: number; rateDate: string; source: string };

/**
 * How old a cached rate may be when the provider cannot answer. The peso moves
 * enough in a few days that an older quote misvalues it.
 */
export function maxRateAgeDays(from: string, to: string): number {
  return from === "ARS" || to === "ARS" ? 3 : 7;
}

/**
 * Resolves one (date, from, to, source) tuple at most once per request.
 *
 * Several actions iterate row by row, so a single render used to ask for the
 * same currency pair dozens of times, one Supabase round trip each. cache()
 * collapses those into one.
 *
 * The arguments are primitives on purpose: cache() keys on argument identity,
 * so passing the FxInput object through would allocate a fresh key on every
 * call and never hit.
 */
const resolveQuote = cache(async function resolveQuote(
  date: string,
  from: string,
  to: string,
  source: string,
  offline: boolean,
): Promise<ActionResult<FxQuote>> {
  const today = appToday();
  // A future date takes today's quote, the best available.
  const quoteDate = date > today ? today : date;

  try {
    const supabase = await createClient();

    const { data: exact, error } = await supabase
      .from("fx_rates")
      .select("rate")
      .eq("rate_date", quoteDate)
      .eq("from_currency", from)
      .eq("to_currency", to)
      .eq("source", source)
      .maybeSingle();
    if (error) return dbError("getFxQuote", error, "Error al obtener tipo de cambio");
    if (exact?.rate != null) {
      return { data: { rate: Number(exact.rate), rateDate: quoteDate, source } };
    }

    const fetched = offline ? null : await fetchExchangeRate(from, to, quoteDate < today ? quoteDate : undefined);
    if (fetched != null) {
      const { error: insertError } = await supabase.from("fx_rates").insert({
        rate_date: quoteDate,
        from_currency: from,
        to_currency: to,
        rate: fetched,
        source,
      });
      if (insertError && insertError.code !== "23505") {
        logError("getFxQuote", insertError, { step: "cache write" });
      }
      return { data: { rate: fetched, rateDate: quoteDate, source } };
    }

    // The provider is down or has no quote for the date: the latest cached
    // one, if it is recent enough.
    const { data: recent, error: recentError } = await supabase
      .from("fx_rates")
      .select("rate, rate_date")
      .eq("from_currency", from)
      .eq("to_currency", to)
      .eq("source", source)
      .lte("rate_date", quoteDate)
      .gte("rate_date", addDays(quoteDate, -maxRateAgeDays(from, to)))
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentError) return dbError("getFxQuote", recentError, "Error al obtener tipo de cambio");
    if (recent?.rate != null) {
      return { data: { rate: Number(recent.rate), rateDate: recent.rate_date, source } };
    }

    return { error: `No hay cotización de ${from} a ${to} para el ${quoteDate}` };
  } catch (e) {
    logError("getFxQuote", e);
    return { error: "Error al obtener tipo de cambio histórico" };
  }
});

/**
 * The rate to convert `from` into `to` on `date`: the cached quote for that
 * date, otherwise the provider's (which is cached), otherwise the latest cached
 * quote within a few days, with the date it is for.
 */
export async function getFxQuote(input: FxInput): Promise<ActionResult<FxQuote>> {
  const { date, from, to } = input;

  if (!date) return { error: "Fecha de FX requerida" };
  if (!from || !to) return { error: "Monedas de FX requeridas" };
  if (from === to) return { data: { rate: 1, rateDate: date, source: "same currency" } };

  const involvesArs = from === "ARS" || to === "ARS";
  const source = input.source ?? (involvesArs ? "dolarapi" : "frankfurter");

  return resolveQuote(date, from, to, source, input.offline === true);
}

/** The rate alone (see getFxQuote). */
export async function getOrFetchFxRate(input: FxInput): Promise<ActionResult<number>> {
  const quote = await getFxQuote(input);
  return "error" in quote ? quote : { data: quote.data.rate };
}
