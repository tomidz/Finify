"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEnsureCurrentMonth } from "@/hooks/useMonths";
import { useNetWorthData } from "@/hooks/useScreens";
import { useInvestmentValuation } from "@/hooks/useInvestments";
import { MONTH_NAMES, formatAmount, amountTone, formatDayMonth } from "@/lib/format";
import { today } from "@/lib/dates";
import { buildNetWorthView } from "@/lib/finance/net-worth-view";
import type { NetWorthData } from "@/actions/screens";
import { NetWorthEvolutionChart } from "./_components/NetWorthEvolutionChart";

export default function NetWorthPage() {
  // null = latest year with months; the server resolves it.
  const [requestedYear, setRequestedYear] = useState<number | null>(null);

  const { data, isPending, isPlaceholderData, error } = useNetWorthData(requestedYear);
  const ensureCurrentMonth = useEnsureCurrentMonth();
  const months = data?.months;

  useEffect(() => {
    if (!months || months.length > 0 || ensureCurrentMonth.isPending) return;
    ensureCurrentMonth.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  const baseCurrency = data?.baseCurrency ?? null;
  const currencySymbol = useMemo(() => {
    if (!baseCurrency) return "$";
    const found = data?.currencies.find((c) => c.code === baseCurrency);
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, data?.currencies]);

  // A failed background refetch keeps showing the last figures.
  if (!isPending && !data) {
    return (
      <div className="rounded-md border border-destructive/40 p-4 text-sm">
        <p className="font-medium">No se pudo cargar el patrimonio.</p>
        <p className="text-muted-foreground text-xs">{error?.message}</p>
      </div>
    );
  }

  if (isPending || data.year === null || !data.accounts || !data.liabilities || !data.evolution) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { years, year, accounts } = data;
  // While another year loads, the selector already shows the requested one.
  const shownYear = (isPlaceholderData ? requestedYear : null) ?? year;
  const yearIndex = years.indexOf(shownYear);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Patrimonio neto</h1>
        <p className="text-muted-foreground text-sm">
          Resumen de activos, pasivos y evolución de tu patrimonio.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setRequestedYear(years[yearIndex + 1])}
            disabled={yearIndex >= years.length - 1}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[80px] text-center text-sm font-medium">
            {shownYear}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setRequestedYear(years[yearIndex - 1])}
            disabled={yearIndex <= 0}
          >
            <ChevronRight className="size-4" />
          </Button>
          {accounts.month > 0 && (
            <span className="text-muted-foreground text-sm">
              al cierre de {MONTH_NAMES[accounts.month - 1]}
            </span>
          )}
        </div>
      </div>

      <div className={isPlaceholderData ? "space-y-6 opacity-60" : "space-y-6"}>
        <NetWorthContent
          data={data as NetWorthScreen}
          currencySymbol={currencySymbol}
          baseCurrency={baseCurrency ?? "USD"}
        />
      </div>
    </div>
  );
}

type NetWorthScreen = NetWorthData & {
  year: number;
  accounts: NonNullable<NetWorthData["accounts"]>;
  liabilities: NonNullable<NetWorthData["liabilities"]>;
  evolution: NonNullable<NetWorthData["evolution"]>;
};

