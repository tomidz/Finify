"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export interface UserPreferences {
  base_currency: string;
  fx_source: string;
}

type ActionResult<T> = { data: T } | { error: string };

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

    const { data, error } = await supabase
      .from("user_preferences")
      .select("base_currency, fx_source")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return { error: error.message };
    return {
      data: {
        base_currency: data?.base_currency ?? "USD",
        fx_source: data?.fx_source ?? "frankfurter",
      },
    };
  } catch {
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

    // base_currency is NOT NULL: when only fx_source changes, carry the
    // current value (or the default) so the upsert's insert arm is valid.
    let baseCurrency = parsed.data.base_currency;
    if (baseCurrency == null) {
      const { data: current } = await supabase
        .from("user_preferences")
        .select("base_currency")
        .eq("user_id", user.id)
        .maybeSingle();
      baseCurrency = current?.base_currency ?? "USD";
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
      },
    };
  } catch {
    return { error: "Error al actualizar preferencias" };
  }
}
