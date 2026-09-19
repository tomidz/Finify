"use client";

import { memo, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { MonthRangePicker } from "@/components/month-range-picker";
import { RenderErrorBoundary } from "@/components/render-error-boundary";
import { StateCard } from "@/components/state-card";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";
import { useEnsureCurrentMonth } from "@/hooks/useMonths";
import { useDashboardData } from "@/hooks/useScreens";
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

  const { data, isPending, isPlaceholderData, isFetching, error, refetch } = useDashboardData(
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

  const monthById = useMemo(
    () => new Map((months ?? []).map((month) => [month.id, month])),
    [months],
  );

  // The figures belong to the range the server resolved; while another range
  // loads, the picker already shows what the user picked.
  const fromMonthId = data?.startMonthId ?? null;
  const toMonthId = data?.endMonthId ?? null;
  const fromMonth = (fromMonthId ? monthById.get(fromMonthId) : null) ?? null;
  const toMonth = (toMonthId ? monthById.get(toMonthId) : null) ?? null;
  const selectedFromId = (isPlaceholderData ? requestedRange.from : null) ?? fromMonthId;
  const selectedToId = (isPlaceholderData ? requestedRange.to : null) ?? toMonthId;

  const onRangeChange = useCallback(
    (from: string, to: string) => setRequestedRange({ from, to }),
    [setRequestedRange],
  );
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const baseCurrency = data?.baseCurrency ?? null;
  const currencySymbol = useMemo(() => {
    if (!baseCurrency) return "$";
    const found = data?.currencies.find((c) => c.code === baseCurrency);
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, data?.currencies]);

  const header = (
    <DashboardHeader>
      <MonthRangePicker
        months={months ?? []}
        startId={selectedFromId}
        endId={selectedToId}
        onChange={onRangeChange}
        disabled={ensureCurrentMonth.isPending}
      />
    </DashboardHeader>
  );

  // No period until the first month exists (see ensureCurrentMonth), nor while
  // a failed read is retried.
  if (
    isPending ||
    (!data?.period && isFetching) ||
    (data && !data.period && !ensureCurrentMonth.isError && !error)
  ) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <DashboardLoadingBody />
      </div>
    );
  }

  // A failed background refetch keeps showing the last figures.
  if (!data?.period) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <StateCard
          variant="error"
          title="No se pudo cargar el dashboard"
          error={error ?? ensureCurrentMonth.error}
          onRetry={error ? retry : () => ensureCurrentMonth.mutate()}
          className="min-h-72"
        />
      </div>
    );
  }

  const isRange = Boolean(
    fromMonth && toMonth && fromMonthId !== toMonthId,
  );

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className={isPlaceholderData ? "flex flex-col gap-6 opacity-60" : "flex flex-col gap-6"}>
        <DashboardContent
          isRange={isRange}
          monthId={isRange ? null : fromMonthId}
          monthSummary={data.period.summary}
          budgetSummary={data.budgetSummary}
          forecast={data.forecast}
          currencySymbol={currencySymbol}
          accountMonthlyBalances={data.period.accountBalances}
          fromMonth={fromMonth}
          toMonth={toMonth}
          baseCurrency={baseCurrency}
          onRetry={retry}
          retrying={isFetching}
        />
      </div>
    </div>
  );
}

function DashboardHeader({ children }: { children: React.ReactNode }) {
  return (
    <PageHeader>
      <PageHeaderTitleGroup>
        <PageHeaderTitle>Dashboard</PageHeaderTitle>
      </PageHeaderTitleGroup>
      <PageHeaderActions>{children}</PageHeaderActions>
    </PageHeader>
  );
}

/** The blocks every range shows, before any figure arrives. */
function DashboardLoadingBody() {
  return (
    <>
      <SummaryCards summary={null} currencySymbol="" loading />
      <div className="grid gap-4 md:grid-cols-2">
        <IncomeVsExpensesChart summary={null} currencySymbol="" />
        <ExpenseBreakdownChart summary={null} currencySymbol="" monthId={null} />
      </div>
      <BudgetExecutionChart budgetSummary={null} currencySymbol="" monthId={null} loading />
    </>
  );
}

/** The page's Suspense fallback. */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader>
        <MonthRangePicker months={[]} startId={null} endId={null} onChange={() => {}} disabled />
      </DashboardHeader>
      <DashboardLoadingBody />
    </div>
  );
}

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
  onRetry,
  retrying,
}: {
  isRange: boolean;
  /** The month the charts link to, for a single-month view. */
  monthId: string | null;
  monthSummary: NonNullable<Parameters<typeof SummaryCards>[0]["summary"]>;
  /** Null when its read failed: shown as unavailable, never as an empty budget. */
  budgetSummary: Parameters<typeof BudgetExecutionChart>[0]["budgetSummary"];
  /** Null for a range, or when its read failed. */
  forecast: ForecastPoint[] | null;
  currencySymbol: string;
  accountMonthlyBalances: Parameters<typeof AccountBalances>[0]["balances"];
  fromMonth: Month | null;
  toMonth: Month | null;
  baseCurrency: string | null;
  /** Reads the screen again, for the sections it left out. */
  onRetry: () => void;
  /** A read is in flight: a section left out may come back. */
  retrying: boolean;
}) {
  return (
    <>
      <RenderErrorBoundary name="dashboard-summary" resetKeys={[monthSummary]} className="min-h-24">
        <SummaryCards summary={monthSummary} currencySymbol={currencySymbol} />
      </RenderErrorBoundary>

      {!isRange && (
        <RenderErrorBoundary name="safe-to-spend" resetKeys={[monthSummary, budgetSummary]} className="min-h-24">
          <SafeToSpendCard
            summary={monthSummary}
            budgetSummary={budgetSummary}
            currencySymbol={currencySymbol}
          />
        </RenderErrorBoundary>
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
        onRetry={onRetry}
        loading={retrying && budgetSummary === null}
      />

      {!isRange && (
        <ForecastChart
          forecast={forecast}
          currencySymbol={currencySymbol}
          onRetry={onRetry}
          loading={retrying && forecast === null}
        />
      )}

      <RenderErrorBoundary name="account-balances" resetKeys={[accountMonthlyBalances]} className="min-h-40">
        <AccountBalances
          balances={accountMonthlyBalances}
          selectedMonth={fromMonth}
          endMonth={toMonth}
          baseCurrencyCode={baseCurrency}
          baseCurrencySymbol={currencySymbol}
        />
      </RenderErrorBoundary>
    </>
  );
});
