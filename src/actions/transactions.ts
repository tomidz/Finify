"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateTransactionSchema,
  CreateTransferSchema,
  UpdateTransactionSchema,
} from "@/lib/validations/transaction.schema";
import { getOrFetchFxRate } from "@/actions/fx";
import type {
  Transaction,
  TransactionFeedFilters,
  TransactionFeedPage,
  TransactionWithRelations,
  TransactionAmountWithRelations,
} from "@/types/transactions";
import { createMonth, getMonthsInRange, recalculateOpeningBalances } from "@/actions/months";

type ActionResult<T> = { data: T } | { error: string };

type TransactionAmountInput = {
  account_id: string;
  amount: number;
  exchange_rate: number;
  base_amount: number;
};

type TransactionFeedInput = {
  monthId: string;
  limit?: number;
  offset?: number;
} & TransactionFeedFilters;

function mapTransactionRows(
  rows: Array<Record<string, unknown>>,
): TransactionWithRelations[] {
  return rows.map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    month_id: (row.month_id as string | null) ?? null,
    category_id: (row.category_id as string | null) ?? null,
    transaction_type: row.transaction_type as TransactionWithRelations["transaction_type"],
    date: String(row.date),
    description: String(row.description ?? ""),
    notes: (row.notes as string | null) ?? null,
    fee: Number(row.fee ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    category_name: (row.category_name as string | null) ?? null,
    category_type: (row.category_type as TransactionWithRelations["category_type"]) ?? null,
    amounts: Array.isArray(row.amounts)
      ? (row.amounts as Array<Record<string, unknown>>).map((line) => ({
          id: String(line.id),
          transaction_id: String(line.transaction_id),
          account_id: String(line.account_id),
          amount: Number(line.amount ?? 0),
          original_currency: String(line.original_currency ?? ""),
          exchange_rate: Number(line.exchange_rate ?? 1),
          base_amount: Number(line.base_amount ?? 0),
          created_at: String(line.created_at),
          account_name: String(line.account_name ?? ""),
          account_currency_symbol: String(line.account_currency_symbol ?? ""),
          current_base_amount:
            line.current_base_amount != null
              ? Number(line.current_base_amount)
              : undefined,
        }))
      : [],
  }));
}

async function buildTransferLines({
  date,
  sourceAccount,
  destAccount,
  sourceAmount,
  destinationAmount,
  exchangeRate,
  fee,
}: {
  date: string;
  sourceAccount: { id: string; currency: string };
  destAccount: { id: string; currency: string };
  sourceAmount: number;
  destinationAmount: number;
  exchangeRate: number;
  fee: number;
}): Promise<ActionResult<TransactionAmountInput[]>> {
  const baseCurrencyResult = await getBaseCurrency();
  if ("error" in baseCurrencyResult) return baseCurrencyResult;

  const baseCurrency = baseCurrencyResult.data;
  // Source debit (gross) = transfer amount + fee, in source currency.
  // Destination credit = converted transfer amount, in dest currency.
  const transferAbsolute = Math.abs(sourceAmount);
  const feeAbsolute = Math.max(0, fee);
  const sourceDebit = transferAbsolute + feeAbsolute;
  const destinationAbsolute = Math.abs(destinationAmount);

  // base_amount is per-leg in user's base currency.
  let sourceBase: number;
  let destBase: number;

  if (sourceAccount.currency === baseCurrency) {
    sourceBase = sourceDebit;
  } else {
    const fxResult = await getOrFetchFxRate({
      date,
      from: sourceAccount.currency,
      to: baseCurrency,
    });
    if ("error" in fxResult) return fxResult;
    sourceBase = sourceDebit * fxResult.data;
  }

  if (destAccount.currency === baseCurrency) {
    destBase = destinationAbsolute;
  } else if (destAccount.currency === sourceAccount.currency) {
    // Same currency on both sides: dest in base = transferAbsolute converted using same rate as source
    destBase = (sourceBase * transferAbsolute) / sourceDebit;
  } else {
    const fxResult = await getOrFetchFxRate({
      date,
      from: destAccount.currency,
      to: baseCurrency,
    });
    if ("error" in fxResult) return fxResult;
    destBase = destinationAbsolute * fxResult.data;
  }

  return {
    data: [
      {
        account_id: sourceAccount.id,
        amount: -sourceDebit,
        exchange_rate: exchangeRate,
        base_amount: -Math.abs(sourceBase),
      },
      {
        account_id: destAccount.id,
        amount: destinationAbsolute,
        exchange_rate: exchangeRate,
        base_amount: Math.abs(destBase),
      },
    ],
  };
}

