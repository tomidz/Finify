"use server";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { fetchExchangeRate } from "@/lib/frankfurter";

type ActionResult<T> = { data: T } | { error: string };

interface FxInput {
  date: string; // yyyy-MM-dd
  from: string;
  to: string;
  source?: string;
}

function localToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Resolves one (date, from, to, source) tuple at most once per request.
 *
 * getOrFetchFxRate is called from nine different actions and several of them
 * iterate row by row — forecast.ts walks every recurring with no dedup at all
 * — so a single render was asking for the same currency pair dozens of times,
 * one Supabase round trip each. cache() collapses those into one.
 *
 * The arguments are primitives on purpose: cache() keys on argument identity,
 * so passing the FxInput object through would allocate a fresh key on every
 * call and never hit.
 */
const resolveRate = cache(async function resolveRate(
  date: string,
  from: string,
  to: string,
  source: string,
): Promise<ActionResult<number>> {
  const involvesArs = from === "ARS" || to === "ARS";
  const today = localToday();
  const isFuture = date > today;

  try {
    const supabase = await createClient();

    // 1) Intentar leer de caché local (fx_rates). Future dates read today's
    //    cached rate (the best available quote).
    const cacheDate = isFuture ? today : date;
    const { data, error } = await supabase
      .from("fx_rates")
      .select("rate")
      .eq("rate_date", cacheDate)
      .eq("from_currency", from)
      .eq("to_currency", to)
      .eq("source", source)
      .maybeSingle();

    if (error) return { error: error.message };
    if (data?.rate != null) {
      return { data: Number(data.rate) };
    }

    // 2) Si no existe, ir al proveedor. Frankfurter 404s on future dates, so
    //    those are clamped to the latest quote.
    const fetched = await fetchExchangeRate(
      from,
      to,
      isFuture ? undefined : date,
    );
    if (fetched == null) {
      return { error: "No se pudo obtener tipo de cambio histórico" };
    }

    // 3) Cache only under a date the quote is actually accurate for:
    //    - non-ARS historical/today quotes → the requested date
    //    - ARS quotes are current-only, future dates are clamped → today
    //    Never persist a current rate under a past/future date (poisons the
    //    cache and every aggregate that reads it).
    const quoteDate = involvesArs || isFuture ? today : date;
    const { error: insertError } = await supabase.from("fx_rates").insert({
      rate_date: quoteDate,
      from_currency: from,
      to_currency: to,
      rate: fetched,
      source,
    });

    if (insertError && insertError.code !== "23505") {
      // No cortamos el flujo si el insert falla; igualmente devolvemos el rate
      console.error("Error al guardar fx_rate:", insertError);
    }

    return { data: fetched };
  } catch (e) {
    console.error("getOrFetchFxRate:", e);
    return { error: "Error al obtener tipo de cambio histórico" };
  }
});

export async function getOrFetchFxRate(
  input: FxInput,
): Promise<ActionResult<number>> {
  const { date, from, to } = input;

  if (!date) return { error: "Fecha de FX requerida" };
  if (!from || !to) return { error: "Monedas de FX requeridas" };
  if (from === to) return { data: 1 };

  // dolarapi only quotes the current rate, so ARS rows are tagged honestly.
  const involvesArs = from === "ARS" || to === "ARS";
  const source = input.source ?? (involvesArs ? "dolarapi" : "frankfurter");

  return resolveRate(date, from, to, source);
}
