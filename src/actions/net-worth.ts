"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateNwItemSchema,
  UpdateNwItemSchema,
  UpsertNwSnapshotSchema,
} from "@/lib/validations/net-worth.schema";
import type {
  NwItem,
  NwItemWithRelations,
  NwMonthSummary,
  NwYearSummary,
  NwSnapshot,
  AccountNetWorthSummary,
  LiabilitiesSummary,
  LiabilitiesMonthSummary,
  NetWorthEvolutionPoint,
} from "@/types/net-worth";

import { fetchExchangeRate } from "@/lib/frankfurter";

type ActionResult<T> = { data: T } | { error: string };

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Build an FX rate map for converting currencies to baseCurrency.
 * First tries the fx_rates cache table, then falls back to Frankfurter API.
 */
async function buildFxMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  currencies: string[],
  baseCurrency: string
): Promise<Map<string, number>> {
  const fxMap = new Map<string, number>();
  fxMap.set(baseCurrency, 1);

  const nonBase = currencies.filter((c) => c !== baseCurrency);
  if (nonBase.length === 0) return fxMap;

  // Try cached rates first
  const { data: fxRows } = await supabase
    .from("fx_rates")
    .select("from_currency, rate")
    .in("from_currency", nonBase)
    .eq("to_currency", baseCurrency)
    .order("rate_date", { ascending: false });

  for (const fx of fxRows ?? []) {
    if (!fxMap.has(fx.from_currency)) {
      fxMap.set(fx.from_currency, Number(fx.rate));
    }
  }

  // For any missing currencies, fetch from Frankfurter API
  const missing = nonBase.filter((c) => !fxMap.has(c));
  if (missing.length > 0) {
    await Promise.all(
      missing.map(async (currency) => {
        try {
          const rate = await fetchExchangeRate(currency, baseCurrency);
          if (rate != null) fxMap.set(currency, rate);
        } catch {
          // Leave missing — will fallback to 1
        }
      })
    );
  }

  return fxMap;
}

export async function getNwItems(): Promise<
  ActionResult<NwItemWithRelations[]>
> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("nw_items")
      .select(
        `
        id, user_id, name, side, account_id, currency, display_order, created_at, updated_at,
        accounts ( name ),
        currencies ( symbol )
      `
      )
      .eq("user_id", userId)
      .order("display_order", { ascending: true })
      .order("side", { ascending: true })
      .order("name", { ascending: true });

    if (error) return { error: error.message };

    const mapped = (data ?? []).map((row) => {
      const accountRaw = row.accounts;
      const account = Array.isArray(accountRaw) ? accountRaw[0] : accountRaw;
      const currencyRaw = row.currencies;
      const currency = Array.isArray(currencyRaw) ? currencyRaw[0] : currencyRaw;
      return {
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        side: row.side,
        account_id: row.account_id,
        currency: row.currency,
        display_order: row.display_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
        account_name: (account as { name?: string })?.name ?? null,
        currency_symbol: (currency as { symbol?: string })?.symbol ?? row.currency,
      } as NwItemWithRelations;
    });

    return { data: mapped };
  } catch {
    return { error: "Error al obtener ítems de patrimonio" };
  }
}

export async function createNwItem(
  input: unknown
): Promise<ActionResult<NwItem>> {
  try {
    const parsed = CreateNwItemSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("nw_items")
      .insert({
        user_id: userId,
        name: parsed.data.name,
        side: parsed.data.side,
        account_id: parsed.data.account_id,
        currency: parsed.data.currency,
        display_order: parsed.data.display_order,
      })
      .select()
      .single();

    if (error) return { error: error.message };
    return { data: data as NwItem };
  } catch {
    return { error: "Error al crear ítem de patrimonio" };
  }
}

