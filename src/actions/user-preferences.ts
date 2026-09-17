"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export interface UserPreferences {
  base_currency: string;
  fx_source: string;
  /** Accounts or budgets already hold amounts in the base currency. */
  base_currency_locked: boolean;
}

type ActionResult<T> = { data: T } | { error: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const BASE_CURRENCY_LOCKED =
  "La moneda base no se puede cambiar cuando ya hay cuentas o presupuestos: los montos guardados quedarían en la moneda anterior.";

/**
 * Base amounts are stored, not derived: transaction legs, opening balances,
 * recurring templates and budget plans all carry them. Every one of those
 * hangs off an account or a budget line.
 */
async function hasBaseCurrencyData(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<ActionResult<boolean>> {
  const countOnly = { count: "exact", head: true } as const;
  const [accounts, budgetLines] = await Promise.all([
    supabase.from("accounts").select("id", countOnly).eq("user_id", userId),
    supabase.from("budget_lines").select("id", countOnly).eq("user_id", userId),
  ]);
  const failed = accounts.error ?? budgetLines.error;
  if (failed) return { error: failed.message };
  return { data: (accounts.count ?? 0) + (budgetLines.count ?? 0) > 0 };
}

const UpdateUserPreferencesSchema = z.object({
  base_currency: z.string().min(1).optional(),
  fx_source: z.string().min(1).optional(),
});

export async function getUserPreferences(): Promise<
  ActionResult<UserPreferences>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    const [{ data, error }, locked] = await Promise.all([
      supabase
        .from("user_preferences")
        .select("base_currency, fx_source")
        .eq("user_id", user.id)
        .maybeSingle(),
      hasBaseCurrencyData(supabase, user.id),
    ]);

    if (error) return { error: error.message };
    if ("error" in locked) return locked;
    return {
      data: {
        base_currency: data?.base_currency ?? "USD",
        fx_source: data?.fx_source ?? "frankfurter",
        base_currency_locked: locked.data,
      },
    };
  } catch (e) {
    console.error("getUserPreferences:", e);
    return { error: "Error al obtener preferencias" };
  }
}

export async function updateUserPreferences(
  input: unknown,
): Promise<ActionResult<UserPreferences>> {
  try {
    const parsed = UpdateUserPreferencesSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error:
          parsed.error.issues[0]?.message ??
          "Datos inválidos para actualizar preferencias",
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    if (parsed.data.base_currency == null && parsed.data.fx_source == null) {
      return getUserPreferences();
    }

    const { data: current, error: currentError } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", user.id)
      .maybeSingle();
    if (currentError) return { error: currentError.message };
    const currentBase = current?.base_currency ?? "USD";

    // base_currency is NOT NULL: when only fx_source changes, carry the
    // current value (or the default) so the upsert's insert arm is valid.
    const baseCurrency = parsed.data.base_currency ?? currentBase;

    const hasData = await hasBaseCurrencyData(supabase, user.id);
    if ("error" in hasData) return hasData;
    if (baseCurrency !== currentBase && hasData.data) return { error: BASE_CURRENCY_LOCKED };

    if (baseCurrency !== currentBase) {
      // Exchange rates only exist between fiat currencies.
      const { data: currency, error: currencyError } = await supabase
        .from("currencies")
        .select("currency_type")
        .eq("code", baseCurrency)
        .maybeSingle();
      if (currencyError) return { error: currencyError.message };
      if (currency?.currency_type !== "fiat") {
        return { error: "La moneda base tiene que ser una moneda fiat." };
      }
    }

    const { data, error } = await supabase
      .from("user_preferences")
      .upsert(
        {
          user_id: user.id,
          base_currency: baseCurrency,
          ...(parsed.data.fx_source != null
            ? { fx_source: parsed.data.fx_source }
            : {}),
        },
        { onConflict: "user_id" },
      )
      .eq("user_id", user.id)
      .select("base_currency, fx_source")
      .single();

    if (error) return { error: error.message };
    return {
      data: {
        base_currency: data.base_currency,
        fx_source: data.fx_source,
        base_currency_locked: hasData.data,
      },
    };
  } catch (e) {
    console.error("updateUserPreferences:", e);
    return { error: "Error al actualizar preferencias" };
  }
}
