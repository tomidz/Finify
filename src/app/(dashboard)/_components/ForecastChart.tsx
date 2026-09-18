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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatAmount } from "@/lib/format";
import type { ForecastPoint } from "@/types/forecast";

interface ForecastChartProps {
  forecast: ForecastPoint[] | null;
  currencySymbol: string;
}

export function ForecastChart({ forecast, currencySymbol }: ForecastChartProps) {
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

  if (!chartData.length) return null;

  // Find the index where projections start (after actual data)
  const actualCount = chartData.filter((d) => d.isActual).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Proyección de saldo</CardTitle>
        <CardDescription>
          Desde hoy: lo cargado, recurrentes, presupuesto e historial.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(v: number) =>
                `${currencySymbol}${formatAmount(v)}`
              }
              width={90}
            />
            <Tooltip
              formatter={(value, _name, item) => {
                const numeric = typeof value === "number" ? value : 0;
                const sources: string[] = item?.payload?.sources ?? [];
                return [
                  `${currencySymbol} ${formatAmount(numeric)}`,
                  sources.length > 0 ? `Saldo (${sources.join(", ")})` : "Saldo",
                ];
              }}
            />
            {actualCount > 0 && actualCount < chartData.length && (
              <ReferenceLine
                x={chartData[actualCount - 1]?.label}
                stroke="#94a3b8"
                strokeDasharray="4 4"
              />
            )}
            <Area
              type="monotone"
              dataKey="balance"
              stroke="#60a5fa"
              fill="url(#forecastGrad)"
              strokeWidth={2}
              dot={(props) => {
                const { cx, cy, index } = props;
                const isActual = chartData[index]?.isActual;
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={isActual ? 5 : 4}
                    fill={isActual ? "#60a5fa" : "#93c5fd"}
                    stroke={isActual ? "#3b82f6" : "#60a5fa"}
                    strokeWidth={2}
                  />
                );
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
