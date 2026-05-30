"use server";

import { createClient } from "@/lib/supabase/server";
import {
  CreateRecurringSchema,
  UpdateRecurringSchema,
} from "@/lib/validations/recurring.schema";
import type {
  RecurringWithRelations,
  PendingRecurring,
} from "@/types/recurring";

type ActionResult<T> = { data: T } | { error: string };

/** Tolerance for matching recurring amounts against existing transactions (15%) */
const RECURRING_AMOUNT_TOLERANCE = 0.15;

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    // 1. Get all active recurring transactions
    const { data: recurrings, error: recError } = await supabase
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
      .eq("is_active", true);

    if (recError) return { error: recError.message };
    if (!recurrings || recurrings.length === 0) return { data: [] };

    // 2. Get all transactions for this month to match against
    const { data: monthRow } = await supabase
      .from("months")
      .select("id")
      .eq("user_id", user.id)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    let existingTxs: { description: string; account_id: string; base_amount: number }[] = [];
    if (monthRow) {
      const { data: txData } = await supabase
        .from("transactions")
        .select("description, transaction_amounts ( account_id, base_amount )")
        .eq("user_id", user.id)
        .eq("month_id", monthRow.id)
        .is("deleted_at", null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existingTxs = (txData ?? []).map((tx: any) => {
        const firstLine = Array.isArray(tx.transaction_amounts)
          ? tx.transaction_amounts[0]
          : tx.transaction_amounts;
        return {
          description: (tx.description ?? "").toLowerCase().trim(),
          account_id: firstLine?.account_id ?? "",
          base_amount: Math.abs(Number(firstLine?.base_amount ?? 0)),
        };
      });
    }

    // 3. For each recurring, calculate expected dates and check if already registered
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0); // last day of month
    const results: PendingRecurring[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const rec of recurrings as any[]) {
      // Parse as local midnight so getDate()/getDay()/getMonth() are correct
      // regardless of timezone offset.
      const startStr = String(rec.start_date).slice(0, 10);
      const endStr = rec.end_date ? String(rec.end_date).slice(0, 10) : null;
      const startDate = new Date(`${startStr}T00:00:00`);
      const endDate = endStr ? new Date(`${endStr}T00:00:00`) : null;

      // Skip if not yet started or already ended
      if (startDate > monthEnd) continue;
      if (endDate && endDate < monthStart) continue;

      // Clamp generated dates to the active [start, end] window. Per-recurrence
      // generators work on the calendar month, so dates before the start or
      // after the end must be dropped here.
      const expectedDates = getExpectedDatesInMonth(
        rec.recurrence,
        rec.day_of_month,
        rec.day_of_week,
        year,
        month,
        startDate
      ).filter((d) => d >= startStr && (!endStr || d <= endStr));

      const mapped: RecurringWithRelations = {
        ...rec,
        amount: Number(rec.amount),
        exchange_rate: rec.exchange_rate ? Number(rec.exchange_rate) : null,
        base_amount: rec.base_amount ? Number(rec.base_amount) : null,
        account_name: rec.accounts?.name ?? "",
        category_name: rec.budget_categories?.name ?? null,
        currency_symbol: rec.currencies?.symbol ?? rec.currency,
      };

      for (const expectedDate of expectedDates) {
        // Check if a matching transaction exists (same description + account + similar amount)
        const descLower = rec.description.toLowerCase().trim();
        const recAmount = Math.abs(Number(rec.base_amount ?? rec.amount));
        const isRegistered = existingTxs.some(
          (tx) =>
            tx.description === descLower &&
            tx.account_id === rec.account_id &&
            Math.abs(tx.base_amount - recAmount) / (recAmount || 1) < RECURRING_AMOUNT_TOLERANCE
        );

        results.push({
          recurring: mapped,
          expected_date: expectedDate,
          is_registered: isRegistered,
        });
      }
    }

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

// --- Helper: calculate expected dates for a recurring in a given month ---
function getExpectedDatesInMonth(
  recurrence: string,
  dayOfMonth: number | null,
  dayOfWeek: number | null,
  year: number,
  month: number,
  startDate: Date
): string[] {
  const dates: string[] = [];
  const lastDay = new Date(year, month, 0).getDate();

  switch (recurrence) {
    case "monthly": {
      const day = Math.min(dayOfMonth ?? startDate.getDate(), lastDay);
      dates.push(
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      );
      break;
    }
    case "weekly": {
      const dow = dayOfWeek ?? startDate.getDay();
      // Find all occurrences of this day-of-week in the month
      for (let d = 1; d <= lastDay; d++) {
        const date = new Date(year, month - 1, d);
        if (date.getDay() === dow) {
          dates.push(
            `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
          );
        }
      }
      break;
    }
    case "biweekly": {
      // True 14-day cycle anchored on start_date (not "every other weekday in
      // the calendar month", which drifts across month boundaries).
      const monthStart = new Date(year, month - 1, 1);
      const cursor = new Date(startDate);
      while (cursor < monthStart) {
        cursor.setDate(cursor.getDate() + 14);
      }
      while (cursor.getFullYear() === year && cursor.getMonth() === month - 1) {
        dates.push(
          `${year}-${String(month).padStart(2, "0")}-${String(
            cursor.getDate()
          ).padStart(2, "0")}`
        );
        cursor.setDate(cursor.getDate() + 14);
      }
      break;
    }
    case "quarterly": {
      // Recur every 3 months from the start month
      const startM = startDate.getMonth() + 1; // 1-based
      const quarterMonths: number[] = [];
      for (let m = startM; m <= 12; m += 3) quarterMonths.push(m);
      for (let m = startM - 3; m >= 1; m -= 3) quarterMonths.push(m);
      if (quarterMonths.includes(month)) {
        const day = Math.min(dayOfMonth ?? startDate.getDate(), lastDay);
        dates.push(
          `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        );
      }
      break;
    }
    case "yearly": {
      if (startDate.getMonth() + 1 === month) {
        const day = Math.min(dayOfMonth ?? startDate.getDate(), lastDay);
        dates.push(
          `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        );
      }
      break;
    }
  }

  return dates;
}