function normalizeSignedAmount(
  transactionType: "income" | "expense" | "correction",
  value: number
): number {
  if (transactionType === "income") return Math.abs(value);
  if (transactionType === "expense") return -Math.abs(value);
  return value;
}

async function resolveMonthIdFromDate(
  date: string
): Promise<ActionResult<string>> {
  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return { error: "Fecha inválida" };
  }

  const year = parsedDate.getFullYear();
  const month = parsedDate.getMonth() + 1;
  const monthResult = await createMonth(year, month);
  if ("error" in monthResult) return { error: monthResult.error };
  return { data: monthResult.data.id };
}

// --- GET BASE CURRENCY ---
export async function getBaseCurrency(): Promise<ActionResult<string>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", user.id)
      .single();

    return { data: data?.base_currency ?? "USD" };
  } catch (e) {
    console.error("getBaseCurrency:", e);
    return { error: "Error al obtener la moneda base" };
  }
}

// --- USAGE COUNTS (for sorting selectors) ---
export async function getUsageCounts(): Promise<
  ActionResult<{ accountCounts: Record<string, number>; categoryCounts: Record<string, number> }>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const accountCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};

    const { data, error } = await supabase.rpc("usage_counts");
    if (error) return { error: error.message };

    for (const row of (data ?? []) as Array<{
      entity_type: string;
      entity_id: string | null;
      usage_count: number | string;
    }>) {
      if (!row.entity_id) continue;
      const count = Number(row.usage_count ?? 0);
      if (row.entity_type === "account") {
        accountCounts[row.entity_id] = count;
      }
      if (row.entity_type === "category") {
        categoryCounts[row.entity_id] = count;
      }
    }

    return { data: { accountCounts, categoryCounts } };
  } catch {
    return { error: "Error al obtener conteos de uso" };
  }
}

// --- GET TRANSACTIONS (by month) ---
export async function getTransactions(
  monthId: string
): Promise<ActionResult<TransactionWithRelations[]>> {
  try {
    const baseCurrencyResult = await getBaseCurrency();
    if ("error" in baseCurrencyResult) return baseCurrencyResult;
    const baseCurrency = baseCurrencyResult.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("transactions")
      .select(
        `
        *,
        budget_categories ( name, category_type ),
        transaction_amounts (
          id,
          transaction_id,
          account_id,
          amount,
          original_currency,
          exchange_rate,
          base_amount,
          created_at,
          accounts ( name, currency ),
          currencies!original_currency ( symbol )
        )
      `
      )
      .eq("user_id", user.id)
      .eq("month_id", monthId)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return { error: error.message };

    const fxCache = new Map<string, number>();

    const getRate = async (date: string, from: string): Promise<number> => {
      if (from === baseCurrency) return 1;
      const key = `${date}:${from}:${baseCurrency}`;
      const cached = fxCache.get(key);
      if (cached != null) return cached;
      const result = await getOrFetchFxRate({ date, from, to: baseCurrency });
      if ("error" in result) {
        throw new Error(result.error);
      }
      fxCache.set(key, result.data);
      return result.data;
    };

    const mapped: TransactionWithRelations[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (data ?? []) as any[]) {
      const txDate = row.date as string;
      const amounts: TransactionAmountWithRelations[] = [];

      for (const line of row.transaction_amounts ?? []) {
        const amount = Number(line.amount);
        const originalCurrency = line.original_currency as string;
        let currentBaseAmount: number | undefined;
        if (txDate && originalCurrency && amount) {
          const rate = await getRate(txDate, originalCurrency);
          currentBaseAmount = amount * rate;
        }

        amounts.push({
          id: line.id,
          transaction_id: line.transaction_id,
          account_id: line.account_id,
          amount,
          original_currency: originalCurrency,
          exchange_rate: Number(line.exchange_rate),
          base_amount: Number(line.base_amount),
          created_at: line.created_at,
          account_name: line.accounts?.name ?? "",
          account_currency_symbol:
            line.currencies?.symbol ?? line.original_currency,
          current_base_amount: currentBaseAmount,
        });
      }

      mapped.push({
        id: row.id,
        user_id: row.user_id,
        month_id: row.month_id,
        category_id: row.category_id,
        transaction_type: row.transaction_type,
        date: row.date,
        description: row.description,
        notes: row.notes,
        fee: Number(row.fee ?? 0),
        created_at: row.created_at,
        updated_at: row.updated_at,
        category_name: row.budget_categories?.name ?? null,
        category_type: row.budget_categories?.category_type ?? null,
        amounts,
      });
    }

    return { data: mapped };
  } catch (e) {
    console.error("getTransactions:", e);
    return { error: "Error al obtener las transacciones" };
  }
}