export async function updateNwItem(
  input: unknown
): Promise<ActionResult<NwItem>> {
  try {
    const parsed = UpdateNwItemSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const payload = { ...parsed.data, id: undefined };
    const clean = Object.fromEntries(
      Object.entries(payload).filter(
        ([_, v]) => v !== undefined && v !== null
      )
    ) as Record<string, unknown>;

    const { data, error } = await supabase
      .from("nw_items")
      .update(clean)
      .eq("id", parsed.data.id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) return { error: error.message };
    return { data: data as NwItem };
  } catch {
    return { error: "Error al actualizar ítem de patrimonio" };
  }
}

export async function deleteNwItem(id: string): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("nw_items")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return { error: error.message };
    return { data: null };
  } catch {
    return { error: "Error al eliminar ítem de patrimonio" };
  }
}

export async function getNwSnapshotsForMonth(
  year: number,
  month: number
): Promise<ActionResult<NwMonthSummary>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data: items, error: itemsError } = await supabase
      .from("nw_items")
      .select(
        `
        id, name, side, currency,
        currencies ( symbol )
      `
      )
      .eq("user_id", userId)
      .order("display_order", { ascending: true })
      .order("side", { ascending: true })
      .order("name", { ascending: true });

    if (itemsError) return { error: itemsError.message };

    const itemIds = (items ?? []).map((i) => i.id);
    let snapshots: { nw_item_id: string; amount: number; amount_base: number | null }[] = [];

    if (itemIds.length > 0) {
      const { data: snap, error: snapError } = await supabase
        .from("nw_snapshots")
        .select("nw_item_id, amount, amount_base")
        .in("nw_item_id", itemIds)
        .eq("year", year)
        .eq("month", month);

      if (snapError) return { error: snapError.message };
      snapshots = (snap ?? []).map((s) => ({
        nw_item_id: s.nw_item_id,
        amount: Number(s.amount),
        amount_base: s.amount_base != null ? Number(s.amount_base) : null,
      }));
    }

    const snapByItem = new Map(
      snapshots.map((s) => [s.nw_item_id, s])
    );

    // Fetch base currency
    const { data: userPref } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", userId)
      .maybeSingle();
    const baseCurrency = (userPref as { base_currency?: string })?.base_currency ?? "USD";

    const itemCurrencies = [...new Set((items ?? []).map((i) => i.currency as string))];
    const fxMap = await buildFxMap(supabase, itemCurrencies, baseCurrency);

    let totalAssets = 0;
    let totalLiabilities = 0;

    const summaryItems = (items ?? []).map((item) => {
      const snap = snapByItem.get(item.id);
      const amount = snap?.amount ?? 0;
      let amountBase = snap?.amount_base ?? null;

      // Always recalculate amount_base for non-base currencies using live FX rate
      if (amount !== 0 && item.currency !== baseCurrency) {
        // Revalue only when a live rate exists; a missing rate must fall
        // back to the stored amount_base, never to rate 1.
        const rate = fxMap.get(item.currency as string);
        if (rate != null) amountBase = amount * rate;
      }

      const currencyRaw = item.currencies;
      const currency = Array.isArray(currencyRaw) ? currencyRaw[0] : currencyRaw;
      const symbol = (currency as { symbol?: string })?.symbol ?? item.currency;

      const valueForTotal = amountBase ?? amount;
      if (item.side === "asset") {
        totalAssets += valueForTotal;
      } else {
        totalLiabilities += valueForTotal;
      }

      return {
        item_id: item.id,
        item_name: item.name,
        side: item.side,
        amount,
        amount_base: amountBase,
        currency: item.currency,
        currency_symbol: symbol,
      };
    });

    return {
      data: {
        year,
        month,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        net_worth: totalAssets - totalLiabilities,
        items: summaryItems,
      },
    };
  } catch {
    return { error: "Error al obtener snapshots de patrimonio" };
  }
}

