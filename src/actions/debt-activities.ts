"use server";

import { createClient } from "@/lib/supabase/server";
import {
  RecordDebtPaymentSchema,
  RecordDebtAdjustmentSchema,
} from "@/lib/validations/debt-activity.schema";
import { getOrFetchFxRate } from "@/lib/server/fx";
import { loadBaseCurrency } from "@/lib/server/context";
import { ledgerRpcError } from "@/lib/server/ledger-rpc";
import type { DebtActivity } from "@/types/net-worth";
import type { ActionResult } from "@/lib/action-result";
import { logError } from "@/lib/log";
import { dbError } from "@/lib/server/db-errors";

async function fxRate(from: string, to: string, date: string): Promise<number | null> {
  if (from === to) return 1;
  const fx = await getOrFetchFxRate({ date, from, to });
  if ("error" in fx) return null;
  return fx.data;
}

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* Record a debt payment                                               */
/* ------------------------------------------------------------------ */

export async function recordDebtPayment(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = RecordDebtPaymentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { nw_item_id, date, amount, account_id, category_id, description } =
      parsed.data;

    // Verify the nw_item belongs to this user and is a liability
    const { data: nwItem, error: nwError } = await supabase
      .from("nw_items")
      .select("id, currency")
      .eq("id", nw_item_id)
      .eq("user_id", userId)
      .eq("side", "liability")
      .single();

    if (nwError || !nwItem) return { error: "Deuda no encontrada" };

    // Resolve account currency and base currency for proper FX
    const { data: account, error: accError } = await supabase
      .from("accounts")
      .select("currency")
      .eq("id", account_id)
      .eq("user_id", userId)
      .single();
    if (accError || !account) return { error: "Cuenta no encontrada" };

    const baseCurrencyResult = await loadBaseCurrency({ supabase, userId });
    if ("error" in baseCurrencyResult) return baseCurrencyResult;
    const baseCurrency = baseCurrencyResult.data;
    const accountCurrency = account.currency as string;
    const liabilityCurrency = nwItem.currency as string;

    // The expense is in the account's currency (the money actually leaving the
    // account) and the balance change in the debt's. The caller-provided
    // amount_base is ignored because the client may convert from the wrong
    // currency.
    const [accountRate, accountToDebtRate, debtRate] = await Promise.all([
      fxRate(accountCurrency, baseCurrency, date),
      fxRate(accountCurrency, liabilityCurrency, date),
      fxRate(liabilityCurrency, baseCurrency, date),
    ]);
    if (accountRate == null) {
      return { error: "No se pudo obtener el tipo de cambio para la cuenta" };
    }
    if (accountToDebtRate == null || debtRate == null) {
      return { error: "No se pudo obtener el tipo de cambio para la deuda" };
    }

    const { data, error } = await supabase.rpc("record_debt_payment", {
      p_nw_item_id: nw_item_id,
      p_header: {
        transaction_type: "expense",
        date,
        description,
        category_id,
        notes: null,
        fee: 0,
      },
      p_leg: {
        account_id,
        amount: -amount,
        exchange_rate: accountRate,
        base_amount: -amount * accountRate,
      },
      p_debt_amount: amount * accountToDebtRate,
      p_debt_rate: debtRate,
    });
    if (error) {
      return ledgerRpcError("record_debt_payment", error, "Error al registrar el pago");
    }

    return { data: { id: data } };
  } catch (e) {
    logError("recordDebtPayment", e);
    return { error: "Error al registrar el pago" };
  }
}

/* ------------------------------------------------------------------ */
/* Record a debt adjustment (interest or manual adjustment)            */
/* ------------------------------------------------------------------ */

export async function recordDebtAdjustment(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = RecordDebtAdjustmentSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { nw_item_id, date, amount, amount_base, activity_type, description } =
      parsed.data;

    // Verify the nw_item belongs to this user and is a liability
    const { data: nwItem, error: nwError } = await supabase
      .from("nw_items")
      .select("id, currency")
      .eq("id", nw_item_id)
      .eq("user_id", userId)
      .eq("side", "liability")
      .single();

    if (nwError || !nwItem) return { error: "Deuda no encontrada" };

    const baseCurrencyResult = await loadBaseCurrency({ supabase, userId });
    if ("error" in baseCurrencyResult) return baseCurrencyResult;
    const baseCurrency = baseCurrencyResult.data;
    // For adjustments/interest, `amount` is already in the liability currency.
    const debtRate = await fxRate(nwItem.currency as string, baseCurrency, date);
    if (debtRate == null) {
      return { error: "No se pudo obtener el tipo de cambio para la deuda" };
    }

    // No transaction: interest and adjustments don't move bank money.
    const { data, error } = await supabase.rpc("record_debt_adjustment", {
      p_nw_item_id: nw_item_id,
      p_activity_type: activity_type,
      p_date: date,
      p_amount: amount,
      p_debt_rate: debtRate,
      p_amount_base: amount_base ?? undefined,
      p_description: description || undefined,
    });
    if (error) {
      return ledgerRpcError("record_debt_adjustment", error, "Error al registrar el ajuste");
    }

    return { data: { id: data } };
  } catch (e) {
    logError("recordDebtAdjustment", e);
    return { error: "Error al registrar el ajuste" };
  }
}

/* ------------------------------------------------------------------ */
/* Reverse a payment, interest charge or adjustment                    */
/* ------------------------------------------------------------------ */

export async function reverseDebtActivity(
  activityId: string
): Promise<ActionResult<null>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("reverse_debt_activity", {
      p_activity_id: activityId,
    });
    if (error) {
      return ledgerRpcError("reverse_debt_activity", error, "Error al revertir el movimiento");
    }
    return { data: null };
  } catch (e) {
    logError("reverseDebtActivity", e);
    return { error: "Error al revertir el movimiento" };
  }
}

/* ------------------------------------------------------------------ */
/* Get debt activities (payment history)                               */
/* ------------------------------------------------------------------ */

export async function getDebtActivities(
  nwItemId: string
): Promise<ActionResult<DebtActivity[]>> {
  try {
    const userId = await getUserId();
    if (!userId) return { error: "No autenticado" };

    const supabase = await createClient();

    // Verify item belongs to user
    const { data: nwItem, error: nwError } = await supabase
      .from("nw_items")
      .select("id")
      .eq("id", nwItemId)
      .eq("user_id", userId)
      .single();

    if (nwError || !nwItem) return { error: "Deuda no encontrada" };

    const { data: activities, error } = await supabase
      .from("debt_activities")
      .select("*")
      .eq("nw_item_id", nwItemId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return dbError("getDebtActivities", error, "Error al obtener historial");

    const mapped: DebtActivity[] = (activities ?? []).map((a) => ({
      id: a.id,
      nw_item_id: a.nw_item_id,
      transaction_id: a.transaction_id,
      activity_type: a.activity_type,
      date: a.date,
      amount: Number(a.amount),
      amount_base: a.amount_base != null ? Number(a.amount_base) : null,
      description: a.description,
      created_at: a.created_at,
    }));

    return { data: mapped };
  } catch (e) {
    logError("getDebtActivities", e);
    return { error: "Error al obtener historial" };
  }
}