export async function getTransactionsPage(
  input: TransactionFeedInput,
): Promise<ActionResult<TransactionFeedPage>> {
  try {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const offset = Math.max(input.offset ?? 0, 0);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase.rpc("transactions_feed", {
      p_month_id: input.monthId,
      p_limit: limit,
      p_offset: offset,
      p_search: input.search?.trim() || null,
      p_transaction_type: input.transaction_type ?? null,
      p_account_id: input.account_id ?? null,
      p_category_id: input.category_id ?? null,
      p_category_type: input.category_type ?? null,
    });

    if (error) return { error: error.message };

    const items = mapTransactionRows((data ?? []) as Array<Record<string, unknown>>);

    return {
      data: {
        items,
        nextOffset: items.length === limit ? offset + items.length : null,
      },
    };
  } catch (e) {
    console.error("getTransactionsPage:", e);
    return { error: "Error al obtener las transacciones" };
  }
}

export async function getTransactionsForRange(
  startMonthId: string,
  endMonthId: string
): Promise<ActionResult<TransactionWithRelations[]>> {
  const monthsResult = await getMonthsInRange(startMonthId, endMonthId);
  if ("error" in monthsResult) return monthsResult;
  const monthIds = monthsResult.data.map((m) => m.id);
  if (monthIds.length === 0) return { data: [] };

  try {
    const baseCurrencyResult = await getBaseCurrency();
    if ("error" in baseCurrencyResult) return baseCurrencyResult;
    const baseCurrency = baseCurrencyResult.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("transactions")
      .select(
        `
        *,
        budget_categories ( name, category_type ),
        transaction_amounts (
          id,
          transaction_id,
          account_id,
          amount,
          original_currency,
          exchange_rate,
          base_amount,
          created_at,
          accounts ( name, currency ),
          currencies!original_currency ( symbol )
        )
      `
      )
      .eq("user_id", user.id)
      .in("month_id", monthIds)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return { error: error.message };

    const fxCache = new Map<string, number>();

    const getRate = async (date: string, from: string): Promise<number> => {
      if (from === baseCurrency) return 1;
      const key = `${date}:${from}:${baseCurrency}`;
      const cached = fxCache.get(key);
      if (cached != null) return cached;
      const result = await getOrFetchFxRate({ date, from, to: baseCurrency });
      if ("error" in result) {
        throw new Error(result.error);
      }
      fxCache.set(key, result.data);
      return result.data;
    };

    const mapped: TransactionWithRelations[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (data ?? []) as any[]) {
      const cat = row.budget_categories;
      const category = Array.isArray(cat) ? cat[0] : cat;
      const txDate = row.date as string;
      const amounts: TransactionAmountWithRelations[] = [];

      for (const line of row.transaction_amounts ?? []) {
        const amount = Number(line.amount);
        const originalCurrency = line.original_currency as string;
        let currentBaseAmount: number | undefined;
        if (txDate && originalCurrency && amount) {
          const rate = await getRate(txDate, originalCurrency);
          currentBaseAmount = amount * rate;
        }

        amounts.push({
          id: line.id,
          transaction_id: line.transaction_id,
          account_id: line.account_id,
          amount,
          original_currency: originalCurrency,
          exchange_rate: Number(line.exchange_rate),
          base_amount: Number(line.base_amount),
          created_at: line.created_at,
          account_name: line.accounts?.name ?? "",
          account_currency_symbol:
            line.currencies?.symbol ?? line.original_currency,
          current_base_amount: currentBaseAmount,
        });
      }

      mapped.push({
        id: row.id,
        user_id: row.user_id,
        month_id: row.month_id,
        category_id: row.category_id,
        transaction_type: row.transaction_type,
        date: row.date,
        description: row.description,
        notes: row.notes,
        fee: Number(row.fee ?? 0),
        created_at: row.created_at,
        updated_at: row.updated_at,
        category_name: category?.name ?? null,
        category_type: category?.category_type ?? null,
        amounts,
      });
    }

    return { data: mapped };
  } catch (e) {
    console.error("getTransactionsForRange:", e);
    return { error: "Error al obtener las transacciones" };
  }
}

