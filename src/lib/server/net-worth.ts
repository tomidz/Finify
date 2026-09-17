import "server-only";

import { forEachLimited } from "@/lib/concurrency";
import { today } from "@/lib/dates";
import type { ServerContext } from "@/lib/server/context";
import { getFxQuote } from "@/lib/server/fx";
import type {
  AccountNetWorthSummary,
  LiabilitiesSummary,
  NetWorthEvolutionPoint,
} from "@/types/net-worth";

type Result<T> = { data: T } | { error: string };

/**
 * Fetches today's rate for every currency the net worth RPCs convert. They
 * only read cached rates, and only recent ones: without this a currency not
 * looked up in a week would show as having no rate. A failed lookup is left
 * for the RPCs to mark.
 */
export async function warmTodayRates(ctx: ServerContext, baseCurrency: string): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("user_valued_currencies");
  if (error) {
    console.error("warmTodayRates:", error.code);
    return;
  }
  const currencies = (data ?? []).filter((currency) => currency !== baseCurrency);
  const date = today();
  await forEachLimited(currencies, 4, async (from) => {
    await getFxQuote({ date, from, to: baseCurrency });
  });
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

    const accountResults = ((data ?? []) as Array<{
      month: number;
      account_id: string;
      account_name: string;
      account_type: string;
      currency: string;
      currency_symbol: string;
      balance: number | string;
      balance_base: number | string;
      investment_value: number | string;
      investment_value_base: number | string | null;
      investment_fx_rate_date: string | null;
    }>).map((row) => ({
      id: row.account_id,
      name: row.account_name,
      account_type: row.account_type,
      currency: row.currency,
      currency_symbol: row.currency_symbol,
      balance: Number(row.balance ?? 0),
      balance_base: Number(row.balance_base ?? 0),
      investment_value: Number(row.investment_value ?? 0),
      investment_value_base:
        row.investment_value_base != null ? Number(row.investment_value_base) : null,
      investment_fx_rate_date: row.investment_fx_rate_date,
    }));

    // Investments without a rate are left out rather than valued 1:1.
    const total = accountResults.reduce(
      (sum, account) => sum + account.balance_base + (account.investment_value_base ?? 0),
      0,
    );

    return {
      data: {
        year,
        month:
          data && data.length > 0
            ? Number((data[0] as { month: number | string }).month ?? 0)
            : 0,
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

    const summaryItems = ((data ?? []) as Array<{
      item_id: string;
      name: string;
      currency: string;
      currency_symbol: string;
      amount: number | string;
      amount_base: number | string | null;
      fx_rate_date: string | null;
    }>).map((item) => ({
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

    return { data: { year, total, items: summaryItems } };
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
        assets: number | string;
        liabilities: number | string;
        net_worth: number | string;
        fx_missing: boolean;
      }>).map((row) => ({
        month: Number(row.month ?? 0),
        assets: Number(row.assets ?? 0),
        liabilities: Number(row.liabilities ?? 0),
        netWorth: Number(row.net_worth ?? 0),
        fxMissing: row.fx_missing === true,
      })),
    };
  } catch (e) {
    console.error("loadNetWorthEvolution:", e);
    return { error: "Error al calcular evolución de patrimonio" };
  }
}
