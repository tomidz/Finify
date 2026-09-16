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
import { MONTH_NAMES, formatAmount, amountTone } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/types/accounts";
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
  // Market values arrive after the ledger figures: until then accounts show
  // their investments at cost, and the chart has no unrealized gains.
  const { data: valuation, isPending: valuing } = useInvestmentValuation(data.year);

  const accountsWithCurrentValues = useMemo(
    () =>
      assetsSummary.accounts.map((account) => ({
        ...account,
        investment_value_base:
          valuation?.byAccount[account.id]?.current ??
          account.investment_value_base,
      })),
    [assetsSummary.accounts, valuation],
  );

  const evolutionWithCurrentValues = useMemo(
    () =>
      evolution.map((point) => {
        const monthValues = valuation?.byMonth?.[point.month];
        if (!monthValues) return point;

        const delta = monthValues.currentValue - monthValues.costBasis;

        return {
          ...point,
          assets: point.assets + delta,
          netWorth: point.netWorth + delta,
        };
      }),
    [valuation, evolution],
  );

  const totalAssets = accountsWithCurrentValues.reduce(
    (sum, account) => sum + account.balance_base + account.investment_value_base,
    0,
  );
  const totalLiabilities = liabilities.total ?? 0;
  const netWorth = totalAssets - totalLiabilities;

  const groupedAccounts = useMemo(() => {
    const map = new Map<
      string,
      { type: AccountType; label: string; accounts: typeof accountsWithCurrentValues; total: number }
    >();
    for (const acc of accountsWithCurrentValues) {
      const type = acc.account_type as AccountType;
      if (!map.has(type)) {
        map.set(type, {
          type,
          label: ACCOUNT_TYPE_LABELS[type] ?? type,
          accounts: [],
          total: 0,
        });
      }
      const group = map.get(type)!;
      group.accounts.push(acc);
      group.total += acc.balance_base + acc.investment_value_base;
    }
    return Array.from(map.values());
  }, [accountsWithCurrentValues]);

  const pendingHint = !valuing ? null : (
    <span className="text-muted-foreground ml-2 text-xs font-normal">inversiones a costo</span>
  );

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="gap-0 py-0"><CardHeader className="px-4 pt-4 pb-2"><CardDescription>Total Activos{pendingHint}</CardDescription></CardHeader><CardContent className="px-4 pb-4"><p className="text-2xl font-bold text-green-600">{currencySymbol} {formatAmount(totalAssets)}</p></CardContent></Card>
        <Card className="gap-0 py-0"><CardHeader className="px-4 pt-4 pb-2"><CardDescription>Total Pasivos</CardDescription></CardHeader><CardContent className="px-4 pb-4"><p className="text-2xl font-bold text-red-600">{currencySymbol} {formatAmount(totalLiabilities)}</p></CardContent></Card>
        <Card className="gap-0 py-0"><CardHeader className="px-4 pt-4 pb-2"><CardDescription>Patrimonio Neto{pendingHint}</CardDescription></CardHeader><CardContent className="px-4 pb-4"><p className={`text-2xl font-bold ${amountTone(netWorth)}`}>{currencySymbol} {formatAmount(netWorth)}</p></CardContent></Card>
      </div>

      <NetWorthEvolutionChart data={evolutionWithCurrentValues} currencySymbol={currencySymbol} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Activos</h2>
          {groupedAccounts.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center"><p className="text-muted-foreground text-sm">No hay cuentas activas.</p></div>
          ) : (
            groupedAccounts.map((group) => (
              <div key={group.type} className="overflow-hidden rounded-md border">
                <div className="border-b bg-muted/30 px-4 py-2"><span className="text-sm font-semibold">{group.label}</span><span className="text-muted-foreground ml-2 text-xs">{currencySymbol} {formatAmount(group.total)}</span></div>
                {group.accounts.map((acc) => {
                  const totalValueBase = acc.balance_base + acc.investment_value_base;
                  const cashValueBase = acc.balance_base;
                  const showInvestmentBreakdown =
                    acc.investment_value_base > 0 &&
                    Math.abs(cashValueBase) > 0.01;
                  return (
                    <div key={acc.id} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0">
                      <div>
                        <span className="text-sm font-medium">{acc.name}</span>
                        {showInvestmentBreakdown && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            (cash: {currencySymbol} {formatAmount(cashValueBase)} · inv: {currencySymbol} {formatAmount(acc.investment_value_base)})
                          </span>
                        )}
                      </div>
                      <div className="text-right"><span className="text-sm font-medium">{currencySymbol} {formatAmount(totalValueBase)}</span></div>
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
