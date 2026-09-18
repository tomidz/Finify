"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { formatAmount } from "@/lib/format";
import { remainingPlannedExpenses } from "@/lib/finance/budget-status";
import type { PeriodSummary } from "@/lib/finance/period-summary";
import type { BudgetSummaryVsActual } from "@/types/budget";

interface SafeToSpendCardProps {
  summary: PeriodSummary;
  budgetSummary: BudgetSummaryVsActual | undefined;
  currencySymbol: string;
}

export function SafeToSpendCard({
  summary,
  budgetSummary,
  currencySymbol,
}: SafeToSpendCardProps) {
  const remainingPlanned = remainingPlannedExpenses(budgetSummary?.categories ?? []);

  // Safe to spend = closing balance - remaining planned expenses
  const safeToSpend = summary.closingBase - remainingPlanned;

  const color =
    safeToSpend > 0
      ? "text-green-600"
      : safeToSpend === 0
        ? "text-yellow-600"
        : "text-red-600";

  const bgColor =
    safeToSpend > 0
      ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900"
      : safeToSpend === 0
        ? "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900"
        : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900";

  return (
    <Card className={`gap-0 py-0 ${bgColor}`}>
      <CardHeader className="px-4 pt-4 pb-1">
        <CardDescription className="text-xs font-medium uppercase tracking-wide">
          Disponible real
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className={`text-3xl font-bold ${color}`}>
          {currencySymbol} {formatAmount(Math.abs(safeToSpend))}
          {safeToSpend < 0 && (
            <span className="text-sm font-normal ml-1">(déficit)</span>
          )}
        </p>
        <p className="text-muted-foreground text-xs mt-1">
          Saldo actual menos gastos pendientes del presupuesto
        </p>
        {remainingPlanned > 0 && (
          <p className="text-muted-foreground text-xs">
            {currencySymbol} {formatAmount(remainingPlanned)} pendiente de
            gastar
          </p>
        )}
      </CardContent>
    </Card>
  );
}
