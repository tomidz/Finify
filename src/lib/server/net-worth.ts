import "server-only";

import { after } from "next/server";

import { addDays, monthCloseDate, today } from "@/lib/dates";
import type { ServerContext } from "@/lib/server/context";
import { maxRateAgeDays } from "@/lib/server/fx";
import { resolveFxRates, type FxRequest } from "@/lib/server/fx-range";
import { readAllRows } from "@/lib/server/paginate";
import type {
  AccountNetWorthSummary,
  LiabilitiesSummary,
  NetWorthEvolutionPoint,
} from "@/types/net-worth";

type Result<T> = { data: T } | { error: string };

/**
 * Caches the rates the net worth RPCs read for a year: at the close of each of
 * its months (only the latest with `latestOnly`), or today when it has none,
 * for every currency they convert. They only read cached rates within
 * maxRateAgeDays: a pair without one is looked up before they run, and one with
 * only an older rate is refreshed after the response, so a provider that hangs
 * never holds up the page. A failed lookup is left for the RPCs to mark.
 */
export async function warmCloseRates(
  ctx: ServerContext,
  baseCurrency: string,
  period: {
    months: readonly { year: number; month: number }[];
    year: number;
    latestOnly?: boolean;
  },
): Promise<void> {
  const todayStr = today();
  const closes = period.months
    .filter((m) => m.year === period.year)
    .map((m) => monthCloseDate(m.year, m.month, todayStr))
    .sort();
  const dates = [
    ...new Set(closes.length === 0 ? [todayStr] : period.latestOnly ? closes.slice(-1) : closes),
  ];

  const { data, error } = await ctx.supabase.rpc("user_valued_currencies");
  if (error) {
    console.error("warmCloseRates:", error.code);
    return;
  }
  const valued = (data ?? []).filter((currency) => currency !== baseCurrency);
  if (valued.length === 0) return;
  // Only fiat currencies have a provider: the rest keep their stored base
  // amounts, and asking every load would only wait for a failure.
  const { data: fiat, error: fiatError } = await ctx.supabase
    .from("currencies")
    .select("code")
    .in("code", valued)
    .eq("currency_type", "fiat");
  if (fiatError) {
    console.error("warmCloseRates: currencies read failed:", fiatError.code);
    return;
  }
  const currencies = (fiat ?? []).map((row) => row.code);
  if (currencies.length === 0) return;

  // Only the days each date can take a rate from.
  const maxAge = Math.max(...currencies.map((currency) => maxRateAgeDays(currency, baseCurrency)));
  const windows = dates
    .map((date) => `and(rate_date.gte.${addDays(date, -maxAge)},rate_date.lte.${date})`)
    .join(",");
  const cached = await readAllRows(({ from, to, count }) =>
    ctx.supabase
      .from("fx_rates")
      .select("id, from_currency, rate_date, source", { count })
      .eq("to_currency", baseCurrency)
      .in("from_currency", currencies)
      .or(windows)
      .order("rate_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if ("error" in cached) console.error("warmCloseRates: cache read failed:", cached.error.code);
  // Only the source fx_rate_asof reads for the pair.
  const sourceOf = (from: string) => (from === "ARS" || baseCurrency === "ARS" ? "dolarapi" : "frankfurter");
  const cachedOn = new Set(
    ("data" in cached ? cached.data : [])
      .filter((row) => row.source === sourceOf(row.from_currency))
      .map((row) => `${row.from_currency}|${row.rate_date}`),
  );

  const missing: FxRequest[] = [];
  const stale: FxRequest[] = [];
  for (const date of dates) {
    for (const from of currencies) {
      if (cachedOn.has(`${from}|${date}`)) continue;
      const olderDays = Array.from({ length: maxRateAgeDays(from, baseCurrency) }, (_, i) =>
        addDays(date, -(i + 1)),
      );
      (olderDays.some((day) => cachedOn.has(`${from}|${day}`)) ? stale : missing).push({ date, from });
    }
  }

  const lookUp = async (requests: FxRequest[]) => {
    try {
      await resolveFxRates(ctx.supabase, requests, baseCurrency);
    } catch (e) {
      console.error("warmCloseRates: lookup failed:", e);
    }
  };
  if (stale.length > 0) {
    try {
      after(() => lookUp(stale));
    } catch (e) {
      console.error("warmCloseRates: could not schedule the refresh:", e);
    }
  }
  if (missing.length > 0) await lookUp(missing);
}

export async function loadAccountNetWorth(
  { supabase }: ServerContext,
  year: number,
): Promise<Result<AccountNetWorthSummary>> {
  try {
    const { data, error } = await supabase.rpc("account_net_worth_year", {
      p_year: year,
      p_base_currency: undefined,
    });

    if (error) return { error: error.message };

    const rows = (data ?? []) as Array<{
      month: number | string;
      close_date: string;
      account_id: string;
      account_name: string;
      account_type: string;
      currency: string;
      currency_symbol: string;
      is_active: boolean;
      balance: number | string;
      balance_base: number | string;
      balance_book_base: number | string;
      balance_fx_missing: boolean;
      balance_fx_rate_date: string | null;
      investment_value: number | string;
      investment_value_base: number | string | null;
      investment_fx_rate_date: string | null;
    }>;
    const accountResults = rows.map((row) => ({
      id: row.account_id,
      name: row.account_name,
      account_type: row.account_type,
      currency: row.currency,
      currency_symbol: row.currency_symbol,
      is_active: row.is_active !== false,
      balance: Number(row.balance ?? 0),
      balance_base: Number(row.balance_base ?? 0),
      balance_book_base: Number(row.balance_book_base ?? 0),
      balance_fx_missing: row.balance_fx_missing === true,
      balance_fx_rate_date: row.balance_fx_rate_date,
      investment_value: Number(row.investment_value ?? 0),
      investment_value_base:
        row.investment_value_base != null ? Number(row.investment_value_base) : null,
      investment_fx_rate_date: row.investment_fx_rate_date,
    }));

    // Positions without a rate are left out rather than valued 1:1.
    const total = accountResults.reduce(
      (sum, account) => sum + account.balance_base + (account.investment_value_base ?? 0),
      0,
    );

    return {
      data: {
        year,
        month: rows.length > 0 ? Number(rows[0].month ?? 0) : 0,
        close_date: rows[0]?.close_date ?? null,
        total,
        accounts: accountResults,
      },
    };
  } catch (e) {
    console.error("loadAccountNetWorth:", e);
    return { error: "Error al calcular patrimonio neto" };
  }
}

export async function loadLiabilitiesForYear(
  { supabase }: ServerContext,
  year: number,
): Promise<Result<LiabilitiesSummary>> {
  try {
    const { data, error } = await supabase.rpc("liabilities_year", {
      p_year: year,
      p_base_currency: undefined,
    });

    if (error) return { error: error.message };

    const rows = (data ?? []) as Array<{
      item_id: string;
      name: string;
      currency: string;
      currency_symbol: string;
      amount: number | string;
      amount_base: number | string | null;
      fx_rate_date: string | null;
      close_date: string;
    }>;
    const summaryItems = rows.map((item) => ({
      item_id: item.item_id,
      name: item.name,
      currency: item.currency,
      currency_symbol: item.currency_symbol,
      amount: Number(item.amount ?? 0),
      amount_base:
        item.amount_base != null ? Number(item.amount_base) : null,
      fx_rate_date: item.fx_rate_date,
    }));

    // A debt without a rate is left out rather than added unconverted.
    const total = summaryItems.reduce((sum, item) => sum + (item.amount_base ?? 0), 0);

    return { data: { year, close_date: rows[0]?.close_date ?? null, total, items: summaryItems } };
  } catch (e) {
    console.error("loadLiabilitiesForYear:", e);
    return { error: "Error al obtener pasivos" };
  }
}

export async function loadNetWorthEvolution(
  { supabase }: ServerContext,
  year: number,
): Promise<Result<NetWorthEvolutionPoint[]>> {
  try {
    const { data, error } = await supabase.rpc("net_worth_evolution_year", {
      p_year: year,
      p_base_currency: undefined,
    });

    if (error) return { error: error.message };

    return {
      data: ((data ?? []) as Array<{
        month: number | string;
        close_date: string;
        assets: number | string;
        liabilities: number | string;
        net_worth: number | string;
        fx_missing: boolean;
        cash_fx_missing: boolean;
      }>).map((row) => ({
        month: Number(row.month ?? 0),
        closeDate: row.close_date,
        assets: Number(row.assets ?? 0),
        liabilities: Number(row.liabilities ?? 0),
        netWorth: Number(row.net_worth ?? 0),
        fxMissing: row.fx_missing === true,
        cashFxMissing: row.cash_fx_missing === true,
      })),
    };
  } catch (e) {
    console.error("loadNetWorthEvolution:", e);
    return { error: "Error al calcular evolución de patrimonio" };
  }
}
