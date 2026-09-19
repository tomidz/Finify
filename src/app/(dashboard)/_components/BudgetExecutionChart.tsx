"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { chartAxisProps, formatCompactAmount } from "@/components/charts/axis";
import { ChartCard } from "@/components/charts/chart-card";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { BUDGET_STATUS_COLORS, CHART_NEUTRAL, CHART_PRIMARY } from "@/components/charts/palette";
import { ActionError } from "@/lib/action-result";
import { categoryExecution } from "@/lib/finance/budget-status";
import type { BudgetSummaryVsActual } from "@/types/budget";

// The screen leaves the budget out (null) when its read fails.
const BUDGET_UNAVAILABLE = new ActionError("El presupuesto no está disponible por ahora.");

interface BudgetExecutionChartProps {
  /** Null when it could not be read. */
  budgetSummary: BudgetSummaryVsActual | null;
  currencySymbol: string;
  /** A category of a single month opens its transactions. */
  monthId: string | null;
  onRetry?: () => void;
  loading?: boolean;
}

export function BudgetExecutionChart({
  budgetSummary,
  currencySymbol,
  monthId,
  onRetry,
  loading = false,
}: BudgetExecutionChartProps) {
  const router = useRouter();
  const data = useMemo(() => {
    const categories = budgetSummary?.categories ?? [];
    return categories
      .filter((cat) => cat.planned_amount !== 0 || cat.actual_amount !== 0)
      .map((cat) => ({
        name: cat.category_name,
        categoryId: cat.category_id,
        Planificado: cat.planned_amount,
        Real: cat.actual_amount,
        // Not `fill`: recharts 3 paints every bar of the item with it.
        statusColor: BUDGET_STATUS_COLORS[categoryExecution(cat).status],
      }));
  }, [budgetSummary]);

  return (
    <ChartCard
      title="Ejecución del presupuesto"
      description="Planificado vs real por categoría."
      height={Math.max(250, data.length * 45)}
      loading={loading}
      error={budgetSummary === null ? BUDGET_UNAVAILABLE : undefined}
      onRetry={onRetry}
      empty={data.length === 0}
      emptyTitle="Sin presupuesto"
      name="budget-execution"
      resetKeys={[data]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          style={{ cursor: monthId ? "pointer" : "default" }}
          onClick={(state) => {
            const categoryId = data[Number(state?.activeTooltipIndex)]?.categoryId;
            if (monthId && categoryId) router.push(`/transactions?month=${monthId}&category=${categoryId}`);
          }}
        >
          <XAxis
            dataKey="name"
            {...chartAxisProps}
            angle={-15}
            textAnchor="end"
            height={50}
          />
          <YAxis tickFormatter={formatCompactAmount} width={48} {...chartAxisProps} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: "var(--muted)" }}
            content={
              <ChartTooltip
                currency={currencySymbol}
                colorOf={(entry) => (entry.dataKey === "Real" ? entry.payload?.statusColor : entry.color)}
              />
            }
          />
          <Legend
            verticalAlign="top"
            iconSize={8}
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value) => <span className="text-muted-foreground">{value}</span>}
          />
          <Bar
            dataKey="Planificado"
            fill={CHART_NEUTRAL}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Bar dataKey="Real" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.categoryId} fill={entry.statusColor} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
