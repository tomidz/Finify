"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateTransactionSchema,
  CreateTransferSchema,
  UpdateTransactionSchema,
} from "@/lib/validations/transaction.schema";
import { getOrFetchFxRate } from "@/lib/server/fx";
import {
  normalizeSignedAmount,
  type SignedTransactionType,
} from "@/lib/ledger/sign";
import {
  buildTransferLines,
  transferRatesNeeded,
  type LedgerLine,
} from "@/lib/ledger/transfer";
import type {
  TransactionFeedFilters,
  TransactionFeedPage,
  TransactionWithRelations,
} from "@/types/transactions";
import { getServerContext, loadBaseCurrency } from "@/lib/server/context";
import { loadMonthsInRange } from "@/lib/server/months";
import { loadTransactionsForMonths } from "@/lib/server/transactions";
import { ledgerRpcError } from "@/lib/server/ledger-rpc";
import { dbError } from "@/lib/server/db-errors";
import { logError } from "@/lib/log";
import type { ActionResult } from "@/lib/action-result";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type TransactionAmountInput = LedgerLine;

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

async function resolveTransferLines({
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

  const needed = transferRatesNeeded({
    source: sourceAccount,
    destination: destAccount,
    baseCurrency,
  });
  const rates: { source?: number; destination?: number } = {};
  if (needed.source) {
    const fxResult = await getOrFetchFxRate({ date, from: sourceAccount.currency, to: baseCurrency });
    if ("error" in fxResult) return fxResult;
    rates.source = fxResult.data;
  }
  if (needed.destination) {
    const fxResult = await getOrFetchFxRate({ date, from: destAccount.currency, to: baseCurrency });
    if ("error" in fxResult) return fxResult;
    rates.destination = fxResult.data;
  }

  return {
    data: buildTransferLines({
      source: sourceAccount,
      destination: destAccount,
      baseCurrency,
      sourceAmount,
      destinationAmount,
      exchangeRate,
      fee,
      rates,
    }),
  };
}

type LedgerHeader = {
  transaction_type: string;
  date: string;
  description: string;
  category_id: string | null;
  notes: string | null;
  fee: number;
};

/**
 * Writes the header, the legs, the month and the opening balances in one
 * database transaction (0045). Creates without `id`; replaces the header and
 * legs of transaction `id` with it.
 */
async function saveLedgerTransaction(
  supabase: SupabaseServerClient,
  header: LedgerHeader,
  legs: TransactionAmountInput[],
  id?: string,
): Promise<ActionResult<{ id: string }>> {
  const { data, error } = await supabase.rpc("save_ledger_transaction", {
    p_header: header,
    p_legs: legs,
    p_id: id,
  });
  if (error) {
    return ledgerRpcError(
      "save_ledger_transaction",
      error,
      "No se pudo guardar la transacción",
    );
  }
  return { data: { id: data } };
}

// --- GET BASE CURRENCY ---
export async function getBaseCurrency(): Promise<ActionResult<string>> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };
    return await loadBaseCurrency(ctx);
  } catch (e) {
    logError("getBaseCurrency", e);
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
    if (error) return dbError("getUsageCounts", error, "Error al obtener conteos de uso");

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
  } catch (e) {
    logError("getUsageCounts", e);
    return { error: "Error al obtener conteos de uso" };
  }
}

// --- GET TRANSACTIONS (by month) ---
export async function getTransactions(
  monthId: string
): Promise<ActionResult<TransactionWithRelations[]>> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };
    const baseCurrency = await loadBaseCurrency(ctx);
    if ("error" in baseCurrency) return baseCurrency;
    return await loadTransactionsForMonths(ctx, [monthId], baseCurrency.data);
  } catch (e) {
    logError("getTransactions", e);
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
      p_search: input.search?.trim() || undefined,
      p_transaction_type: input.transaction_type ?? undefined,
      p_account_id: input.account_id ?? undefined,
      p_category_id: input.category_id ?? undefined,
      p_category_type: input.category_type ?? undefined,
    });

    if (error) return dbError("getTransactionsPage", error, "Error al obtener las transacciones");

    const items = mapTransactionRows((data ?? []) as Array<Record<string, unknown>>);

    return {
      data: {
        items,
        nextOffset: items.length === limit ? offset + items.length : null,
      },
    };
  } catch (e) {
    logError("getTransactionsPage", e);
    return { error: "Error al obtener las transacciones" };
  }
}

