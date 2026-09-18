"use client";

import { StatCard, StatGrid } from "@/components/stat-card";
import { formatAmount, formatDayMonth } from "@/lib/format";
import type { PeriodSummary } from "@/lib/finance/period-summary";

interface SummaryCardsProps {
  /** Null while it loads: the cards show "—", never 0. */
  summary: PeriodSummary | null;
  currencySymbol: string;
  /** Expenses by category type instead of their total and the result. */
  detailed?: boolean;
  /** Skeletons in place of the amounts. */
  loading?: boolean;
}

interface SummaryCard {
  label: string;
  value: number | undefined;
  signTone?: boolean;
  hint?: React.ReactNode;
}

export function SummaryCards({ summary, currencySymbol, detailed = false, loading = false }: SummaryCardsProps) {
  const otherLines = !summary
    ? []
    : (
        [
          ["Inversiones", summary.other.investments],
          ["Correcciones", summary.other.corrections],
          ["Comisiones", summary.other.transferFees],
          ["Cambio en transferencias", summary.other.transferFx],
          ["Diferencia de cambio", summary.other.revaluation],
        ] as const
      ).filter(([, value]) => Math.abs(value) >= 0.005);

  const cards: SummaryCard[] = [
    { label: "Saldo apertura", value: summary?.openingBase, signTone: true },
    { label: "Ingresos", value: summary?.income },
    ...(!detailed
      ? [
          { label: "Total gastos", value: summary?.totalExpenses },
          { label: "Resultado", value: summary?.netMonth, signTone: true },
        ]
      : [
          { label: "Gastos Esenciales", value: summary?.essentialExpenses },
          { label: "Gastos Discrecionales", value: summary?.discretionaryExpenses },
          { label: "Pago de Deudas", value: summary?.debtPayments },
          { label: "Ahorros", value: summary?.savings },
          { label: "Inversiones", value: summary?.investments },
          ...(summary && summary.uncategorizedExpenses !== 0
            ? [{ label: "Sin categoría", value: summary.uncategorizedExpenses }]
            : []),
        ]),
    {
      label: "Otros movimientos",
      value: summary?.other.total,
      signTone: true,
      hint:
        otherLines.length === 0 ? undefined : (
          <div className="flex flex-col gap-0.5 text-xs">
            {otherLines.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <span>{label}</span>
                <span className="tabular-nums">
                  {currencySymbol} {formatAmount(value)}
                </span>
              </div>
            ))}
          </div>
        ),
    },
    { label: "Saldo cierre", value: summary?.closingBase, signTone: true },
  ];

  const notes = !summary
    ? []
    : [
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
      ].filter((note): note is string => note !== null);

  return (
    <div className="flex flex-col gap-1.5">
      <StatGrid columns={detailed ? 5 : 6}>
        {cards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            currency={currencySymbol}
            signTone={card.signTone}
            hint={card.hint}
            loading={loading}
          />
        ))}
      </StatGrid>
      {notes.map((note) => (
        <p key={note} className="text-muted-foreground text-[11px]">
          {note}
        </p>
      ))}
    </div>
  );
}
