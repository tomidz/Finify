"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { formatAmount, amountTone } from "@/lib/format";
import type { MonthSummary } from "@/hooks/useMonthSummary";

interface SummaryCardsProps {
  summary: MonthSummary;
  currencySymbol: string;
}

export function SummaryCards({ summary, currencySymbol }: SummaryCardsProps) {
  const cards = [
    {
      label: "Saldo apertura",
      value: summary.openingBase,
      color: amountTone(summary.openingBase),
    },
    { label: "Ingresos", value: summary.income, color: "text-green-600" },
    {
      label: "Total gastos",
      value: summary.totalExpenses,
      color: "text-red-600",
    },
    {
      label: "Resultado del mes",
      value: summary.netMonth,
      color: amountTone(summary.netMonth),
    },
    {
      label: "Saldo cierre",
      value: summary.closingBase,
      color: amountTone(summary.closingBase),
    },
  ];

  return (
    <div className="flex flex-col gap-1">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label} className="gap-0 py-0">
            <CardHeader className="px-4 pt-4 pb-2">
              <CardDescription>{card.label}</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className={`text-2xl font-semibold ${card.color}`}>
                {currencySymbol} {formatAmount(Math.abs(card.value))}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      {summary.olderRates > 0 && (
        <p className="text-muted-foreground text-xs">
          {summary.olderRates === 1
            ? "1 movimiento valuado con un TC anterior a su fecha."
            : `${summary.olderRates} movimientos valuados con un TC anterior a su fecha.`}
        </p>
      )}
    </div>
  );
}
