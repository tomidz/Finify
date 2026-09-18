"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAmount, amountTone, formatDayMonth } from "@/lib/format";
import type { PeriodSummary } from "@/lib/finance/period-summary";

interface SummaryCardsProps {
  summary: PeriodSummary;
  currencySymbol: string;
  /** Expenses by category type instead of their total and the result. */
  detailed?: boolean;
}

export function SummaryCards({ summary, currencySymbol, detailed = false }: SummaryCardsProps) {
  const otherLines = (
    [
      ["Inversiones", summary.other.investments],
      ["Correcciones", summary.other.corrections],
      ["Comisiones", summary.other.transferFees],
      ["Cambio en transferencias", summary.other.transferFx],
      ["Diferencia de cambio", summary.other.revaluation],
    ] as const
  ).filter(([, value]) => Math.abs(value) >= 0.005);

  const cards = [
    {
      label: "Saldo apertura",
      value: summary.openingBase,
      color: amountTone(summary.openingBase),
    },
    { label: "Ingresos", value: summary.income, color: "text-green-600" },
    ...(!detailed
      ? [
          { label: "Total gastos", value: summary.totalExpenses, color: "text-red-600" },
          { label: "Resultado del mes", value: summary.netMonth, color: amountTone(summary.netMonth) },
        ]
      : [
          { label: "Gastos Esenciales", value: summary.essentialExpenses, color: "text-red-600" },
          { label: "Gastos Discrecionales", value: summary.discretionaryExpenses, color: "text-orange-600" },
          { label: "Pago de Deudas", value: summary.debtPayments, color: "text-rose-600" },
          { label: "Ahorros", value: summary.savings, color: "text-cyan-600" },
          { label: "Inversiones", value: summary.investments, color: "text-indigo-600" },
          ...(summary.uncategorizedExpenses !== 0
            ? [{ label: "Sin categoría", value: summary.uncategorizedExpenses, color: "text-red-600" }]
            : []),
        ]),
    {
      label: "Otros movimientos",
      value: summary.other.total,
      color: amountTone(summary.other.total),
      detail: otherLines,
    },
    {
      label: "Saldo cierre",
      value: summary.closingBase,
      color: amountTone(summary.closingBase),
    },
  ];

  const notes = [
    summary.olderRates === 1
      ? "1 movimiento valuado con un TC anterior a su fecha."
      : summary.olderRates > 1
        ? `${summary.olderRates} movimientos valuados con un TC anterior a su fecha.`
        : null,
    summary.closingRateDate ? `Saldos al TC del ${formatDayMonth(summary.closingRateDate)}.` : null,
    summary.fxMissing > 0 ? "Hay saldos sin cotización: van sin diferencia de cambio." : null,
    !summary.ties
      ? `${currencySymbol} ${formatAmount(summary.unexplained)} de movimientos no entran en ninguna línea.`
      : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`grid gap-3 grid-cols-2 lg:grid-cols-3 ${detailed ? "xl:grid-cols-5" : "xl:grid-cols-6"}`}
      >
        {cards.map((card) => (
          <Card key={card.label} className="gap-0 py-0">
            <CardHeader className="px-4 pt-4 pb-2">
              {!card.detail?.length ? (
                <CardDescription>{card.label}</CardDescription>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CardDescription className="w-fit cursor-default underline decoration-dotted underline-offset-2">
                      {card.label}
                    </CardDescription>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="flex flex-col gap-0.5 text-xs">
                      {card.detail.map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4">
                          <span>{label}</span>
                          <span>
                            {currencySymbol} {formatAmount(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className={`text-2xl font-semibold ${card.color}`}>
                {currencySymbol} {formatAmount(card.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      {notes.map((note) => (
        <p key={note} className="text-muted-foreground text-xs">
          {note}
        </p>
      ))}
    </div>
  );
}
