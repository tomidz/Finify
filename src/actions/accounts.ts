"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateAccountSchema,
  UpdateAccountSchema,
} from "@/lib/validations/account.schema";
import { getOrFetchFxRate } from "@/lib/server/fx";
import { monthCloseDate, today } from "@/lib/dates";
import { getServerContext, loadBaseCurrency, type ServerContext } from "@/lib/server/context";
import { resolveFxRates } from "@/lib/server/fx-range";
import {
  RECALCULATION_FAILED,
  recalculateOpeningBalances,
} from "@/lib/server/opening-balances";
import type { Account, Currency } from "@/types/accounts";
import type { ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/log";
import { dbError } from "@/lib/server/db-errors";

/** Devuelve el opening_base_amount correcto usando FX si es necesario. */
async function resolveOpeningBase(
  openingAmount: number,
  accountCurrency: string,
  baseCurrency: string,
  providedBase: number | undefined,
  providedRate: number | undefined,
): Promise<ActionResult<number>> {
  if (openingAmount === 0) return { data: 0 };
  if (accountCurrency === baseCurrency) return { data: openingAmount };
  // Si el usuario ingresó explícitamente el monto base, respetarlo
  if (providedBase !== undefined && providedBase > 0) return { data: providedBase };
  // Si hay un TC válido distinto de 1 ingresado por el usuario, usarlo
  if (providedRate !== undefined && providedRate > 0 && providedRate !== 1) {
    return { data: Math.round(openingAmount * providedRate * 100) / 100 };
  }
  // Obtener TC actual del servidor (con caché en DB)
  const result = await getOrFetchFxRate({ date: today(), from: accountCurrency, to: baseCurrency });
  if ("error" in result) {
    return {
      error: `No hay cotización de ${accountCurrency} a ${baseCurrency}: ingresá el tipo de cambio del saldo inicial.`,
    };
  }
  return { data: Math.round(openingAmount * result.data * 100) / 100 };
}

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
  if (failed?.error) return dbError("accountHasHistory", failed.error, "Error al revisar los movimientos de la cuenta");
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

    if (error) return dbError("getAccounts", error, "Error al obtener las cuentas");
    return { data: (data ?? []) as Account[] };
  } catch (e) {
    logError("getAccounts", e);
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

    if (error) return dbError("getCurrencies", error, "Error al obtener las monedas");
    return { data: (data ?? []) as Currency[] };
  } catch (e) {
    logError("getCurrencies", e);
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

    if (error) return dbError("getAccountById", error, "Error al obtener la cuenta");
    if (!data) return { error: "Cuenta no encontrada" };
    return { data: data as Account };
  } catch (e) {
    logError("getAccountById", e);
    return { error: "Error al obtener la cuenta" };
  }
}

/** Only fiat currencies have a provider: asking for any other rate only waits for a failure. */
async function hasProvider(supabase: ServerContext["supabase"], currency: string): Promise<boolean> {
  const { data, error } = await supabase.from("currencies").select("currency_type").eq("code", currency).maybeSingle();
  // Unknown: better to ask a provider than to show a fiat balance unquoted.
  if (error) {
    logError("hasProvider", error);
    return true;
  }
  return data?.currency_type === "fiat";
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
  /** At the month's close rate; without one, the stored base amounts. */
  closing_base_amount: number;
  closing_rate_missing: boolean;
}