export async function getNwSnapshotsForYear(
  year: number
): Promise<ActionResult<NwYearSummary>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data: items, error: itemsError } = await supabase
      .from("nw_items")
      .select(
        `
        id, name, side, currency,
        currencies ( symbol )
      `
      )
      .eq("user_id", userId)
      .order("display_order", { ascending: true })
      .order("side", { ascending: true })
      .order("name", { ascending: true });

    if (itemsError) return { error: itemsError.message };

    const itemIds = (items ?? []).map((i) => i.id);
    let snapshots: {
      nw_item_id: string;
      month: number;
      amount: number;
      amount_base: number | null;
    }[] = [];

    if (itemIds.length > 0) {
      // Fetch ALL snapshots for this year, then pick the latest month per item
      const { data: snap, error: snapError } = await supabase
        .from("nw_snapshots")
        .select("nw_item_id, month, amount, amount_base")
        .in("nw_item_id", itemIds)
        .eq("year", year)
        .order("month", { ascending: false });

      if (snapError) return { error: snapError.message };
      snapshots = (snap ?? []).map((s) => ({
        nw_item_id: s.nw_item_id,
        month: s.month,
        amount: Number(s.amount),
        amount_base: s.amount_base != null ? Number(s.amount_base) : null,
      }));
    }

    // Keep only the latest month snapshot per item
    const snapByItem = new Map<
      string,
      { month: number; amount: number; amount_base: number | null }
    >();
    for (const s of snapshots) {
      if (!snapByItem.has(s.nw_item_id)) {
        snapByItem.set(s.nw_item_id, s);
      }
    }

    // Fetch base currency
    const { data: userPrefYear } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", userId)
      .maybeSingle();
    const baseCurrencyYear = (userPrefYear as { base_currency?: string })?.base_currency ?? "USD";

    const itemCurrenciesYear = [...new Set((items ?? []).map((i) => i.currency as string))];
    const fxMapYear = await buildFxMap(supabase, itemCurrenciesYear, baseCurrencyYear);

    let totalAssets = 0;
    let totalLiabilities = 0;

    const summaryItems = (items ?? []).map((item) => {
      const snap = snapByItem.get(item.id);
      const amount = snap?.amount ?? 0;
      let amountBase = snap?.amount_base ?? null;
      const snapshotMonth = snap?.month ?? 0;

      // Always recalculate amount_base for non-base currencies using live FX rate
      if (amount !== 0 && item.currency !== baseCurrencyYear) {
        // Revalue only when a live rate exists; a missing rate must fall
        // back to the stored amount_base, never to rate 1.
        const rate = fxMapYear.get(item.currency as string);
        if (rate != null) amountBase = amount * rate;
      }

      const currencyRaw = item.currencies;
      const currency = Array.isArray(currencyRaw)
        ? currencyRaw[0]
        : currencyRaw;
      const symbol =
        (currency as { symbol?: string })?.symbol ?? item.currency;

      const valueForTotal = amountBase ?? amount;
      if (item.side === "asset") {
        totalAssets += valueForTotal;
      } else {
        totalLiabilities += valueForTotal;
      }

      return {
        item_id: item.id,
        item_name: item.name,
        side: item.side,
        amount,
        amount_base: amountBase,
        snapshot_month: snapshotMonth,
        currency: item.currency,
        currency_symbol: symbol,
      };
    });

    return {
      data: {
        year,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        net_worth: totalAssets - totalLiabilities,
        items: summaryItems,
      },
    };
  } catch {
    return { error: "Error al obtener snapshots anuales de patrimonio" };
  }
}

export async function upsertNwSnapshot(
  input: unknown
): Promise<ActionResult<NwSnapshot>> {
  try {
    const parsed = UpsertNwSnapshotSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data: item, error: itemError } = await supabase
      .from("nw_items")
      .select("id")
      .eq("id", parsed.data.nw_item_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (itemError) return { error: itemError.message };
    if (!item) return { error: "Ítem de patrimonio no encontrado" };

    const payload = {
      nw_item_id: parsed.data.nw_item_id,
      year: parsed.data.year,
      month: parsed.data.month,
      amount: parsed.data.amount,
      amount_base: parsed.data.amount_base ?? null,
    };

    const { data, error } = await supabase
      .from("nw_snapshots")
      .upsert(payload, { onConflict: "nw_item_id,year,month" })
      .select()
      .single();

    if (error) return { error: error.message };
    return {
      data: {
        ...data,
        amount: Number(data.amount),
        amount_base: data.amount_base != null ? Number(data.amount_base) : null,
      } as NwSnapshot,
    };
  } catch {
    return { error: "Error al guardar snapshot de patrimonio" };
  }
}

