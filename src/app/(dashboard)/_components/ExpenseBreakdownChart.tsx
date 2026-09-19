"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ArrowLeft } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import {
  CATEGORY_TYPE_COLORS,
  UNCATEGORIZED_COLOR,
  seriesColor,
} from "@/components/charts/palette";
import { PageButton } from "@/components/page-button";
import type { PeriodSummary } from "@/lib/finance/period-summary";
import { BUDGET_CATEGORY_LABELS, type BudgetCategoryType } from "@/types/budget";

interface ExpenseBreakdownChartProps {
  /** Null while it loads. */
  summary: PeriodSummary | null;
  currencySymbol: string;
  /** A category of a single month opens its transactions. */
  monthId: string | null;
}

export function ExpenseBreakdownChart({
  summary,
  currencySymbol,
  monthId,
}: ExpenseBreakdownChartProps) {
  const router = useRouter();
  const [drillType, setDrillType] = useState<BudgetCategoryType | null>(null);

  const typeData = useMemo(() => {
    if (!summary) return [];
    const raw = [
      {
        name: "Gastos Esenciales",
        value: summary.essentialExpenses,
        fill: CATEGORY_TYPE_COLORS.essential_expenses,
        type: "essential_expenses" as BudgetCategoryType,
      },
      {
        name: "Gastos Discrecionales",
        value: summary.discretionaryExpenses,
        fill: CATEGORY_TYPE_COLORS.discretionary_expenses,
        type: "discretionary_expenses" as BudgetCategoryType,
      },
      {
        name: "Pago de Deudas",
        value: summary.debtPayments,
        fill: CATEGORY_TYPE_COLORS.debt_payments,
        type: "debt_payments" as BudgetCategoryType,
      },
      {
        name: "Ahorros",
        value: summary.savings,
        fill: CATEGORY_TYPE_COLORS.savings,
        type: "savings" as BudgetCategoryType,
      },
      {
        name: "Inversiones",
        value: summary.investments,
        fill: CATEGORY_TYPE_COLORS.investments,
        type: "investments" as BudgetCategoryType,
      },
      {
        name: "Sin categoría",
        value: summary.uncategorizedExpenses,
        fill: UNCATEGORIZED_COLOR,
        type: null,
      },
    ];
    return raw.filter((d) => d.value > 0);
  }, [summary]);

  const detailData = useMemo(() => {
    if (!drillType) return [];
    return (summary?.categoryBreakdown ?? [])
      .filter((c) => c.categoryType === drillType && c.amount > 0)
      .map((c, i) => ({
        name: c.categoryName,
        value: c.amount,
        fill: seriesColor(i),
        categoryId: c.categoryId,
      }));
  }, [drillType, summary?.categoryBreakdown]);

  const isDetail = drillType !== null && detailData.length > 0;
  const chartData = isDetail ? detailData : typeData;
  const drillLabel = drillType ? BUDGET_CATEGORY_LABELS[drillType] : "";

  return (
    <ChartCard
      title={
        !isDetail ? (
          "Distribución de gastos"
        ) : (
          <span className="flex items-center gap-1">
            <PageButton
              variant="ghost"
              icon={ArrowLeft}
              aria-label="Volver"
              className="-my-1.5 -ml-1.5"
              onClick={() => setDrillType(null)}
            />
            {drillLabel}
          </span>
        )
      }
      description={isDetail ? "Por categoría." : "Clic en un sector para ver el detalle."}
      loading={!summary}
      empty={chartData.length === 0}
      emptyTitle="Sin gastos"
      name="expense-breakdown"
      resetKeys={[chartData]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
            stroke="var(--card)"
            isAnimationActive={false}
            style={{ cursor: isDetail && !monthId ? "default" : "pointer" }}
            onClick={(_data, index) => {
              if (isDetail) {
                const categoryId = detailData[index]?.categoryId;
                if (monthId && categoryId) router.push(`/transactions?month=${monthId}&category=${categoryId}`);
                return;
              }
              const type = typeData[index]?.type;
              if (type) setDrillType(type);
            }}
          >
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            isAnimationActive={false}
            content={<ChartTooltip currency={currencySymbol} hideLabel />}
          />
          <Legend
            verticalAlign="bottom"
            iconSize={8}
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value) => <span className="text-muted-foreground">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
