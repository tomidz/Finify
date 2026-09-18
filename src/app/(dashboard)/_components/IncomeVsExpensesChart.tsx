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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatAmount, CATEGORY_COLORS } from "@/lib/format";
import type { PeriodSummary } from "@/lib/finance/period-summary";

interface IncomeVsExpensesChartProps {
  summary: PeriodSummary;
  currencySymbol: string;
}

export function IncomeVsExpensesChart({
  summary,
  currencySymbol,
}: IncomeVsExpensesChartProps) {
  const data = useMemo(() => [
    {
      name: "Ingresos",
      value: summary.income,
      fill: CATEGORY_COLORS.income,
    },
    {
      name: "G. Esenciales",
      value: summary.essentialExpenses,
      fill: CATEGORY_COLORS.essential_expenses,
    },
    {
      name: "G. Discrecionales",
      value: summary.discretionaryExpenses,
      fill: CATEGORY_COLORS.discretionary_expenses,
    },
    {
      name: "Deudas",
      value: summary.debtPayments,
      fill: CATEGORY_COLORS.debt_payments,
    },
    {
      name: "Ahorros",
      value: summary.savings,
      fill: CATEGORY_COLORS.savings,
    },
    {
      name: "Inversiones",
      value: summary.investments,
      fill: CATEGORY_COLORS.investments,
    },
    ...(summary.uncategorizedExpenses !== 0
      ? [{ name: "Sin categoría", value: summary.uncategorizedExpenses, fill: "#94a3b8" }]
      : []),
  ], [summary]);

  const allZero = data.every((d) => d.value === 0);

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-2">
        <CardTitle className="text-sm font-semibold">
          Ingresos vs Gastos
        </CardTitle>
        <CardDescription className="text-xs">
          Desglose del mes por tipo de categoría.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {allZero ? (
          <div className="flex h-[250px] items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Sin movimientos en este mes.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => formatAmount(v)}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                formatter={(v) => [
                  `${currencySymbol} ${formatAmount(Number(v ?? 0))}`,
                  "Monto",
                ]}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