export async function getAccountBalanceHistory(
  accountId: string,
): Promise<ActionResult<AccountMonthBalance[]>> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };

    const [{ data, error }, account, baseCurrency] = await Promise.all([
      ctx.supabase.rpc("account_month_balances", { p_account_id: accountId }),
      ctx.supabase
        .from("accounts")
        .select("currency")
        .eq("id", accountId)
        .eq("user_id", ctx.userId)
        .maybeSingle(),
      loadBaseCurrency(ctx),
    ]);
    if (error) return dbError("getAccountBalanceHistory", error, "Error al obtener el historial");
    if (account.error) return dbError("getAccountBalanceHistory", account.error, "Error al obtener el historial");
    if (!account.data) return { error: "Cuenta no encontrada" };
    if ("error" in baseCurrency) return baseCurrency;

    const currency = account.data.currency;
    const rows = ((data ?? []) as Array<{
      year: number;
      month: number;
      opening_amount: number | string;
      opening_base_amount: number | string;
      movements: number | string;
      base_movements: number | string;
    }>).map((row) => ({
      year: row.year,
      month: row.month,
      opening_amount: Number(row.opening_amount),
      opening_base_amount: Number(row.opening_base_amount),
      month_movements: Number(row.movements),
      month_base_movements: Number(row.base_movements),
      closing_amount: Number(row.opening_amount) + Number(row.movements),
    }));
    // Every balance is valued at the rate of its month's close.
    const rateAt = (await hasProvider(ctx.supabase, currency))
      ? await resolveFxRates(
          ctx.supabase,
          rows.map((row) => ({ date: monthCloseDate(row.year, row.month), from: currency })),
          baseCurrency.data,
        )
      : null;

    return {
      data: rows.map((row) => {
        const rate =
          currency === baseCurrency.data ? 1 : (rateAt?.(monthCloseDate(row.year, row.month), currency) ?? null);
        const missing = row.closing_amount !== 0 && rate == null;
        return {
          ...row,
          closing_base_amount:
            row.closing_amount === 0
              ? 0
              : rate != null
                ? row.closing_amount * rate
                : row.opening_base_amount + row.month_base_movements,
          closing_rate_missing: missing,
        };
      }),
    };
  } catch (e) {
    logError("getAccountBalanceHistory", e);
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

    if (error) return dbError("getAccountInitialBalance", error, "Error al obtener el saldo inicial");
    if (!data) return { error: "Cuenta no encontrada" };

    return {
      data: {
        opening_amount: Number(data.initial_amount ?? 0),
        opening_base_amount: Number(data.initial_base_amount ?? 0),
      },
    };
  } catch (e) {
    logError("getAccountInitialBalance", e);
    return { error: "Error al obtener el saldo inicial" };
  }
}

// --- GET ACCOUNT CURRENT AMOUNT (closing as of now, account currency) ---
export async function getAccountCurrentAmount(accountId: string): Promise<ActionResult<{ amount: number }>> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };
    const { data, error } = await ctx.supabase.rpc("account_balances", { p_account_ids: [accountId] });
    if (error) return dbError("getAccountCurrentAmount", error, "Error al obtener el saldo actual");
    const balance = data?.[0];
    if (!balance) return { error: "Cuenta no encontrada" };
    // Not rounded: a crypto balance keeps its 8 decimals.
    return { data: { amount: Number(balance.amount) } };
  } catch (e) {
    logError("getAccountCurrentAmount", e);
    return { error: "Error al obtener el saldo actual" };
  }
}