export async function getTransactionsForRange(
  startMonthId: string,
  endMonthId: string
): Promise<ActionResult<TransactionWithRelations[]>> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { error: "No autenticado" };

    const monthsResult = await loadMonthsInRange(ctx, startMonthId, endMonthId);
    if ("error" in monthsResult) return monthsResult;

    const baseCurrency = await loadBaseCurrency(ctx);
    if ("error" in baseCurrency) return baseCurrency;
    return await loadTransactionsForMonths(
      ctx,
      monthsResult.data.map((m) => m.id),
      baseCurrency.data,
    );
  } catch (e) {
    logError("getTransactionsForRange", e);
    return { error: "Error al obtener las transacciones" };
  }
}

// --- CREATE TRANSACTION ---
export async function createTransaction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
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

    // The schema only lets income, expense and correction through.
    const transactionType = parsed.data.transaction_type as SignedTransactionType;

    return await saveLedgerTransaction(
      supabase,
      {
        transaction_type: transactionType,
        date: parsed.data.date,
        description: parsed.data.description,
        category_id: parsed.data.category_id,
        notes: parsed.data.notes,
        fee: 0,
      },
      parsed.data.amounts.map((line) => ({
        ...line,
        amount: normalizeSignedAmount(transactionType, line.amount),
        base_amount: normalizeSignedAmount(transactionType, line.base_amount),
      })),
    );
  } catch (e) {
    logError("createTransaction", e);
    return { error: "Error al crear la transacción" };
  }
}

