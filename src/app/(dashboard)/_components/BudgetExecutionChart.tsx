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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatAmount } from "@/lib/format";
import { BUDGET_STATUS_FILL, categoryExecution } from "@/lib/finance/budget-status";
import type { BudgetSummaryVsActual } from "@/types/budget";

interface BudgetExecutionChartProps {
  budgetSummary: BudgetSummaryVsActual | undefined;
  currencySymbol: string;
  /** A category of a single month opens its transactions. */
  monthId: string | null;
}

export function BudgetExecutionChart({
  budgetSummary,
  currencySymbol,
  monthId,
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
        fill: BUDGET_STATUS_FILL[categoryExecution(cat).status],
      }));
  }, [budgetSummary]);

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-2">
        <CardTitle className="text-sm font-semibold">
          Ejecución del Presupuesto
        </CardTitle>
        <CardDescription className="text-xs">
          Planificado vs real por categoría.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {data.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Sin presupuesto cargado para este mes.
            </p>
          </div>
        ) : (
          <ResponsiveContainer
            width="100%"
            height={Math.max(250, data.length * 45)}
          >
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
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                angle={-15}
                textAnchor="end"
                height={50}
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
                ]}
              />
              <Legend
                verticalAlign="top"
                iconSize={10}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Bar
                dataKey="Planificado"
                fill="#94a3b8"
                radius={[4, 4, 0, 0]}
              />
              <Bar dataKey="Real" fill="#60a5fa" radius={[4, 4, 0, 0]}>
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
