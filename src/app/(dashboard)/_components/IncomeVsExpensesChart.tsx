"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { chartAxisProps, formatCompactAmount } from "@/components/charts/axis";
import { ChartCard } from "@/components/charts/chart-card";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { CATEGORY_TYPE_COLORS, UNCATEGORIZED_COLOR } from "@/components/charts/palette";
import type { PeriodSummary } from "@/lib/finance/period-summary";

interface IncomeVsExpensesChartProps {
  /** Null while it loads. */
  summary: PeriodSummary | null;
  currencySymbol: string;
}

export function IncomeVsExpensesChart({
  summary,
  currencySymbol,
}: IncomeVsExpensesChartProps) {
  const data = useMemo(() => !summary ? [] : [
    {
      name: "Ingresos",
      value: summary.income,
      fill: CATEGORY_TYPE_COLORS.income,
    },
    {
      name: "G. Esenciales",
      value: summary.essentialExpenses,
      fill: CATEGORY_TYPE_COLORS.essential_expenses,
    },
    {
      name: "G. Discrecionales",
      value: summary.discretionaryExpenses,
      fill: CATEGORY_TYPE_COLORS.discretionary_expenses,
    },
    {
      name: "Deudas",
      value: summary.debtPayments,
      fill: CATEGORY_TYPE_COLORS.debt_payments,
    },
    {
      name: "Ahorros",
      value: summary.savings,
      fill: CATEGORY_TYPE_COLORS.savings,
    },
    {
      name: "Inversiones",
      value: summary.investments,
      fill: CATEGORY_TYPE_COLORS.investments,
    },
    ...(summary.uncategorizedExpenses !== 0
      ? [{ name: "Sin categoría", value: summary.uncategorizedExpenses, fill: UNCATEGORIZED_COLOR }]
      : []),
  ], [summary]);

  const allZero = data.every((d) => d.value === 0);

  return (
    <ChartCard
      title="Ingresos vs gastos"
      description="Por tipo de categoría."
      loading={!summary}
      empty={allZero}
      emptyTitle="Sin movimientos"
      name="income-vs-expenses"
      resetKeys={[data]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="name" {...chartAxisProps} />
          <YAxis tickFormatter={formatCompactAmount} width={48} {...chartAxisProps} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: "var(--muted)" }}
            content={<ChartTooltip currency={currencySymbol} />}
          />
          <Bar dataKey="value" name="Monto" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
