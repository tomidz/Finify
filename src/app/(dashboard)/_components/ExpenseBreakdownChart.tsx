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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatAmount, CATEGORY_COLORS } from "@/lib/format";
import type { PeriodSummary } from "@/lib/finance/period-summary";
import { BUDGET_CATEGORY_LABELS, type BudgetCategoryType } from "@/types/budget";

// Palette for individual categories inside a type
const DETAIL_PALETTE = [
  "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a",
  "#0891b2", "#4f46e5", "#c026d3", "#d97706", "#059669",
  "#6366f1", "#e11d48", "#0d9488", "#9333ea", "#ca8a04",
];

interface ExpenseBreakdownChartProps {
  summary: PeriodSummary;
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
    const raw = [
      {
        name: "Gastos Esenciales",
        value: summary.essentialExpenses,
        fill: CATEGORY_COLORS.essential_expenses,
        type: "essential_expenses" as BudgetCategoryType,
      },
      {
        name: "Gastos Discrecionales",
        value: summary.discretionaryExpenses,
        fill: CATEGORY_COLORS.discretionary_expenses,
        type: "discretionary_expenses" as BudgetCategoryType,
      },
      {
        name: "Pago de Deudas",
        value: summary.debtPayments,
        fill: CATEGORY_COLORS.debt_payments,
        type: "debt_payments" as BudgetCategoryType,
      },
      {
        name: "Ahorros",
        value: summary.savings,
        fill: CATEGORY_COLORS.savings,
        type: "savings" as BudgetCategoryType,
      },
      {
        name: "Inversiones",
        value: summary.investments,
        fill: CATEGORY_COLORS.investments,
        type: "investments" as BudgetCategoryType,
      },
      {
        name: "Sin categoría",
        value: summary.uncategorizedExpenses,
        fill: "#94a3b8",
        type: null,
      },
    ];
    return raw.filter((d) => d.value > 0);
  }, [summary]);

  const detailData = useMemo(() => {
    if (!drillType) return [];
    return (summary.categoryBreakdown ?? [])
      .filter((c) => c.categoryType === drillType && c.amount > 0)
      .map((c, i) => ({
        name: c.categoryName,
        value: c.amount,
        fill: DETAIL_PALETTE[i % DETAIL_PALETTE.length],
        categoryId: c.categoryId,
      }));
  }, [drillType, summary.categoryBreakdown]);

  const isDetail = drillType !== null && detailData.length > 0;
  const chartData = isDetail ? detailData : typeData;
  const drillLabel = drillType ? BUDGET_CATEGORY_LABELS[drillType] : "";

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          {isDetail && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setDrillType(null)}
            >
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <div>
            <CardTitle className="text-sm font-semibold">
              {isDetail ? drillLabel : "Distribución de Gastos"}
            </CardTitle>
            <CardDescription className="text-xs">
              {isDetail
                ? "Desglose por categoría. Hacé click en ← para volver."
                : "Hacé click en un sector para ver el detalle."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {chartData.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center">
            <p className="text-muted-foreground text-sm">
              {isDetail
                ? "Sin transacciones en esta categoría."
                : "Sin gastos registrados este mes."}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
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
                formatter={(v) => [
                  `${currencySymbol} ${formatAmount(Number(v ?? 0))}`,
                  "Monto",
                ]}
              />
              <Legend
                verticalAlign="bottom"
                iconSize={10}
                wrapperStyle={{ fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
