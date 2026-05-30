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

    const payload: Record<string, string> = {};
    if (parsed.data.base_currency != null)
      payload.base_currency = parsed.data.base_currency;
    if (parsed.data.fx_source != null)
      payload.fx_source = parsed.data.fx_source;

    if (Object.keys(payload).length === 0) {
      return getUserPreferences();
    }

    const { data, error } = await supabase
      .from("user_preferences")
      .upsert(
        { user_id: user.id, ...payload },
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
