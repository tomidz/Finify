"use server";

import { createClient } from "@/lib/supabase/server";
import { getBaseCurrency } from "@/actions/transactions";
import { getOrFetchFxRate } from "@/lib/server/fx";
import { ledgerRpcError } from "@/lib/server/ledger-rpc";
import { getServerContext } from "@/lib/server/context";
import { loadRecurringOccurrences } from "@/lib/server/recurring-calendar";
import {
  CreateRecurringSchema,
  UpdateRecurringSchema,
} from "@/lib/validations/recurring.schema";
import type { PendingRecurring, RecurringWithRelations } from "@/types/recurring";

type ActionResult<T> = { data: T } | { error: string };

/** A template's amount is in its account's currency; null when it is. */
async function recurringCurrencyError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountId: string,
  currency: string,
): Promise<string | null> {
  const { data: account, error } = await supabase
    .from("accounts")
    .select("currency")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return error.message;
  if (!account) return "Cuenta no encontrada";
  if (account.currency !== currency) {
    return `La cuenta está en ${account.currency}: la recurrente tiene que estar en la misma moneda.`;
  }
  return null;
}

// --- GET ALL RECURRING ---
export async function getRecurringTransactions(): Promise<
  ActionResult<RecurringWithRelations[]>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("recurring_transactions")
      .select(
        `
        *,
        accounts ( name ),
        budget_categories ( name ),
        currencies!currency ( symbol )
      `
      )
      .eq("user_id", user.id)
      .order("description", { ascending: true });

    if (error) return { error: error.message };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = (data ?? []).map((row: any) => ({
      ...row,
      amount: Number(row.amount),
      exchange_rate: row.exchange_rate ? Number(row.exchange_rate) : null,
      base_amount: row.base_amount ? Number(row.base_amount) : null,
      account_name: row.accounts?.name ?? "",
      category_name: row.budget_categories?.name ?? null,
      currency_symbol: row.currencies?.symbol ?? row.currency,
      accounts: undefined,
      budget_categories: undefined,
      currencies: undefined,
    }));

    return { data: mapped as RecurringWithRelations[] };
  } catch (e) {
    console.error("getRecurringTransactions:", e);
    return { error: "Error al obtener las transacciones recurrentes" };
  }
}

// --- CREATE RECURRING ---
export async function createRecurring(
  input: unknown
): Promise<ActionResult<RecurringWithRelations>> {
  try {
    const parsed = CreateRecurringSchema.safeParse(input);
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

    const currencyError = await recurringCurrencyError(
      supabase,
      user.id,
      parsed.data.account_id,
      parsed.data.currency,
    );
    if (currencyError) return { error: currencyError };

    const { data, error } = await supabase
      .from("recurring_transactions")
      .insert({ ...parsed.data, user_id: user.id })
      .select(
        `
        *,
        accounts ( name ),
        budget_categories ( name ),
        currencies!currency ( symbol )
      `
      )
      .single();

    if (error) return { error: error.message };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;
    return {
      data: {
        ...row,
        amount: Number(row.amount),
        exchange_rate: row.exchange_rate ? Number(row.exchange_rate) : null,
        base_amount: row.base_amount ? Number(row.base_amount) : null,
        account_name: row.accounts?.name ?? "",
        category_name: row.budget_categories?.name ?? null,
        currency_symbol: row.currencies?.symbol ?? row.currency,
      } as RecurringWithRelations,
    };
  } catch (e) {
    console.error("createRecurring:", e);
    return { error: "Error al crear la transacción recurrente" };
  }
}

