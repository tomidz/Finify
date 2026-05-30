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
import { useMonths, useEnsureCurrentMonth } from "@/hooks/useMonths";
import {
  useAccountNetWorth,
  useLiabilitiesForYear,
  useNetWorthEvolution,
} from "@/hooks/useNetWorth";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { useCurrencies } from "@/hooks/useAccounts";
import {
  useCurrentInvestmentValuesByAccount,
  useCurrentInvestmentValuesByMonth,
} from "@/hooks/useInvestments";
import { MONTH_NAMES, formatAmount, amountTone } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/types/accounts";
import { NetWorthEvolutionChart } from "./_components/NetWorthEvolutionChart";

export default function NetWorthPage() {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const { data: months } = useMonths();
  const ensureCurrentMonth = useEnsureCurrentMonth();
  const sortedMonths = useMemo(() => months ?? [], [months]);

  useEffect(() => {
    if (!months || months.length > 0 || ensureCurrentMonth.isPending) return;
    ensureCurrentMonth.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  const availableYears = useMemo(() => {
    const years = new Set(sortedMonths.map((m) => m.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [sortedMonths]);

  useEffect(() => {
    if (!availableYears.length) return;
    if (!selectedYear || !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [selectedYear, availableYears]);

  const { data: baseCurrency } = useBaseCurrency();
  const { data: currencies } = useCurrencies();

  const currencySymbol = useMemo(() => {
    if (!baseCurrency) return "$";
    const found = currencies?.find((c) => c.code === baseCurrency);
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, currencies]);

  if (!selectedYear) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

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
            onClick={() => {
              const idx = availableYears.indexOf(selectedYear!);
              if (idx < availableYears.length - 1) setSelectedYear(availableYears[idx + 1]);
            }}
            disabled={!selectedYear || availableYears.indexOf(selectedYear) >= availableYears.length - 1}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[80px] text-center text-sm font-medium">
            {selectedYear}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              const idx = availableYears.indexOf(selectedYear!);
              if (idx > 0) setSelectedYear(availableYears[idx - 1]);
            }}
            disabled={!selectedYear || availableYears.indexOf(selectedYear) <= 0}
          >
            <ChevronRight className="size-4" />
          </Button>
          <NetWorthCaption year={selectedYear!} />
        </div>
      </div>

      <NetWorthContent
        year={selectedYear}
        currencySymbol={currencySymbol}
        baseCurrency={baseCurrency ?? "USD"}
      />
    </div>
  );
}

function NetWorthCaption({ year }: { year: number }) {
  const { data: assetsSummary } = useAccountNetWorth(year);
  if (!assetsSummary || assetsSummary.month <= 0) return null;

  return (
    <span className="text-muted-foreground text-sm">
      al cierre de {MONTH_NAMES[assetsSummary.month - 1]}
    </span>
  );
}

function NetWorthContent({
  year,
  currencySymbol,
  baseCurrency,
}: {
  year: number;
  currencySymbol: string;
  baseCurrency: string;
}) {
  const { data: assetsSummary, isLoading: loadingAssets } = useAccountNetWorth(year);
  const { data: liabilities, isLoading: loadingLiabilities } = useLiabilitiesForYear(year);
  const { data: evolution, isLoading: loadingEvolution } = useNetWorthEvolution(year);
  const {
    data: currentInvestmentValues,
    isLoading: loadingCurrentInvestmentValues,
  } = useCurrentInvestmentValuesByAccount();
  const {
    data: currentInvestmentValuesByMonth,
    isLoading: loadingCurrentInvestmentValuesByMonth,
  } = useCurrentInvestmentValuesByMonth(year);

  const safeAssetsSummary = assetsSummary ?? { total: 0, accounts: [], month: 0, year };
  const safeLiabilities = liabilities ?? { total: 0, items: [], year };
  const safeEvolution = useMemo(() => evolution ?? [], [evolution]);
  const safeCurrentInvestmentValues = useMemo(
    () => currentInvestmentValues ?? {},
    [currentInvestmentValues]
  );

  const accountsWithCurrentValues = useMemo(
    () =>
      safeAssetsSummary.accounts.map((account) => ({
        ...account,
        investment_value_base:
          safeCurrentInvestmentValues[account.id] ?? account.investment_value_base,
      })),
    [safeAssetsSummary.accounts, safeCurrentInvestmentValues],
  );

  const evolutionWithCurrentValues = useMemo(
    () =>
      safeEvolution.map((point) => {
        const monthValues = currentInvestmentValuesByMonth?.[point.month];
        if (!monthValues) return point;

        const delta = monthValues.currentValue - monthValues.costBasis;

        return {
          ...point,
          assets: point.assets + delta,
          netWorth: point.netWorth + delta,
        };
      }),
    [currentInvestmentValuesByMonth, safeEvolution],
  );

  const totalAssets = accountsWithCurrentValues.reduce(
    (sum, account) => sum + account.balance_base + account.investment_value_base,
    0,
  );
  const totalLiabilities = safeLiabilities.total ?? 0;
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

  if (loadingAssets || loadingLiabilities || loadingEvolution || loadingCurrentInvestmentValues || loadingCurrentInvestmentValuesByMonth || !assetsSummary || !liabilities || !evolution) {
    return <NetWorthContentFallback />;
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="gap-0 py-0"><CardHeader className="px-4 pt-4 pb-2"><CardDescription>Total Activos</CardDescription></CardHeader><CardContent className="px-4 pb-4"><p className="text-2xl font-bold text-green-600">{currencySymbol} {formatAmount(totalAssets)}</p></CardContent></Card>
        <Card className="gap-0 py-0"><CardHeader className="px-4 pt-4 pb-2"><CardDescription>Total Pasivos</CardDescription></CardHeader><CardContent className="px-4 pb-4"><p className="text-2xl font-bold text-red-600">{currencySymbol} {formatAmount(totalLiabilities)}</p></CardContent></Card>
        <Card className="gap-0 py-0"><CardHeader className="px-4 pt-4 pb-2"><CardDescription>Patrimonio Neto</CardDescription></CardHeader><CardContent className="px-4 pb-4"><p className={`text-2xl font-bold ${amountTone(netWorth)}`}>{currencySymbol} {formatAmount(netWorth)}</p></CardContent></Card>
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
          {safeLiabilities.items.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center"><p className="text-muted-foreground text-sm">No hay pasivos registrados.</p></div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <div className="border-b bg-muted/30 px-4 py-2"><span className="text-sm font-semibold">Deudas</span><span className="text-muted-foreground ml-2 text-xs">{currencySymbol} {formatAmount(safeLiabilities.total)}</span></div>
              {safeLiabilities.items.map((item) => (
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

function NetWorthContentFallback() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
