"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { chartAxisProps, formatCompactAmount } from "@/components/charts/axis";
import { ChartCard } from "@/components/charts/chart-card";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { CHART_GRID, CHART_NEUTRAL, CHART_PRIMARY } from "@/components/charts/palette";
import { MONTH_SHORT_NAMES } from "@/lib/month-grid";
import type { NetWorthEvolutionPoint } from "@/types/net-worth";

interface NetWorthEvolutionChartProps {
  data: NetWorthEvolutionPoint[];
  currencySymbol: string;
  loading?: boolean;
}

export function NetWorthEvolutionChart({
  data,
  currencySymbol,
  loading = false,
}: NetWorthEvolutionChartProps) {
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        name: MONTH_SHORT_NAMES[point.month - 1] ?? String(point.month),
        Activos: point.assets,
        Pasivos: point.liabilities,
        Neto: point.netWorth,
      })),
    [data],
  );

  return (
    <ChartCard
      title="Evolución mensual"
      height={300}
      loading={loading}
      empty={data.length === 0}
      emptyTitle="Sin datos para este año"
      name="net-worth-evolution"
      resetKeys={[chartData]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid vertical={false} stroke={CHART_GRID} />
          <XAxis dataKey="name" {...chartAxisProps} />
          <YAxis tickFormatter={formatCompactAmount} width={48} {...chartAxisProps} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: "var(--muted)" }}
            content={<ChartTooltip currency={currencySymbol} />}
          />
          <Legend
            iconSize={8}
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value) => <span className="text-muted-foreground">{value}</span>}
          />
          <Bar dataKey="Activos" fill="var(--chart-2)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="Pasivos" fill={CHART_NEUTRAL} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="Neto" fill={CHART_PRIMARY} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