// --- GET ACCOUNT CURRENT BALANCE (also in the base currency, at today's rate) ---
export async function getAccountCurrentBalance(
  accountId: string,
): Promise<ActionResult<{ amount: number; base_amount: number; rate_missing: boolean }>> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };

    const [{ data, error }, account, baseCurrency] = await Promise.all([
      ctx.supabase.rpc("account_balances", { p_account_ids: [accountId] }),
      ctx.supabase
        .from("accounts")
        .select("currency")
        .eq("id", accountId)
        .eq("user_id", ctx.userId)
        .maybeSingle(),
      loadBaseCurrency(ctx),
    ]);
    if (error) return dbError("getAccountCurrentBalance", error, "Error al obtener el saldo actual");
    if (account.error) return dbError("getAccountCurrentBalance", account.error, "Error al obtener el saldo actual");
    if (!account.data) return { error: "Cuenta no encontrada" };
    if ("error" in baseCurrency) return baseCurrency;
    const balance = data?.[0];
    if (!balance) return { error: "Cuenta no encontrada" };

    // The balance is valued at today's rate, like every other balance.
    const amount = Number(balance.amount);
    const rate =
      amount === 0 || account.data.currency === baseCurrency.data
        ? 1
        : !(await hasProvider(ctx.supabase, account.data.currency))
          ? null
          : await getOrFetchFxRate({ date: today(), from: account.data.currency, to: baseCurrency.data }).then(
            (result) => ("error" in result ? null : result.data),
          );

    // Without a rate, the base amounts stored with its movements.
    return {
      data: {
        amount,
        base_amount: rate != null ? amount * rate : Number(balance.base_amount),
        rate_missing: rate == null,
      },
    };
  } catch (e) {
    logError("getAccountCurrentBalance", e);
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

    const baseCurrencyResult = await loadBaseCurrency({ supabase, userId: user.id });
    if ("error" in baseCurrencyResult) return baseCurrencyResult;
    const baseCurrency = baseCurrencyResult.data;

    const openingBase = await resolveOpeningBase(
      openingAmount,
      accountFields.currency,
      baseCurrency,
      base_amount,
      exchange_rate,
    );
    if ("error" in openingBase) return openingBase;

    const { data, error } = await supabase
      .from("accounts")
      .insert({
        ...accountFields,
        user_id: user.id,
        initial_amount: openingAmount,
        initial_base_amount: openingBase.data,
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
      return dbError("createAccount", error, "Error al crear la cuenta");
    }

    // Every existing month gets an opening row for the new account.
    const rebuilt = await recalculateOpeningBalances(null);
    if ("error" in rebuilt) return { error: RECALCULATION_FAILED };

    return { data: data as Account };
  } catch (e) {
    logError("createAccount", e);
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
      initial_base_currency: string | null;
    } | null = null;
    if (accountUpdates.currency !== undefined || initial_amount !== undefined) {
      const { data: stored, error: storedError } = await supabase
        .from("accounts")
        .select("currency, initial_amount, initial_base_amount, initial_base_currency")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (storedError) return dbError("updateAccount", storedError, "Error al actualizar la cuenta");
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
      const baseCurrencyResult = await loadBaseCurrency({ supabase, userId: user.id });
      if ("error" in baseCurrencyResult) return baseCurrencyResult;
      const baseCurrency = baseCurrencyResult.data;

      // The same balance, with no new rate, keeps the base it was converted at.
      const sameBalance =
        Number(current.initial_amount ?? 0) === initial_amount &&
        (accountUpdates.currency ?? current.currency) === current.currency &&
        current.initial_base_currency === baseCurrency &&
        base_amount === undefined &&
        (exchange_rate === undefined || exchange_rate === 1);
      if (!sameBalance) {
        const openingBase = await resolveOpeningBase(
          initial_amount,
          accountUpdates.currency ?? current.currency,
          baseCurrency,
          base_amount,
          exchange_rate,
        );
        if ("error" in openingBase) return openingBase;

        // The same balance again rewrites nothing.
        const unchanged =
          Number(current.initial_amount ?? 0) === initial_amount &&
          Number(current.initial_base_amount ?? 0) === openingBase.data;
        if (!unchanged) {
          balanceUpdate = {
            initial_amount,
            initial_base_amount: openingBase.data,
            initial_base_currency: baseCurrency,
          };
        }
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
      return dbError("updateAccount", error, "Error al actualizar la cuenta");
    }

    // The initial balance is part of every month's opening.
    if (balanceUpdate) {
      const rebuilt = await recalculateOpeningBalances(null);
      if ("error" in rebuilt) return { error: RECALCULATION_FAILED };
    }

    return { data: data as Account };
  } catch (e) {
    logError("updateAccount", e);
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
      return dbError("deleteAccount", error, "Error al eliminar la cuenta");
    }
    return { data: null };
  } catch (e) {
    logError("deleteAccount", e);
    return { error: "Error al eliminar la cuenta" };
  }
}
