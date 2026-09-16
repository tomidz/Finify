"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateAccountSchema,
  UpdateAccountSchema,
} from "@/lib/validations/account.schema";
import { getOrFetchFxRate } from "@/lib/server/fx";
import { today } from "@/lib/dates";
import {
  RECALCULATION_FAILED,
  recalculateOpeningBalances,
} from "@/lib/server/opening-balances";
import type { Account, Currency } from "@/types/accounts";

/** Devuelve el opening_base_amount correcto usando FX si es necesario. */
async function resolveOpeningBase(
  openingAmount: number,
  accountCurrency: string,
  baseCurrency: string,
  providedBase: number | undefined,
  providedRate: number | undefined,
): Promise<number> {
  if (openingAmount === 0) return 0;
  if (accountCurrency === baseCurrency) return openingAmount;
  // Si el usuario ingresó explícitamente el monto base, respetarlo
  if (providedBase !== undefined && providedBase > 0) return providedBase;
  // Si hay un TC válido distinto de 1 ingresado por el usuario, usarlo
  if (providedRate !== undefined && providedRate > 0 && providedRate !== 1) {
    return Math.round(openingAmount * providedRate * 100) / 100;
  }
  // Obtener TC actual del servidor (con caché en DB)
  const result = await getOrFetchFxRate({ date: today(), from: accountCurrency, to: baseCurrency });
  if ("error" in result) return 0; // crypto u otras monedas no soportadas
  return Math.round(openingAmount * result.data * 100) / 100;
}

type ActionResult<T> = { data: T } | { error: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Whether anything is already denominated in the account's currency: legs,
 * lots, sales or recurring templates. (A non-zero initial balance is on the
 * account row itself.)
 */
async function accountHasHistory(
  supabase: SupabaseServerClient,
  accountId: string,
): Promise<ActionResult<boolean>> {
  const countOnly = { count: "exact", head: true } as const;
  const results = await Promise.all([
    supabase.from("transaction_amounts").select("id", countOnly).eq("account_id", accountId),
    supabase.from("investments").select("id", countOnly).eq("account_id", accountId),
    supabase.from("investment_sales").select("id", countOnly).eq("account_id", accountId),
    supabase.from("recurring_transactions").select("id", countOnly).eq("account_id", accountId),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) return { error: failed.error.message };
  return { data: results.some((result) => (result.count ?? 0) > 0) };
}

// --- GET ACCOUNTS ---
export async function getAccounts(): Promise<ActionResult<Account[]>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", user.id)
      .order("name", { ascending: true });

    if (error) return { error: error.message };
    return { data: (data ?? []) as Account[] };
  } catch {
    return { error: "Error al obtener las cuentas" };
  }
}

// --- GET CURRENCIES ---
export async function getCurrencies(): Promise<ActionResult<Currency[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("currencies")
      .select("*")
      .order("code", { ascending: true });

    if (error) return { error: error.message };
    return { data: (data ?? []) as Currency[] };
  } catch {
    return { error: "Error al obtener las monedas" };
  }
}

// --- GET ACCOUNT WITH DETAIL ---
export async function getAccountById(
  accountId: string,
): Promise<ActionResult<Account>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: "Cuenta no encontrada" };
    return { data: data as Account };
  } catch {
    return { error: "Error al obtener la cuenta" };
  }
}

// --- GET ACCOUNT BALANCE HISTORY (per month, latest first) ---
export interface AccountMonthBalance {
  year: number;
  month: number;
  opening_amount: number;
  opening_base_amount: number;
  month_movements: number;
  month_base_movements: number;
  closing_amount: number;
  closing_base_amount: number;
}

export async function getAccountBalanceHistory(
  accountId: string,
): Promise<ActionResult<AccountMonthBalance[]>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase.rpc("account_month_balances", {
      p_account_id: accountId,
    });
    if (error) return { error: error.message };

    return {
      data: (data ?? []).map((row) => {
        const opening = Number(row.opening_amount);
        const openingBase = Number(row.opening_base_amount);
        const movements = Number(row.movements);
        const baseMovements = Number(row.base_movements);
        return {
          year: row.year,
          month: row.month,
          opening_amount: opening,
          opening_base_amount: openingBase,
          month_movements: movements,
          month_base_movements: baseMovements,
          closing_amount: opening + movements,
          closing_base_amount: openingBase + baseMovements,
        };
      }),
    };
  } catch {
    return { error: "Error al obtener el historial" };
  }
}

// --- GET ACCOUNT INITIAL BALANCE ---
export async function getAccountInitialBalance(
  accountId: string,
): Promise<ActionResult<{ opening_amount: number; opening_base_amount: number }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("accounts")
      .select("initial_amount, initial_base_amount")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: "Cuenta no encontrada" };

    return {
      data: {
        opening_amount: Number(data.initial_amount ?? 0),
        opening_base_amount: Number(data.initial_base_amount ?? 0),
      },
    };
  } catch {
    return { error: "Error al obtener el saldo inicial" };
  }
}

