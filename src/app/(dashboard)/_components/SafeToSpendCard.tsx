"use client";

import { StatCard } from "@/components/stat-card";
import { formatAmount, amountTone } from "@/lib/format";
import { remainingPlannedExpenses } from "@/lib/finance/budget-status";
import type { PeriodSummary } from "@/lib/finance/period-summary";
import type { BudgetSummaryVsActual } from "@/types/budget";

interface SafeToSpendCardProps {
  summary: PeriodSummary;
  /** Null when the budget could not be read: the amount is unknown, not the whole balance. */
  budgetSummary: BudgetSummaryVsActual | null;
  currencySymbol: string;
}

export function SafeToSpendCard({
  summary,
  budgetSummary,
  currencySymbol,
}: SafeToSpendCardProps) {
  const remainingPlanned = !budgetSummary ? null : remainingPlannedExpenses(budgetSummary.categories);

  // Safe to spend = closing balance - remaining planned expenses
  const safeToSpend = remainingPlanned === null ? null : summary.closingBase - remainingPlanned;

  return (
    <StatCard
      label="Disponible real"
      value={safeToSpend}
      currency={currencySymbol}
      signTone
      format={(n) => formatAmount(Math.abs(n))}
      // Rounded like the amount next to it.
      suffix={safeToSpend !== null && amountTone(safeToSpend) === "text-destructive" ? "(déficit)" : undefined}
      sub={
        remainingPlanned === null ? (
          <span>Presupuesto no disponible</span>
        ) : (
          <>
            <span>Saldo actual menos gastos pendientes del presupuesto</span>
            {remainingPlanned > 0 && (
              <span>
                {currencySymbol} {formatAmount(remainingPlanned)} pendiente de gastar
              </span>
            )}
          </>
        )
      }
    />
  );
}
