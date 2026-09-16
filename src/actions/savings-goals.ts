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

// Current balance of each account in its own currency (account_balances,
// 0048): initial balance plus every non-deleted leg.
async function getLinkedAccountBalances(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountIds: string[],
): Promise<{ data: Map<string, number> } | { error: string }> {
  const balances = new Map<string, number>();
  if (accountIds.length === 0) return { data: balances };

  const { data, error } = await supabase.rpc("account_balances", {
    p_account_ids: accountIds,
  });
  if (error) return { error: error.message };
  for (const row of data ?? []) balances.set(row.account_id, Number(row.amount));
  return { data: balances };
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

    const linked = await getLinkedAccountBalances(supabase, accountIds);
    if ("error" in linked) return linked;
    const balances = linked.data;

    const symbolByCode = new Map<string, string>();
    if (accountIds.length > 0) {
      const { data: currencyRows } = await supabase
        .from("currencies")
        .select("code, symbol");
      for (const c of currencyRows ?? []) {
        symbolByCode.set(c.code as string, c.symbol as string);
      }
    }

    const mapped = rows.map((row) => {
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
    });

    // Re-sort on the COMPUTED completion: mapGoal derives it live for
    // account-linked goals, so the stored column the query ordered by can
    // disagree with what's displayed. Stable sort keeps deadline/name order.
    mapped.sort((a, b) => Number(a.is_completed) - Number(b.is_completed));

    return { data: mapped };
  } catch (e) {
    console.error("getSavingsGoals:", e);
    return { error: "Error al obtener las metas de ahorro" };
  }
}

// --- CREATE GOAL ---
/**
 * A goal linked to an account derives its progress from that account's
 * balance IN THE ACCOUNT'S CURRENCY, so the goal must share it — otherwise
 * `current/target` compares different units (ARS 12.000 marked a USD 10.000
 * goal complete). Also validates ownership (FK alone doesn't).
 */
async function validateGoalAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountId: string,
  goalCurrency: string | undefined,
): Promise<string | null> {
  const { data: account } = await supabase
    .from("accounts")
    .select("id, currency")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!account) return "Cuenta no encontrada";
  if (goalCurrency && account.currency !== goalCurrency) {
    return `La cuenta está en ${account.currency} pero la meta en ${goalCurrency}. Usá la misma moneda para vincularlas.`;
  }
  return null;
}

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

    if (parsed.data.account_id) {
      const accountError = await validateGoalAccount(
        supabase,
        user.id,
        parsed.data.account_id,
        parsed.data.currency,
      );
      if (accountError) return { error: accountError };
    }

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

    if (updates.account_id) {
      let effectiveCurrency = updates.currency;
      if (!effectiveCurrency) {
        const { data: existingGoal } = await supabase
          .from("savings_goals")
          .select("currency")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle();
        effectiveCurrency = existingGoal?.currency;
      }
      const accountError = await validateGoalAccount(
        supabase,
        user.id,
        updates.account_id,
        effectiveCurrency,
      );
      if (accountError) return { error: accountError };
    }

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