// --- UPDATE RECURRING ---
export async function updateRecurring(
  input: unknown
): Promise<ActionResult<RecurringWithRelations>> {
  try {
    const parsed = UpdateRecurringSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const { id, ...updates } = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    if (updates.account_id !== undefined || updates.currency !== undefined) {
      const { data: current, error: currentError } = await supabase
        .from("recurring_transactions")
        .select("account_id, currency")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (currentError) return { error: currentError.message };
      if (!current) return { error: "Recurrente no encontrada" };
      const currencyError = await recurringCurrencyError(
        supabase,
        user.id,
        updates.account_id ?? current.account_id,
        updates.currency ?? current.currency,
      );
      if (currencyError) return { error: currencyError };
    }

    const { data, error } = await supabase
      .from("recurring_transactions")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(
        `
        *,
        accounts ( name ),
        budget_categories ( name ),
        currencies!currency ( symbol )
      `
      )
      .single();

    if (error) return { error: error.message };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;
    return {
      data: {
        ...row,
        amount: Number(row.amount),
        exchange_rate: row.exchange_rate ? Number(row.exchange_rate) : null,
        base_amount: row.base_amount ? Number(row.base_amount) : null,
        account_name: row.accounts?.name ?? "",
        category_name: row.budget_categories?.name ?? null,
        currency_symbol: row.currencies?.symbol ?? row.currency,
      } as RecurringWithRelations,
    };
  } catch (e) {
    console.error("updateRecurring:", e);
    return { error: "Error al actualizar la transacción recurrente" };
  }
}

// --- DELETE RECURRING ---
export async function deleteRecurring(
  id: string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { error } = await supabase
      .from("recurring_transactions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { error: error.message };
    return { data: null };
  } catch (e) {
    console.error("deleteRecurring:", e);
    return { error: "Error al eliminar la transacción recurrente" };
  }
}

// --- GET PENDING RECURRING FOR MONTH ---
// Calculates which recurring transactions haven't been registered yet this month
export async function getPendingRecurring(
  year: number,
  month: number
): Promise<ActionResult<PendingRecurring[]>> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };

    const occurrences = await loadRecurringOccurrences(ctx, { year, month }, { year, month });
    if ("error" in occurrences) return occurrences;

    const results: PendingRecurring[] = occurrences.data.map((occurrence) => ({
      recurring: occurrence.recurring,
      expected_date: occurrence.date,
      is_registered: occurrence.registered,
    }));

    // Sort: unregistered first, then by date
    results.sort((a, b) => {
      if (a.is_registered !== b.is_registered)
        return a.is_registered ? 1 : -1;
      return a.expected_date.localeCompare(b.expected_date);
    });

    return { data: results };
  } catch (e) {
    console.error("getPendingRecurring:", e);
    return { error: "Error al obtener las recurrentes pendientes" };
  }
}

// --- REGISTER A PENDING OCCURRENCE AS A REAL TRANSACTION ---
// One click from the pending list: builds the transaction server-side with
// the recurring's data and a fresh FX conversion for the expected date.
export async function registerRecurringOccurrence(input: {
  recurring_id: string;
  date: string; // yyyy-MM-dd (the expected occurrence date)
}): Promise<ActionResult<null>> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "")) {
      return { error: "Fecha inválida" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data: rec, error: recError } = await supabase
      .from("recurring_transactions")
      .select("*")
      .eq("id", input.recurring_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (recError) return { error: recError.message };
    if (!rec) return { error: "Recurrente no encontrada" };

    const baseCurrencyResult = await getBaseCurrency();
    if ("error" in baseCurrencyResult) return baseCurrencyResult;
    const baseCurrency = baseCurrencyResult.data;

    const rawAmount = Math.abs(Number(rec.amount));
    let exchangeRate = 1;
    let baseAmount = rawAmount;
    if (rec.currency !== baseCurrency) {
      const fx = await getOrFetchFxRate({
        date: input.date,
        from: rec.currency,
        to: baseCurrency,
      });
      if ("error" in fx) return fx;
      exchangeRate = fx.data;
      baseAmount = Number((rawAmount * fx.data).toFixed(4));
    }

    // The transaction is created and linked to its occurrence together; an
    // occurrence already registered (another tab, a double click) is not
    // registered again.
    const sign = rec.type === "expense" ? -1 : 1;
    const { error } = await supabase.rpc("register_recurring_occurrence", {
      p_recurring_id: rec.id,
      p_occurrence_date: input.date,
      p_leg: {
        account_id: rec.account_id,
        amount: sign * rawAmount,
        exchange_rate: exchangeRate,
        base_amount: sign * baseAmount,
      },
    });
    if (error) {
      return ledgerRpcError("register_recurring_occurrence", error, "Error al registrar la recurrente");
    }
    return { data: null };
  } catch (e) {
    console.error("registerRecurringOccurrence:", e);
    return { error: "Error al registrar la recurrente" };
  }
}