// --- CREATE TRANSACTION ---
export async function createTransaction(
  input: unknown
): Promise<ActionResult<Transaction>> {
  try {
    const parsed = CreateTransactionSchema.safeParse(input);
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
    const resolvedMonth = await resolveMonthIdFromDate(parsed.data.date);
    if ("error" in resolvedMonth) return { error: resolvedMonth.error };

    const amountLines = parsed.data.amounts;
    const accountIds = [...new Set(amountLines.map((line) => line.account_id))];
    const { data: accounts, error: accountError } = await supabase
      .from("accounts")
      .select("id, currency")
      .in("id", accountIds)
      .eq("user_id", user.id)
      .returns<{ id: string; currency: string }[]>();

    if (accountError) return { error: accountError.message };
    if (!accounts || accounts.length !== accountIds.length) {
      return { error: "Cuenta no encontrada" };
    }

    if (parsed.data.transaction_type === "transfer") {
      return { error: "Usá createTransfer para transferencias" };
    }
    const transactionType = parsed.data.transaction_type as
      | "income"
      | "expense"
      | "correction";

    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        month_id: resolvedMonth.data,
        category_id: parsed.data.category_id,
        transaction_type: parsed.data.transaction_type,
        date: parsed.data.date,
        description: parsed.data.description,
        notes: parsed.data.notes,
      })
      .select()
      .single();

    if (txError) {
      if (txError.code === "23503") {
        return { error: "Cuenta o categoría no encontrada" };
      }
      return { error: txError.message };
    }

    const accountById = new Map(accounts.map((acc) => [acc.id, acc.currency]));

    const rows = amountLines.map((line) => {
      const signedAmount = normalizeSignedAmount(
        transactionType,
        line.amount
      );
      const signedBaseAmount = normalizeSignedAmount(
        transactionType,
        line.base_amount
      );

      return {
        transaction_id: transaction.id,
        account_id: line.account_id,
        amount: signedAmount,
        original_currency: accountById.get(line.account_id) ?? "USD",
        exchange_rate: line.exchange_rate,
        base_amount: signedBaseAmount,
      };
    });

    const { error: lineError } = await supabase
      .from("transaction_amounts")
      .insert(rows);

    if (lineError) {
      try {
        await supabase.from("transactions").delete().eq("id", transaction.id);
      } catch (cleanupErr) {
        console.error("Cleanup failed after transaction line insert error:", cleanupErr);
      }
      if (lineError.code === "23503") {
        return { error: "Cuenta no encontrada" };
      }
      return { error: lineError.message };
    }

    // Recalculate opening balances for subsequent months
    recalculateOpeningBalances(resolvedMonth.data).catch(console.error);

    return { data: transaction as Transaction };
  } catch (e) {
    console.error("createTransaction:", e);
    return { error: "Error al crear la transacción" };
  }
}

