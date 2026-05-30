"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateSavingsGoalSchema,
  UpdateSavingsGoalSchema,
} from "@/lib/validations/savings-goals.schema";
import type { SavingsGoalWithRelations } from "@/types/savings-goals";

type ActionResult<T> = { data: T } | { error: string };

type GoalOverride = {
  current_amount: number;
  currency: string;
  currency_symbol: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGoal(row: any, override?: GoalOverride): SavingsGoalWithRelations {
  const target = Number(row.target_amount);
  const current = override
    ? override.current_amount
    : Number(row.current_amount);
  return {
    ...row,
    target_amount: target,
    current_amount: current,
    currency: override?.currency ?? row.currency,
    is_completed: target > 0 ? current >= target : Boolean(row.is_completed),
    account_name: row.accounts?.name ?? null,
    currency_symbol:
      override?.currency_symbol ?? row.currencies?.symbol ?? row.currency,
    progress_pct: target > 0 ? Math.min(100, (current / target) * 100) : 0,
    accounts: undefined,
    currencies: undefined,
  };
}

// Current balance of an account in its own currency:
// initial opening (earliest month) + sum of all non-deleted movement legs.
async function getLinkedAccountBalances(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountIds: string[],
): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  if (accountIds.length === 0) return balances;
  for (const id of accountIds) balances.set(id, 0);

  const { data: earliestMonth } = await supabase
    .from("months")
    .select("id")
    .eq("user_id", userId)
    .order("year", { ascending: true })
    .order("month", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (earliestMonth) {
    const { data: openings } = await supabase
      .from("opening_balances")
      .select("account_id, opening_amount")
      .eq("month_id", earliestMonth.id)
      .in("account_id", accountIds);
    for (const o of openings ?? []) {
      balances.set(o.account_id as string, Number(o.opening_amount));
    }
  }

  const { data: movements } = await supabase
    .from("transaction_amounts")
    .select("account_id, amount, transactions!inner(user_id, deleted_at)")
    .in("account_id", accountIds)
    .eq("transactions.user_id", userId)
    .is("transactions.deleted_at", null);

  for (const m of movements ?? []) {
    const id = m.account_id as string;
    balances.set(id, (balances.get(id) ?? 0) + Number(m.amount));
  }

  return balances;
}

// --- GET ALL GOALS ---
export async function getSavingsGoals(): Promise<
  ActionResult<SavingsGoalWithRelations[]>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { data, error } = await supabase
      .from("savings_goals")
      .select(
        `
        *,
        accounts ( name, currency ),
        currencies!currency ( symbol )
      `
      )
      .eq("user_id", user.id)
      .order("is_completed", { ascending: true })
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (error) return { error: error.message };

    const rows = data ?? [];

    // For account-linked goals, derive progress live from the account balance
    // so it can never drift from the real money moved into the account.
    const accountIds = [
      ...new Set(
        rows
          .filter((r) => r.account_id)
          .map((r) => r.account_id as string),
      ),
    ];

    const balances = await getLinkedAccountBalances(
      supabase,
      user.id,
      accountIds,
    );

    const symbolByCode = new Map<string, string>();
    if (accountIds.length > 0) {
      const { data: currencyRows } = await supabase
        .from("currencies")
        .select("code, symbol");
      for (const c of currencyRows ?? []) {
        symbolByCode.set(c.code as string, c.symbol as string);
      }
    }

    return {
      data: rows.map((row) => {
        if (!row.account_id || !balances.has(row.account_id)) {
          return mapGoal(row);
        }
        const accountCurrency =
          (row.accounts?.currency as string | undefined) ?? row.currency;
        return mapGoal(row, {
          current_amount: balances.get(row.account_id) ?? 0,
          currency: accountCurrency,
          currency_symbol: symbolByCode.get(accountCurrency) ?? accountCurrency,
        });
      }),
    };
  } catch (e) {
    console.error("getSavingsGoals:", e);
    return { error: "Error al obtener las metas de ahorro" };
  }
}

// --- CREATE GOAL ---
export async function createSavingsGoal(
  input: unknown
): Promise<ActionResult<SavingsGoalWithRelations>> {
  try {
    const parsed = CreateSavingsGoalSchema.safeParse(input);
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

    const { data, error } = await supabase
      .from("savings_goals")
      .insert({ ...parsed.data, user_id: user.id })
      .select(
        `
        *,
        accounts ( name ),
        currencies!currency ( symbol )
      `
      )
      .single();

    if (error) return { error: error.message };

    return { data: mapGoal(data) };
  } catch (e) {
    console.error("createSavingsGoal:", e);
    return { error: "Error al crear la meta de ahorro" };
  }
}

// --- UPDATE GOAL ---
export async function updateSavingsGoal(
  input: unknown
): Promise<ActionResult<SavingsGoalWithRelations>> {
  try {
    const parsed = UpdateSavingsGoalSchema.safeParse(input);
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

    const { data, error } = await supabase
      .from("savings_goals")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select(
        `
        *,
        accounts ( name ),
        currencies!currency ( symbol )
      `
      )
      .single();

    if (error) return { error: error.message };

    return { data: mapGoal(data) };
  } catch (e) {
    console.error("updateSavingsGoal:", e);
    return { error: "Error al actualizar la meta de ahorro" };
  }
}

// --- DELETE GOAL ---
export async function deleteSavingsGoal(
  id: string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const { error } = await supabase
      .from("savings_goals")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return { error: error.message };
    return { data: null };
  } catch (e) {
    console.error("deleteSavingsGoal:", e);
    return { error: "Error al eliminar la meta de ahorro" };
  }
}
