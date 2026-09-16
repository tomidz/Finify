import "server-only";

import type { ServerContext } from "@/lib/server/context";
import { resolveFxRates } from "@/lib/server/fx-range";
import type {
  TransactionAmountWithRelations,
  TransactionWithRelations,
} from "@/types/transactions";

type Result<T> = { data: T } | { error: string };

const TRANSACTION_WITH_LEGS = `
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
`;

/**
 * Maps transaction rows with their legs and revalues each leg at the rate of
 * its date. All rates for the batch are resolved with one cache read; a leg
 * whose rate is unavailable keeps `current_base_amount` undefined (the UI
 * falls back to the stored base amount) instead of failing the whole list.
 */
async function withCurrentBaseAmounts(
  ctx: ServerContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  baseCurrency: string,
): Promise<TransactionWithRelations[]> {
  const requests = rows.flatMap((row) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((row.transaction_amounts ?? []) as any[]).map((line) => ({
      date: row.date as string,
      from: line.original_currency as string,
    })),
  );
  const rateFor = await resolveFxRates(ctx.supabase, requests, baseCurrency);

  return rows.map((row) => {
    const category = Array.isArray(row.budget_categories)
      ? row.budget_categories[0]
      : row.budget_categories;
    const txDate = row.date as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const amounts: TransactionAmountWithRelations[] = ((row.transaction_amounts ?? []) as any[]).map((line) => {
      const amount = Number(line.amount);
      const originalCurrency = line.original_currency as string;
      const rate = txDate && originalCurrency && amount ? rateFor(txDate, originalCurrency) : null;
      return {
        id: line.id,
        transaction_id: line.transaction_id,
        account_id: line.account_id,
        amount,
        original_currency: originalCurrency,
        exchange_rate: Number(line.exchange_rate),
        base_amount: Number(line.base_amount),
        created_at: line.created_at,
        account_name: line.accounts?.name ?? "",
        account_currency_symbol: line.currencies?.symbol ?? line.original_currency,
        current_base_amount: rate != null ? amount * rate : undefined,
      };
    });

    return {
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
    };
  });
}

export async function loadTransactionsForMonths(
  ctx: ServerContext,
  monthIds: string[],
  baseCurrency: string,
): Promise<Result<TransactionWithRelations[]>> {
  if (monthIds.length === 0) return { data: [] };

  const { data, error } = await ctx.supabase
    .from("transactions")
    .select(TRANSACTION_WITH_LEGS)
    .eq("user_id", ctx.userId)
    .in("month_id", monthIds)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };

  return {
    data: await withCurrentBaseAmounts(ctx, data ?? [], baseCurrency),
  };
}