// --- CREATE TRANSFER (two linked rows) ---
export async function createTransfer(
  input: unknown
): Promise<ActionResult<Transaction>> {
  try {
    const parsed = CreateTransferSchema.safeParse(input);
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
    const resolvedMonth = await resolveMonthIdFromDate(parsed.data.date);
    if ("error" in resolvedMonth) return { error: resolvedMonth.error };

    // Lookup both accounts and currencies (maybeSingle avoids throwing on 0 rows)
    const { data: sourceAccount } = await supabase
      .from("accounts")
      .select("id, currency")
      .eq("id", parsed.data.source_account_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sourceAccount) return { error: "Cuenta origen no encontrada" };

    const { data: destAccount } = await supabase
      .from("accounts")
      .select("id, currency")
      .eq("id", parsed.data.destination_account_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!destAccount) return { error: "Cuenta destino no encontrada" };

    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        month_id: resolvedMonth.data,
        category_id: null,
        transaction_type: "transfer" as const,
        date: parsed.data.date,
        description: parsed.data.description,
        notes: parsed.data.notes,
        fee: parsed.data.fee ?? 0,
      })
      .select()
      .single();

    if (txError) return { error: txError.message };

    const transferLinesResult = await buildTransferLines({
      date: parsed.data.date,
      sourceAccount,
      destAccount,
      sourceAmount: parsed.data.amount,
      destinationAmount: parsed.data.base_amount,
      exchangeRate: parsed.data.exchange_rate,
      fee: parsed.data.fee ?? 0,
    });
    if ("error" in transferLinesResult) return transferLinesResult;

    const transferLines = transferLinesResult.data;

    const rows = transferLines.map((line) => ({
      transaction_id: transaction.id,
      account_id: line.account_id,
      amount: line.amount,
      original_currency:
        line.account_id === sourceAccount.id
          ? sourceAccount.currency
          : destAccount.currency,
      exchange_rate: line.exchange_rate,
      base_amount: line.base_amount,
    }));

    const { error: lineError } = await supabase
      .from("transaction_amounts")
      .insert(rows);

    if (lineError) {
      try {
        await supabase.from("transactions").delete().eq("id", transaction.id);
      } catch (cleanupErr) {
        console.error("Cleanup failed after transfer line insert error:", cleanupErr);
      }
      return { error: lineError.message };
    }

    // Recalculate opening balances for subsequent months
    recalculateOpeningBalances(resolvedMonth.data).catch(console.error);

    return { data: transaction as Transaction };
  } catch (e) {
    console.error("createTransfer:", e);
    return { error: "Error al crear la transferencia" };
  }
}

function buildLegacyAmountLines(
  existingType: string,
  updates: {
    amount?: number;
    exchange_rate?: number;
    base_amount?: number;
    source_account_id?: string;
    destination_account_id?: string;
  },
  currentLines: { account_id: string; amount: number }[]
): TransactionAmountInput[] | null {
  if (
    updates.amount == null ||
    updates.exchange_rate == null ||
    updates.base_amount == null
  ) {
    return null;
  }

  if (existingType === "transfer") {
    const sourceFromCurrent =
      currentLines.find((line) => line.amount < 0)?.account_id ??
      currentLines[0]?.account_id;
    const destinationFromCurrent =
      currentLines.find((line) => line.amount > 0)?.account_id ??
      currentLines[1]?.account_id;

    const sourceAccountId = updates.source_account_id ?? sourceFromCurrent;
    const destinationAccountId =
      updates.destination_account_id ?? destinationFromCurrent;

    if (!sourceAccountId || !destinationAccountId) return null;

    return [
      {
        account_id: sourceAccountId,
        amount: -Math.abs(updates.amount),
        exchange_rate: updates.exchange_rate,
        base_amount: -Math.abs(updates.base_amount),
      },
      {
        account_id: destinationAccountId,
        amount: Math.abs(updates.amount),
        exchange_rate: updates.exchange_rate,
        base_amount: Math.abs(updates.base_amount),
      },
    ];
  }

  const existingLine = currentLines[0];
  if (!existingLine) return null;
  return [
    {
      account_id: existingLine.account_id,
      amount: normalizeSignedAmount(
        existingType as "income" | "expense" | "correction",
        updates.amount
      ),
      exchange_rate: updates.exchange_rate,
      base_amount: normalizeSignedAmount(
        existingType as "income" | "expense" | "correction",
        updates.base_amount
      ),
    },
  ];
}