function NetWorthContent({
  data,
  currencySymbol,
  baseCurrency,
}: {
  data: NetWorthScreen;
  currencySymbol: string;
  baseCurrency: string;
}) {
  const { accounts: assetsSummary, liabilities, evolution } = data;
  const todayStr = today();
  // Market values only exist for today: a past close keeps investments at
  // cost, and until they arrive the current month does too.
  const closesToday = assetsSummary.close_date === todayStr;
  const { data: valuation } = useInvestmentValuation({ enabled: closesToday });

  const view = useMemo(
    () =>
      buildNetWorthView({
        accounts: assetsSummary,
        liabilities,
        evolution,
        valuation,
        today: todayStr,
      }),
    [assetsSummary, liabilities, evolution, valuation, todayStr],
  );
  const { totalAssets, totalLiabilities, netWorth, groups } = view;

  const fxNote = [
    view.fxMissing ? "montos sin cotización fuera de los totales" : null,
    view.cashAtBookValue ? "saldos sin cotización a su valor de carga" : null,
    view.fxRateDate ? `TC del ${formatDayMonth(view.fxRateDate)}` : null,
    Math.round(view.fxRevaluation * 100) !== 0
      ? `incluye diferencia de cambio de ${currencySymbol} ${formatAmount(view.fxRevaluation)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const atCost = !view.marketValued && view.accounts.some((account) => account.investment_value !== 0);
  const pendingHint = !atCost ? null : (
    <span className="text-muted-foreground ml-2 text-xs font-normal">inversiones a costo</span>
  );

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="gap-0 py-0"><CardHeader className="px-4 pt-4 pb-2"><CardDescription>Total Activos{pendingHint}</CardDescription></CardHeader><CardContent className="px-4 pb-4"><p className="text-2xl font-bold text-green-600">{currencySymbol} {formatAmount(totalAssets)}</p></CardContent></Card>
        <Card className="gap-0 py-0"><CardHeader className="px-4 pt-4 pb-2"><CardDescription>Total Pasivos</CardDescription></CardHeader><CardContent className="px-4 pb-4"><p className="text-2xl font-bold text-red-600">{currencySymbol} {formatAmount(totalLiabilities)}</p></CardContent></Card>
        <Card className="gap-0 py-0"><CardHeader className="px-4 pt-4 pb-2"><CardDescription>Patrimonio Neto{pendingHint}</CardDescription></CardHeader><CardContent className="px-4 pb-4"><p className={`text-2xl font-bold ${amountTone(netWorth)}`}>{currencySymbol} {formatAmount(netWorth)}</p></CardContent></Card>
      </div>
      {fxNote && <p className="text-muted-foreground -mt-4 text-xs">{fxNote}</p>}

      <NetWorthEvolutionChart data={view.evolution} currencySymbol={currencySymbol} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Activos</h2>
          {groups.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center"><p className="text-muted-foreground text-sm">No hay cuentas.</p></div>
          ) : (
            groups.map((group) => (
              <div key={group.type} className="overflow-hidden rounded-md border">
                <div className="border-b bg-muted/30 px-4 py-2"><span className="text-sm font-semibold">{group.label}</span><span className="text-muted-foreground ml-2 text-xs">{currencySymbol} {formatAmount(group.total)}</span></div>
                {group.accounts.map((acc) => {
                  const inBase = (value: number | null) =>
                    value !== null ? `${currencySymbol} ${formatAmount(value)}` : "sin cotización";
                  const hasCash = Math.abs(acc.balance_base) > 0.01;
                  const hasInvestments = acc.investment_value_base === null || acc.investment_value_base > 0;
                  const showInvestmentBreakdown = hasCash && hasInvestments;
                  const withoutRate = acc.balance_fx_missing || acc.investment_value_base === null;
                  return (
                    <div key={acc.id} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0">
                      <div>
                        <span className="text-sm font-medium">{acc.name}</span>
                        {!acc.is_active && <span className="text-muted-foreground ml-1 text-xs">(inactiva)</span>}
                        {showInvestmentBreakdown && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            (cash: {inBase(acc.balance_base)} · inv: {inBase(acc.investment_value_base)})
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium">{currencySymbol} {formatAmount(acc.total)}</span>
                        {withoutRate && !showInvestmentBreakdown && <span className="text-muted-foreground ml-2 text-xs">sin cotización</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pasivos</h2>
            <Button variant="outline" size="sm" asChild>
              <Link href="/debts"><ExternalLink className="mr-1 size-3" />Gestionar deudas</Link>
            </Button>
          </div>
          {liabilities.items.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center"><p className="text-muted-foreground text-sm">No hay pasivos registrados.</p></div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <div className="border-b bg-muted/30 px-4 py-2"><span className="text-sm font-semibold">Deudas</span><span className="text-muted-foreground ml-2 text-xs">{currencySymbol} {formatAmount(liabilities.total)}</span></div>
              {liabilities.items.map((item) => (
                <div key={item.item_id} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0">
                  <span className="text-sm font-medium">{item.name}</span>
                  <div className="text-right">
                    <span className="text-sm font-medium">{item.currency_symbol} {formatAmount(item.amount)}</span>
                    {item.amount_base !== null && item.currency !== baseCurrency && <span className="text-muted-foreground ml-2 text-xs">≈ {currencySymbol} {formatAmount(item.amount_base)}</span>}
                    {item.amount_base === null && item.amount !== 0 && <span className="text-muted-foreground ml-2 text-xs">sin cotización</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
