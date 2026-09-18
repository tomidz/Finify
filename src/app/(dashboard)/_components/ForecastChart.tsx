"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { chartAxisProps, formatCompactAmount } from "@/components/charts/axis";
import { ChartCard } from "@/components/charts/chart-card";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { CHART_GRID, CHART_NEUTRAL } from "@/components/charts/palette";
import { ActionError } from "@/lib/action-result";
import type { ForecastPoint } from "@/types/forecast";

const SERIES = "var(--chart-1)";

// The screen leaves the forecast out (null) when its read fails.
const FORECAST_UNAVAILABLE = new ActionError("La proyección no está disponible por ahora.");

interface ForecastChartProps {
  /** Null when it could not be read. */
  forecast: ForecastPoint[] | null;
  currencySymbol: string;
  onRetry?: () => void;
  loading?: boolean;
}

export function ForecastChart({ forecast, currencySymbol, onRetry, loading = false }: ForecastChartProps) {
  const chartData = useMemo(
    () =>
      (forecast ?? []).map((point) => ({
        label: point.label,
        balance: point.projected_balance,
        isActual: point.is_actual,
        sources: point.sources,
      })),
    [forecast]
  );

  // Find the index where projections start (after actual data)
  const actualCount = chartData.filter((d) => d.isActual).length;

  return (
    <ChartCard
      title="Proyección de saldo"
      description="Desde hoy: lo cargado, recurrentes, presupuesto e historial."
      height={280}
      loading={loading}
      error={forecast === null ? FORECAST_UNAVAILABLE : undefined}
      onRetry={onRetry}
      empty={chartData.length === 0}
      name="forecast"
      resetKeys={[chartData]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={SERIES} stopOpacity={0.3} />
              <stop offset="95%" stopColor={SERIES} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_GRID} />
          <XAxis dataKey="label" {...chartAxisProps} />
          <YAxis tickFormatter={formatCompactAmount} width={48} {...chartAxisProps} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: CHART_NEUTRAL, strokeDasharray: "4 4" }}
            content={
              <ChartTooltip
                currency={currencySymbol}
                nameFormatter={(entry) => {
                  const sources: string[] = entry.payload?.sources ?? [];
                  return sources.length > 0 ? `Saldo (${sources.join(", ")})` : "Saldo";
                }}
              />
            }
          />
          {actualCount > 0 && actualCount < chartData.length && (
            <ReferenceLine
              x={chartData[actualCount - 1]?.label}
              stroke={CHART_NEUTRAL}
              strokeDasharray="4 4"
            />
          )}
          <Area
            type="monotone"
            dataKey="balance"
            stroke={SERIES}
            fill="url(#forecastGrad)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props) => {
              const { cx, cy, index } = props;
              const isActual = chartData[index]?.isActual;
              // Actual months filled, projected ones hollow.
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={isActual ? 4 : 3.5}
                  fill={isActual ? SERIES : "var(--card)"}
                  stroke={SERIES}
                  strokeWidth={2}
                />
              );
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