// --- UPDATE TRANSACTION ---
export async function updateTransaction(
  input: unknown
): Promise<ActionResult<Transaction>> {
  try {
    const parsed = UpdateTransactionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const {
      id,
      transaction_type,
      amounts,
      source_account_id,
      destination_account_id,
      amount,
      exchange_rate,
      base_amount,
      ...updates
    } = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data: existing } = await supabase
      .from("transactions")
      .select("id, transaction_type, month_id, date, fee")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!existing) return { error: "Transacción no encontrada" };
    if (transaction_type && transaction_type !== existing.transaction_type) {
      return { error: "No se puede cambiar el tipo de transacción" };
    }

    let nextMonthId: string | undefined;
    if (updates.date) {
      const resolvedMonth = await resolveMonthIdFromDate(updates.date);
      if ("error" in resolvedMonth) return { error: resolvedMonth.error };
      nextMonthId = resolvedMonth.data;
    }

    const payload = {
      ...updates,
      ...(nextMonthId ? { month_id: nextMonthId } : {}),
    };

    const { data: updatedTransaction, error: txError } = await supabase
      .from("transactions")
      .update(payload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (txError) return { error: txError.message };

    let amountLines = amounts ?? null;

    if (existing.transaction_type === "transfer") {
      const { data: currentLines } = await supabase
        .from("transaction_amounts")
        .select("account_id, amount, exchange_rate")
        .eq("transaction_id", id);

      const sourceLine = amountLines?.find((line) => line.amount < 0) ??
        currentLines?.find((line) => line.amount < 0);
      const destinationLine = amountLines?.find((line) => line.amount > 0) ??
        currentLines?.find((line) => line.amount > 0);

      const sourceAccountId = source_account_id ?? sourceLine?.account_id;
      const destinationAccountId =
        destination_account_id ?? destinationLine?.account_id;

      if (!sourceAccountId || !destinationAccountId) {
        return { error: "Cuenta origen o destino no encontrada" };
      }

      const { data: transferAccounts } = await supabase
        .from("accounts")
        .select("id, currency")
        .in("id", [sourceAccountId, destinationAccountId])
        .eq("user_id", user.id)
        .returns<{ id: string; currency: string }[]>();

      if (!transferAccounts || transferAccounts.length !== 2) {
        return { error: "Cuenta no encontrada" };
      }

      const sourceAccount = transferAccounts.find(
        (account) => account.id === sourceAccountId,
      );
      const destAccount = transferAccounts.find(
        (account) => account.id === destinationAccountId,
      );

      if (!sourceAccount || !destAccount) {
        return { error: "Cuenta no encontrada" };
      }

      const nextFee = updates.fee ?? Number(existing.fee ?? 0);
      // sourceLine.amount already includes existing fee; subtract it to recover the net transfer amount
      const existingFee = Number(existing.fee ?? 0);
      const inferredSourceNet = Math.max(
        0,
        Math.abs(sourceLine?.amount ?? 0) - existingFee,
      );
      const transferLinesResult = await buildTransferLines({
        date: updates.date ?? existing.date,
        sourceAccount,
        destAccount,
        sourceAmount: amount ?? inferredSourceNet,
        destinationAmount:
          base_amount ?? Math.abs(destinationLine?.amount ?? 0),
        exchangeRate:
          exchange_rate ?? sourceLine?.exchange_rate ?? destinationLine?.exchange_rate ?? 1,
        fee: nextFee,
      });
      if ("error" in transferLinesResult) return transferLinesResult;
      amountLines = transferLinesResult.data;
    } else if (!amountLines) {
      const { data: currentLines } = await supabase
        .from("transaction_amounts")
        .select("account_id, amount")
        .eq("transaction_id", id);

      amountLines = buildLegacyAmountLines(
        existing.transaction_type,
        {
          amount,
          exchange_rate,
          base_amount,
          source_account_id,
          destination_account_id,
        },
        currentLines ?? []
      );
    }

    if (amountLines) {
      const accountIds = [...new Set(amountLines.map((line) => line.account_id))];
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, currency")
        .in("id", accountIds)
        .eq("user_id", user.id)
        .returns<{ id: string; currency: string }[]>();

      if (!accounts || accounts.length !== accountIds.length) {
        return { error: "Cuenta no encontrada" };
      }

      const accountById = new Map(accounts.map((acc) => [acc.id, acc.currency]));

      const { error: deleteLinesError } = await supabase
        .from("transaction_amounts")
        .delete()
        .eq("transaction_id", id);

      if (deleteLinesError) return { error: deleteLinesError.message };

      const rows = amountLines.map((line) => ({
        transaction_id: id,
        account_id: line.account_id,
        amount: line.amount,
        original_currency: accountById.get(line.account_id) ?? "USD",
        exchange_rate: line.exchange_rate,
        base_amount: line.base_amount,
      }));

      const { error: insertLinesError } = await supabase
        .from("transaction_amounts")
        .insert(rows);

      if (insertLinesError) return { error: insertLinesError.message };
    }

    // Recalculate opening balances for subsequent months
    const affectedMonthId = nextMonthId ?? existing.month_id;
    if (affectedMonthId) {
      recalculateOpeningBalances(affectedMonthId).catch(console.error);
      // If transaction moved between months, also recalculate from the old month
      if (nextMonthId && nextMonthId !== existing.month_id && existing.month_id) {
        recalculateOpeningBalances(existing.month_id).catch(console.error);
      }
    }

    return { data: updatedTransaction as Transaction };
  } catch (e) {
    console.error("updateTransaction:", e);
    return { error: "Error al actualizar la transacción" };
  }
}