/* ------------------------------------------------------------------ */
/* Patrimonio neto automático — calculado desde saldos de cuentas      */
/* ------------------------------------------------------------------ */

export async function getAccountNetWorth(
  year: number
): Promise<ActionResult<AccountNetWorthSummary>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("account_net_worth_year", {
      p_year: year,
      p_base_currency: null,
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
      investment_value_base: number | string;
    }>).map((row) => ({
      id: row.account_id,
      name: row.account_name,
      account_type: row.account_type,
      currency: row.currency,
      currency_symbol: row.currency_symbol,
      balance: Number(row.balance ?? 0),
      balance_base: Number(row.balance_base ?? 0),
      investment_value: Number(row.investment_value ?? 0),
      investment_value_base: Number(row.investment_value_base ?? 0),
    }));

    const total = accountResults.reduce(
      (sum, account) => sum + account.balance_base + account.investment_value_base,
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
  } catch {
    return { error: "Error al calcular patrimonio neto" };
  }
}

/* ------------------------------------------------------------------ */
/* Pasivos — último snapshot de cada deuda para un año                  */
/* ------------------------------------------------------------------ */

export async function getLiabilitiesForYear(
  year: number
): Promise<ActionResult<LiabilitiesSummary>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("liabilities_year", {
      p_year: year,
      p_base_currency: null,
    });

    if (error) return { error: error.message };

    const summaryItems = ((data ?? []) as Array<{
      item_id: string;
      name: string;
      currency: string;
      currency_symbol: string;
      amount: number | string;
      amount_base: number | string | null;
    }>).map((item) => ({
      item_id: item.item_id,
      name: item.name,
      currency: item.currency,
      currency_symbol: item.currency_symbol,
      amount: Number(item.amount ?? 0),
      amount_base:
        item.amount_base != null ? Number(item.amount_base) : null,
    }));

    const total = summaryItems.reduce(
      (sum, item) => sum + (item.amount_base ?? item.amount),
      0,
    );

    return { data: { year, total, items: summaryItems } };
  } catch {
    return { error: "Error al obtener pasivos" };
  }
}

/* ------------------------------------------------------------------ */
/* Pasivos para un mes específico (con carry-forward)                  */
/* ------------------------------------------------------------------ */

