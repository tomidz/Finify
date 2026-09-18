"use client";

import React from "react";
import { StatCard, StatGrid } from "@/components/stat-card";
import { formatAmount, formatDayMonth } from "@/lib/format";
import { today } from "@/lib/dates";

export const HoldingsSummary = React.memo(function HoldingsSummary({
  currencySymbol,
  cashUninvested,
  invested,
  current,
  gain,
  gainPct,
  unpricedCount,
  fxRateDate,
  pricesFailed,
  cashLoading,
  cashFailed = false,
  totalsLoading,
  valueLoading,
}: {
  currencySymbol: string;
  cashUninvested: number | null;
  invested: number | null;
  current: number | null;
  gain: number | null;
  gainPct: number | null;
  unpricedCount: number;
  fxRateDate: string | null;
  /** No prices at all: the market value is unknown, not the cost. */
  pricesFailed: boolean;
  cashLoading: boolean;
  /** The accounts' balances could not be read. */
  cashFailed?: boolean;
  totalsLoading: boolean;
  valueLoading: boolean;
}) {
  const valueNotes = [
    pricesFailed ? "No se pudieron cargar los precios" : null,
    !pricesFailed && unpricedCount > 0 ? `${unpricedCount} sin precio (al costo)` : null,
    fxRateDate && fxRateDate < today() ? `TC del ${formatDayMonth(fxRateDate)}` : null,
  ].filter((note): note is string => note !== null);

  return (
    <StatGrid columns={4}>
      <StatCard
        label="Efectivo sin invertir"
        value={cashUninvested}
        currency={currencySymbol}
        loading={cashLoading}
        sub={cashFailed ? "No se pudieron leer las cuentas" : undefined}
      />
      <StatCard label="Invertido" value={invested} currency={currencySymbol} loading={totalsLoading} />
      <StatCard
        label="Valor actual"
        value={pricesFailed ? null : current}
        currency={currencySymbol}
        loading={valueLoading}
        sub={
          valueNotes.length === 0 ? undefined : valueNotes.map((note) => <span key={note}>{note}</span>)
        }
      />
      <StatCard
        label="Ganancia / pérdida"
        value={pricesFailed ? null : gain}
        currency={currencySymbol}
        signTone
        suffix={gainPct === null ? undefined : `(${formatAmount(gainPct)}%)`}
        loading={valueLoading}
      />
    </StatGrid>
  );
});