// --- CREATE TRANSFER (two linked rows) ---
export async function createTransfer(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
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

    // Lookup both accounts and currencies (maybeSingle avoids throwing on 0 rows)
    const accountById = (id: string) =>
      supabase
        .from("accounts")
        .select("id, currency")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
    const [source, destination] = await Promise.all([
      accountById(parsed.data.source_account_id),
      accountById(parsed.data.destination_account_id),
    ]);
    const lookupError = source.error ?? destination.error;
    if (lookupError) return dbError("createTransfer", lookupError, "No se pudieron leer las cuentas");
    const sourceAccount = source.data;
    const destAccount = destination.data;

    if (!sourceAccount) return { error: "Cuenta origen no encontrada" };

    if (!destAccount) return { error: "Cuenta destino no encontrada" };

    const transferLinesResult = await resolveTransferLines({
      date: parsed.data.date,
      sourceAccount,
      destAccount,
      sourceAmount: parsed.data.amount,
      destinationAmount: parsed.data.base_amount,
      exchangeRate: parsed.data.exchange_rate,
      fee: parsed.data.fee ?? 0,
    });
    if ("error" in transferLinesResult) return transferLinesResult;

    return await saveLedgerTransaction(
      supabase,
      {
        transaction_type: "transfer",
        date: parsed.data.date,
        description: parsed.data.description,
        category_id: null,
        notes: parsed.data.notes,
        fee: parsed.data.fee ?? 0,
      },
      transferLinesResult.data,
    );
  } catch (e) {
    logError("createTransfer", e);
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
): Promise<ActionResult<{ id: string }>> {
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

    const [{ data: existing, error: existingError }, { data: currentLines, error: linesError }] =
      await Promise.all([
        supabase
          .from("transactions")
          .select("id, transaction_type, date, fee, category_id, description, notes")
          .eq("id", id)
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .maybeSingle(),
        supabase
          .from("transaction_amounts")
          .select("account_id, amount, exchange_rate, base_amount")
          .eq("transaction_id", id),
      ]);

    const readError = existingError ?? linesError;
    if (readError) return dbError("updateTransaction", readError, "No se pudo leer la transacción");
    if (!existing) return { error: "Transacción no encontrada" };

    // The function replaces the whole transaction: omitted fields keep their
    // stored value, and so do the legs when no amount is sent.
    const storedLines: TransactionAmountInput[] = (currentLines ?? []).map((line) => ({
      account_id: line.account_id,
      amount: Number(line.amount),
      exchange_rate: Number(line.exchange_rate),
      base_amount: Number(line.base_amount),
    }));
    const header: LedgerHeader = {
      transaction_type: transaction_type ?? existing.transaction_type,
      date: updates.date ?? existing.date,
      description: updates.description ?? existing.description,
      category_id:
        updates.category_id === undefined ? existing.category_id : updates.category_id,
      notes: updates.notes === undefined ? existing.notes : updates.notes,
      fee: updates.fee ?? Number(existing.fee ?? 0),
    };

    let amountLines = amounts ?? null;

    if (existing.transaction_type === "transfer") {
      const sourceLine = amountLines?.find((line) => line.amount < 0) ??
        storedLines.find((line) => line.amount < 0);
      const destinationLine = amountLines?.find((line) => line.amount > 0) ??
        storedLines.find((line) => line.amount > 0);

      const sourceAccountId = source_account_id ?? sourceLine?.account_id;
      const destinationAccountId =
        destination_account_id ?? destinationLine?.account_id;

      if (!sourceAccountId || !destinationAccountId) {
        return { error: "Cuenta origen o destino no encontrada" };
      }

      const { data: transferAccounts, error: accountsError } = await supabase
        .from("accounts")
        .select("id, currency")
        .in("id", [sourceAccountId, destinationAccountId])
        .eq("user_id", user.id)
        .returns<{ id: string; currency: string }[]>();
      if (accountsError) {
        return dbError("updateTransaction", accountsError, "No se pudieron leer las cuentas");
      }

      const sourceAccount = transferAccounts?.find(
        (account) => account.id === sourceAccountId,
      );
      const destAccount = transferAccounts?.find(
        (account) => account.id === destinationAccountId,
      );

      if (!sourceAccount || !destAccount) {
        return { error: "Cuenta no encontrada" };
      }

      // sourceLine.amount already includes existing fee; subtract it to recover the net transfer amount
      const existingFee = Number(existing.fee ?? 0);
      const inferredSourceNet = Math.max(
        0,
        Math.abs(sourceLine?.amount ?? 0) - existingFee,
      );
      const transferLinesResult = await resolveTransferLines({
        date: header.date,
        sourceAccount,
        destAccount,
        sourceAmount: amount ?? inferredSourceNet,
        destinationAmount:
          base_amount ?? Math.abs(destinationLine?.amount ?? 0),
        exchangeRate:
          exchange_rate ?? sourceLine?.exchange_rate ?? destinationLine?.exchange_rate ?? 1,
        fee: header.fee,
      });
      if ("error" in transferLinesResult) return transferLinesResult;
      amountLines = transferLinesResult.data;
    } else if (!amountLines) {
      amountLines = buildLegacyAmountLines(
        existing.transaction_type,
        {
          amount,
          exchange_rate,
          base_amount,
          source_account_id,
          destination_account_id,
        },
        storedLines
      );
    }

    return await saveLedgerTransaction(supabase, header, amountLines ?? storedLines, id);
  } catch (e) {
    logError("updateTransaction", e);
    return { error: "Error al actualizar la transacción" };
  }
}

async function setTransactionDeleted(
  supabase: SupabaseServerClient,
  id: string,
  deleted: boolean,
): Promise<ActionResult<null>> {
  const { error } = await supabase.rpc("set_ledger_transaction_deleted", {
    p_id: id,
    p_deleted: deleted,
  });
  if (error?.code === "23505") {
    return { error: "Esa ocurrencia de la recurrente ya tiene otra transacción." };
  }
  if (error) {
    return ledgerRpcError(
      "set_ledger_transaction_deleted",
      error,
      deleted ? "Error al eliminar la transacción" : "Error al restaurar la transacción",
    );
  }
  return { data: null };
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

    return await setTransactionDeleted(supabase, id, true);
  } catch (e) {
    logError("deleteTransaction", e);
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

    return await setTransactionDeleted(supabase, id, false);
  } catch (e) {
    logError("restoreTransaction", e);
    return { error: "Error al restaurar la transacción" };
  }
}