// --- GET ACCOUNT CURRENT BALANCE (closing as of now, account currency) ---
export async function getAccountCurrentBalance(
  accountId: string,
): Promise<ActionResult<{ amount: number; base_amount: number }>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase.rpc("account_balances", {
      p_account_ids: [accountId],
    });
    if (error) return { error: error.message };
    const balance = data?.[0];
    if (!balance) return { error: "Cuenta no encontrada" };

    // Not rounded: a crypto balance keeps its 8 decimals.
    return {
      data: {
        amount: Number(balance.amount),
        base_amount: Number(balance.base_amount),
      },
    };
  } catch {
    return { error: "Error al obtener el saldo actual" };
  }
}

// --- CREATE ACCOUNT ---
export async function createAccount(
  input: unknown,
): Promise<ActionResult<Account>> {
  try {
    const parsed = CreateAccountSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { initial_amount, exchange_rate, base_amount, ...accountFields } = parsed.data;
    const openingAmount = initial_amount ?? 0;

    const { data: prefsRow } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", user.id)
      .maybeSingle();
    const baseCurrency = prefsRow?.base_currency ?? "USD";

    const openingBase = await resolveOpeningBase(
      openingAmount,
      accountFields.currency,
      baseCurrency,
      base_amount,
      exchange_rate,
    );

    const { data, error } = await supabase
      .from("accounts")
      .insert({
        ...accountFields,
        user_id: user.id,
        initial_amount: openingAmount,
        initial_base_amount: openingBase,
        initial_base_currency: baseCurrency,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          error: "Ya existe una cuenta con ese nombre, moneda y tipo",
        };
      }
      return { error: error.message };
    }

    // Every existing month gets an opening row for the new account.
    const rebuilt = await recalculateOpeningBalances(null);
    if ("error" in rebuilt) return { error: RECALCULATION_FAILED };

    return { data: data as Account };
  } catch (e) {
    console.error("createAccount:", e);
    return { error: "Error al crear la cuenta" };
  }
}

// --- UPDATE ACCOUNT ---
export async function updateAccount(
  input: unknown,
): Promise<ActionResult<Account>> {
  try {
    const parsed = UpdateAccountSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const { id, initial_amount, exchange_rate, base_amount, ...accountUpdates } = parsed.data;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    let current: {
      currency: string;
      initial_amount: number | null;
      initial_base_amount: number | null;
    } | null = null;
    if (accountUpdates.currency !== undefined || initial_amount !== undefined) {
      const { data: stored, error: storedError } = await supabase
        .from("accounts")
        .select("currency, initial_amount, initial_base_amount")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (storedError) return { error: storedError.message };
      if (!stored) return { error: "Cuenta no encontrada" };
      current = stored;
    }

    if (current && accountUpdates.currency !== undefined && current.currency !== accountUpdates.currency) {
      const history =
        Number(current.initial_amount ?? 0) !== 0
          ? { data: true }
          : await accountHasHistory(supabase, id);
      if ("error" in history) return history;
      if (history.data) {
        return {
          error:
            "No se puede cambiar la moneda de una cuenta con movimientos, inversiones o saldo inicial. Creá una cuenta nueva en la otra moneda.",
        };
      }
    }

    let balanceUpdate: {
      initial_amount: number;
      initial_base_amount: number;
      initial_base_currency: string;
    } | null = null;
    if (current && initial_amount !== undefined) {
      const { data: prefsRow } = await supabase
        .from("user_preferences")
        .select("base_currency")
        .eq("user_id", user.id)
        .maybeSingle();
      const baseCurrency = prefsRow?.base_currency ?? "USD";

      const openingBase = await resolveOpeningBase(
        initial_amount,
        accountUpdates.currency ?? current.currency,
        baseCurrency,
        base_amount,
        exchange_rate,
      );

      // The same balance again rewrites nothing.
      const unchanged =
        Number(current.initial_amount ?? 0) === initial_amount &&
        Number(current.initial_base_amount ?? 0) === openingBase;
      if (!unchanged) {
        balanceUpdate = {
          initial_amount,
          initial_base_amount: openingBase,
          initial_base_currency: baseCurrency,
        };
      }
    }

    const { data, error } = await supabase
      .from("accounts")
      .update({ ...accountUpdates, ...balanceUpdate })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          error: "Ya existe una cuenta con ese nombre, moneda y tipo",
        };
      }
      return { error: error.message };
    }

    // The initial balance is part of every month's opening.
    if (balanceUpdate) {
      const rebuilt = await recalculateOpeningBalances(null);
      if ("error" in rebuilt) return { error: RECALCULATION_FAILED };
    }

    return { data: data as Account };
  } catch (e) {
    console.error("updateAccount:", e);
    return { error: "Error al actualizar la cuenta" };
  }
}

// --- DELETE ACCOUNT ---
export async function deleteAccount(id: string): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      if (error.code === "23503") {
        return {
          error:
            "No se puede eliminar: la cuenta tiene transacciones asociadas",
        };
      }
      return { error: error.message };
    }
    return { data: null };
  } catch {
    return { error: "Error al eliminar la cuenta" };
  }
}