export async function getLiabilitiesForMonth(
  year: number,
  month: number
): Promise<ActionResult<LiabilitiesMonthSummary>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();

    const { data: items, error: itemsError } = await supabase
      .from("nw_items")
      .select("id, name, currency, currencies ( symbol )")
      .eq("user_id", userId)
      .eq("side", "liability")
      .order("name");

    if (itemsError) return { error: itemsError.message };

    const itemIds = (items ?? []).map((i) => i.id);
    if (itemIds.length === 0) {
      return { data: { year, month, total: 0, items: [] } };
    }

    // Get the latest snapshot per item at or before the requested year/month.
    // We use two queries: one for the exact year (months <= target) and one
    // fallback for previous years, to avoid complex PostgREST OR filters.
    const { data: sameYearSnaps, error: syError } = await supabase
      .from("nw_snapshots")
      .select("nw_item_id, year, month, amount, amount_base")
      .in("nw_item_id", itemIds)
      .eq("year", year)
      .lte("month", month)
      .order("month", { ascending: false });

    if (syError) return { error: syError.message };

    // Keep only the latest snapshot per item from the same year
    const latestByItem = new Map<
      string,
      { amount: number; amount_base: number | null }
    >();
    for (const s of sameYearSnaps ?? []) {
      if (!latestByItem.has(s.nw_item_id)) {
        latestByItem.set(s.nw_item_id, {
          amount: Number(s.amount),
          amount_base: s.amount_base != null ? Number(s.amount_base) : null,
        });
      }
    }

    // Carry-forward: for items without a snapshot this year, check previous years
    const missingIds = itemIds.filter((id) => !latestByItem.has(id));
    if (missingIds.length > 0) {
      const { data: prevSnaps } = await supabase
        .from("nw_snapshots")
        .select("nw_item_id, amount, amount_base")
        .in("nw_item_id", missingIds)
        .lt("year", year)
        .order("year", { ascending: false })
        .order("month", { ascending: false });

      for (const s of prevSnaps ?? []) {
        if (!latestByItem.has(s.nw_item_id)) {
          latestByItem.set(s.nw_item_id, {
            amount: Number(s.amount),
            amount_base: s.amount_base != null ? Number(s.amount_base) : null,
          });
        }
      }
    }

    // Fetch base currency
    const { data: userPref } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", userId)
      .maybeSingle();
    const baseCurrency =
      (userPref as { base_currency?: string })?.base_currency ?? "USD";

    const itemCurrencies = [
      ...new Set((items ?? []).map((i) => i.currency as string)),
    ];
    const fxMap = await buildFxMap(supabase, itemCurrencies, baseCurrency);

    let total = 0;
    const summaryItems = (items ?? []).map((item) => {
      const snap = latestByItem.get(item.id);
      const amount = snap?.amount ?? 0;
      let amountBase = snap?.amount_base ?? null;

      if (amount !== 0 && item.currency !== baseCurrency) {
        // Revalue only when a live rate exists; a missing rate must fall
        // back to the stored amount_base, never to rate 1.
        const rate = fxMap.get(item.currency as string);
        if (rate != null) amountBase = amount * rate;
      }

      const currencyRaw = item.currencies;
      const currency = Array.isArray(currencyRaw)
        ? currencyRaw[0]
        : currencyRaw;
      const symbol =
        (currency as { symbol?: string })?.symbol ?? item.currency;

      total += amountBase ?? amount;

      return {
        item_id: item.id,
        name: item.name,
        currency: item.currency,
        currency_symbol: symbol,
        amount,
        amount_base: amountBase,
      };
    });

    return { data: { year, month, total, items: summaryItems } };
  } catch {
    return { error: "Error al obtener pasivos del mes" };
  }
}

/**
 * Get the current balance for a single debt item (carry-forward).
 * Used internally by debt activity actions to compute new balance.
 */
export async function getDebtCurrentBalance(
  nwItemId: string,
  year: number,
  month: number
): Promise<number> {
  const supabase = await createClient();

  // Try same year first
  const { data: sameYear } = await supabase
    .from("nw_snapshots")
    .select("amount")
    .eq("nw_item_id", nwItemId)
    .eq("year", year)
    .lte("month", month)
    .order("month", { ascending: false })
    .limit(1);

  if (sameYear && sameYear.length > 0) return Number(sameYear[0].amount);

  // Fallback to previous years
  const { data: prevYear } = await supabase
    .from("nw_snapshots")
    .select("amount")
    .eq("nw_item_id", nwItemId)
    .lt("year", year)
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(1);

  return prevYear && prevYear.length > 0 ? Number(prevYear[0].amount) : 0;
}

/* ------------------------------------------------------------------ */
/* Evolución mensual del patrimonio neto                               */
/* ------------------------------------------------------------------ */

export async function getNetWorthEvolution(
  year: number
): Promise<ActionResult<NetWorthEvolutionPoint[]>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("net_worth_evolution_year", {
      p_year: year,
      p_base_currency: null,
    });

    if (error) return { error: error.message };

    return {
      data: ((data ?? []) as Array<{
        month: number | string;
        assets: number | string;
        liabilities: number | string;
        net_worth: number | string;
      }>).map((row) => ({
        month: Number(row.month ?? 0),
        assets: Number(row.assets ?? 0),
        liabilities: Number(row.liabilities ?? 0),
        netWorth: Number(row.net_worth ?? 0),
      })),
    };
  } catch {
    return { error: "Error al calcular evolución de patrimonio" };
  }
}
