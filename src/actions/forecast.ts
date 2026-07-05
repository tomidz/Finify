"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrFetchFxRate } from "@/actions/fx";
import type { ForecastPoint } from "@/types/forecast";

type ActionResult<T> = { data: T } | { error: string };

const MONTH_LABELS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/**
 * Generate a 6-month financial forecast based on:
 * 1. Current account balances (actual closing balance)
 * 2. Recurring transactions (projected income/expenses)
 * 3. Falls back to average of last 3 months if no recurrings defined
 */
export async function getForecast(
  monthsAhead: number = 6
): Promise<ActionResult<ForecastPoint[]>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado" };

    // Get the latest month
    const { data: latestMonth } = await supabase
      .from("months")
      .select("id, year, month")
      .eq("user_id", user.id)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestMonth) return { data: [] };

    // Get opening balances + transactions for latest month to compute closing balance
    const [obRes, txRes] = await Promise.all([
      supabase
        .from("opening_balances")
        .select("opening_base_amount")
        .eq("month_id", latestMonth.id),
      supabase
        .from("transactions")
        .select("transaction_amounts ( base_amount )")
        .eq("month_id", latestMonth.id)
        .eq("user_id", user.id)
        .is("deleted_at", null),
    ]);

    let currentBalance = (obRes.data ?? []).reduce(
      (sum, ob) => sum + Number(ob.opening_base_amount ?? 0),
      0
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const tx of (txRes.data ?? []) as any[]) {
      const lines = Array.isArray(tx.transaction_amounts)
        ? tx.transaction_amounts
        : tx.transaction_amounts
          ? [tx.transaction_amounts]
          : [];
      for (const line of lines) {
        currentBalance += Number(line.base_amount ?? 0);
      }
    }

    // 2. Get recurring transactions for projections
    const { data: recurrings } = await supabase
      .from("recurring_transactions")
      .select("type, amount, base_amount, recurrence, currency, start_date, end_date")
      .eq("user_id", user.id)
      .eq("is_active", true);

    const { data: prefsRow } = await supabase
      .from("user_preferences")
      .select("base_currency")
      .eq("user_id", user.id)
      .maybeSingle();
    const baseCurrency = prefsRow?.base_currency ?? "USD";

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    // Last day covered by the forecast horizon
    let horizonYear = latestMonth.year;
    let horizonMonth = latestMonth.month + monthsAhead;
    horizonYear += Math.floor((horizonMonth - 1) / 12);
    horizonMonth = ((horizonMonth - 1) % 12) + 1;
    const horizonStr = `${horizonYear}-${String(horizonMonth).padStart(2, "0")}-31`;

    // Only recurrings that overlap the forecast window count. (The model is a
    // flat monthly average, so partial-window starts are approximated.)
    const activeRecurrings = (recurrings ?? []).filter((rec) => {
      if (rec.end_date && rec.end_date < todayStr) return false;
      if (rec.start_date && rec.start_date > horizonStr) return false;
      return true;
    });

    // Calculate monthly income/expenses from recurrings
    let monthlyIncome = 0;
    let monthlyExpenses = 0;

    if (activeRecurrings.length > 0) {
      for (const rec of activeRecurrings) {
        // base_amount may be null: convert `amount` from the recurring's
        // currency instead of booking raw foreign units as base currency.
        let baseAmt =
          rec.base_amount != null ? Math.abs(Number(rec.base_amount)) : null;
        if (baseAmt == null) {
          const rawAmt = Math.abs(Number(rec.amount));
          if (rec.currency === baseCurrency) {
            baseAmt = rawAmt;
          } else {
            const fx = await getOrFetchFxRate({
              date: todayStr,
              from: rec.currency,
              to: baseCurrency,
            });
            if ("error" in fx) continue; // skip rather than project a wrong number
            baseAmt = rawAmt * fx.data;
          }
        }
        const monthlyAmount = toMonthlyAmount(baseAmt, rec.recurrence);
        if (rec.type === "income") {
          monthlyIncome += monthlyAmount;
        } else {
          monthlyExpenses += monthlyAmount;
        }
      }
    } else {
      // Fallback: use average of last 3 months
      const { data: recentMonths } = await supabase
        .from("months")
        .select("id")
        .eq("user_id", user.id)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(3);

      if (recentMonths && recentMonths.length > 0) {
        const monthIds = recentMonths.map((m) => m.id);
        // Only real income/expense flows: `investment` cash deductions and
        // `correction` adjustments are not spending and used to inflate the
        // projected expenses (e.g. a $9k lot purchase → −$3k/month phantom).
        const { data: txData } = await supabase
          .from("transactions")
          .select(
            "transaction_type, transaction_amounts ( base_amount )"
          )
          .eq("user_id", user.id)
          .in("month_id", monthIds)
          .is("deleted_at", null)
          .in("transaction_type", ["income", "expense"]);

        let totalIncome = 0;
        let totalExpenses = 0;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const tx of (txData ?? []) as any[]) {
          const lines = Array.isArray(tx.transaction_amounts)
            ? tx.transaction_amounts
            : tx.transaction_amounts
              ? [tx.transaction_amounts]
              : [];
          const baseAmt = lines.reduce(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (s: number, l: any) => s + Math.abs(Number(l.base_amount ?? 0)),
            0
          );
          if (tx.transaction_type === "income") {
            totalIncome += baseAmt;
          } else {
            totalExpenses += baseAmt;
          }
        }

        const numMonths = recentMonths.length;
        if (numMonths > 0) {
          monthlyIncome = totalIncome / numMonths;
          monthlyExpenses = totalExpenses / numMonths;
        }
      }
    }

    // 3. Build forecast points
    const points: ForecastPoint[] = [];

    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Add current month as "actual"
    points.push({
      year: latestMonth.year,
      month: latestMonth.month,
      label: `${MONTH_LABELS[latestMonth.month - 1]} ${latestMonth.year}`,
      projected_balance: round2(currentBalance),
      projected_income: 0,
      projected_expenses: 0,
      is_actual: true,
    });

    // Project future months — keep full precision during accumulation, round only for output
    let runningBalance = currentBalance;
    let projYear = latestMonth.year;
    let projMonth = latestMonth.month;
    const netMonth = monthlyIncome - monthlyExpenses;

    for (let i = 0; i < monthsAhead; i++) {
      projMonth++;
      if (projMonth > 12) {
        projMonth = 1;
        projYear++;
      }

      runningBalance += netMonth;

      points.push({
        year: projYear,
        month: projMonth,
        label: `${MONTH_LABELS[projMonth - 1]} ${projYear}`,
        projected_balance: round2(runningBalance),
        projected_income: round2(monthlyIncome),
        projected_expenses: round2(monthlyExpenses),
        is_actual: false,
      });
    }

    return { data: points };
  } catch (e) {
    console.error("getForecast:", e);
    return { error: "Error al generar el forecast" };
  }
}

/** Convert any recurrence to a monthly equivalent */
function toMonthlyAmount(amount: number, recurrence: string): number {
  switch (recurrence) {
    case "weekly":
      return amount * (52 / 12); // ~4.33 weeks per month
    case "biweekly":
      return amount * (26 / 12); // ~2.17 times per month
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "yearly":
      return amount / 12;
    default:
      return amount;
  }
}
