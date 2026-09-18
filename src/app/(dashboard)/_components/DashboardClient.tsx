"use client";

import { memo, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useEnsureCurrentMonth } from "@/hooks/useMonths";
import { useDashboardData } from "@/hooks/useScreens";
import { errorMessage } from "@/lib/action-result";
import { MONTH_NAMES } from "@/lib/format";
import type { ForecastPoint } from "@/types/forecast";
import type { Month } from "@/types/months";

import { SummaryCards } from "./SummaryCards";
import { SafeToSpendCard } from "./SafeToSpendCard";
import { AccountBalances } from "./AccountBalances";
import { IncomeVsExpensesChart } from "./IncomeVsExpensesChart";
import { ExpenseBreakdownChart } from "./ExpenseBreakdownChart";
import { BudgetExecutionChart } from "./BudgetExecutionChart";
import { ForecastChart } from "./ForecastChart";

export function DashboardClient() {
  // Requested range, kept in the URL; the server resolves defaults (the
  // current month) and order.
  const searchParams = useSearchParams();
  const requestedRange = useMemo(
    () => ({ from: searchParams.get("from"), to: searchParams.get("to") }),
    [searchParams],
  );
  const setRequestedRange = useCallback((range: { from: string | null; to: string | null }) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(range)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, []);

  const { data, isPending, isPlaceholderData, error } = useDashboardData(
    requestedRange.from,
    requestedRange.to,
  );
  const ensureCurrentMonth = useEnsureCurrentMonth();
  const months = data?.months;

  useEffect(() => {
    if (!months || months.length > 0 || ensureCurrentMonth.isPending) return;
    ensureCurrentMonth.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  const sortedMonths = useMemo(
    () => [...(months ?? [])].sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month)),
    [months]
  );
  const monthById = useMemo(
    () => new Map(sortedMonths.map((month) => [month.id, month])),
    [sortedMonths],
  );
  const monthOptions = useMemo(
    () =>
      sortedMonths.map((month) => ({
        id: month.id,
        label: `${MONTH_NAMES[month.month - 1]} ${month.year}`,
      })),
    [sortedMonths],
  );

  // The figures belong to the range the server resolved; while another range
  // loads, the selects already show what the user picked.
  const fromMonthId = data?.startMonthId ?? null;
  const toMonthId = data?.endMonthId ?? null;
  const fromMonth = (fromMonthId ? monthById.get(fromMonthId) : null) ?? null;
  const toMonth = (toMonthId ? monthById.get(toMonthId) : null) ?? null;
  const selectedFromId = (isPlaceholderData ? requestedRange.from : null) ?? fromMonthId;
  const selectedToId = (isPlaceholderData ? requestedRange.to : null) ?? toMonthId;

  const onFromMonthChange = useCallback(
    (id: string) => setRequestedRange({ from: id, to: selectedToId }),
    [selectedToId, setRequestedRange],
  );
  const onToMonthChange = useCallback(
    (id: string) => setRequestedRange({ from: selectedFromId, to: id }),
    [selectedFromId, setRequestedRange],
  );

  const baseCurrency = data?.baseCurrency ?? null;
  const currencySymbol = useMemo(() => {
    if (!baseCurrency) return "$";
    const found = data?.currencies.find((c) => c.code === baseCurrency);
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, data?.currencies]);

  // No period until the first month exists (see ensureCurrentMonth).
  if (isPending || (data && !data.period && !ensureCurrentMonth.isError && !error)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // A failed background refetch keeps showing the last figures.
  if (!data?.period) {
    return (
      <div className="rounded-md border border-destructive/40 p-4 text-sm">
        <p className="font-medium">No se pudo cargar el dashboard.</p>
        <p className="text-muted-foreground text-xs">
          {errorMessage(error ?? ensureCurrentMonth.error)}
        </p>
      </div>
    );
  }

  const isRange = Boolean(
    fromMonth && toMonth && fromMonthId !== toMonthId,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          {isRange
            ? "Resumen financiero del período seleccionado."
            : "Resumen financiero del mes seleccionado."}
        </p>
      </div>

      <DashboardRangeSelector
        fromMonthId={selectedFromId}
        toMonthId={selectedToId}
        monthOptions={monthOptions}
        disabled={ensureCurrentMonth.isPending}
        onFromMonthChange={onFromMonthChange}
        onToMonthChange={onToMonthChange}
      />

      <div className={isPlaceholderData ? "space-y-6 opacity-60" : "space-y-6"}>
        <DashboardContent
          isRange={isRange}
          monthId={isRange ? null : fromMonthId}
          monthSummary={data.period.summary}
          budgetSummary={data.budgetSummary ?? undefined}
          forecast={data.forecast}
          currencySymbol={currencySymbol}
          accountMonthlyBalances={data.period.accountBalances}
          fromMonth={fromMonth}
          toMonth={toMonth}
          baseCurrency={baseCurrency}
        />
      </div>
    </div>
  );
}

const DashboardRangeSelector = memo(function DashboardRangeSelector({
  fromMonthId,
  toMonthId,
  monthOptions,
  disabled,
  onFromMonthChange,
  onToMonthChange,
}: {
  fromMonthId: string | null;
  toMonthId: string | null;
  monthOptions: Array<{ id: string; label: string }>;
  disabled: boolean;
  onFromMonthChange: (value: string) => void;
  onToMonthChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">Desde</span>
        <Select value={fromMonthId ?? ""} onValueChange={onFromMonthChange} disabled={disabled}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Mes inicial" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((month) => (
              <SelectItem key={month.id} value={month.id}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">Hasta</span>
        <Select value={toMonthId ?? ""} onValueChange={onToMonthChange} disabled={disabled}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Mes final" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((month) => (
              <SelectItem key={month.id} value={month.id}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
});

const DashboardContent = memo(function DashboardContent({
  isRange,
  monthId,
  monthSummary,
  budgetSummary,
  forecast,
  currencySymbol,
  accountMonthlyBalances,
  fromMonth,
  toMonth,
  baseCurrency,
}: {
  isRange: boolean;
  /** The month the charts link to, for a single-month view. */
  monthId: string | null;
  monthSummary: Parameters<typeof SummaryCards>[0]["summary"];
  budgetSummary: Parameters<typeof BudgetExecutionChart>[0]["budgetSummary"];
  forecast: ForecastPoint[] | null;
  currencySymbol: string;
  accountMonthlyBalances: Parameters<typeof AccountBalances>[0]["balances"];
  fromMonth: Month | null;
  toMonth: Month | null;
  baseCurrency: string | null;
}) {
  return (
    <>
      <SummaryCards summary={monthSummary} currencySymbol={currencySymbol} />

      {!isRange && (
        <SafeToSpendCard
          summary={monthSummary}
          budgetSummary={budgetSummary}
          currencySymbol={currencySymbol}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <IncomeVsExpensesChart
          summary={monthSummary}
          currencySymbol={currencySymbol}
        />
        <ExpenseBreakdownChart
          summary={monthSummary}
          currencySymbol={currencySymbol}
          monthId={monthId}
        />
      </div>

      <BudgetExecutionChart
        budgetSummary={budgetSummary}
        currencySymbol={currencySymbol}
        monthId={monthId}
      />

      {!isRange && <ForecastChart forecast={forecast} currencySymbol={currencySymbol} />}

      <AccountBalances
        balances={accountMonthlyBalances}
        selectedMonth={fromMonth}
        endMonth={toMonth}
        baseCurrencyCode={baseCurrency}
        baseCurrencySymbol={currencySymbol}
      />
    </>
  );
});