// --- DELETE TRANSACTION (soft-delete) ---
export async function deleteTransaction(
  id: string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data: tx } = await supabase
      .from("transactions")
      .select("month_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!tx) return { error: "Transacción no encontrada" };

    const { error } = await supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { error: error.message };

    // Recalculate opening balances for subsequent months
    if (tx.month_id) {
      recalculateOpeningBalances(tx.month_id).catch(console.error);
    }

    return { data: null };
  } catch (e) {
    console.error("deleteTransaction:", e);
    return { error: "Error al eliminar la transacción" };
  }
}

// --- RESTORE TRANSACTION (undo soft-delete) ---
export async function restoreTransaction(
  id: string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data: tx } = await supabase
      .from("transactions")
      .select("month_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .not("deleted_at", "is", null)
      .maybeSingle();

    if (!tx) return { error: "Transacción no encontrada" };

    const { error } = await supabase
      .from("transactions")
      .update({ deleted_at: null })
      .eq("id", id)
      .eq("user_id", user.id)
      .not("deleted_at", "is", null);

    if (error) return { error: error.message };

    // Recalculate opening balances for subsequent months
    if (tx.month_id) {
      recalculateOpeningBalances(tx.month_id).catch(console.error);
    }

    return { data: null };
  } catch (e) {
    console.error("restoreTransaction:", e);
    return { error: "Error al restaurar la transacción" };
  }
}
