"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Plus, Tags } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BUDGET_STATUS_COLORS } from "@/components/charts/palette";
import { MonthSwitcher } from "@/components/month-switcher";
import { PageButton } from "@/components/page-button";
import { RenderErrorBoundary } from "@/components/render-error-boundary";
import { StatCard, StatGrid } from "@/components/stat-card";
import { StateCard } from "@/components/state-card";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import {
  BUDGET_KEYS,
  useBudgetCategories,
  useBudgetLines,
  useBudgetSummary,
  useCreateBudgetNextMonthFromSource,
  useCreateBudgetLine,
  useUpsertBudgetMonthPlan,
} from "@/hooks/useBudget";
import { useEnsureCurrentMonth, useMonths } from "@/hooks/useMonths";
import { useBaseCurrency, useTransactions } from "@/hooks/useTransactions";
import { netInvestmentContributions } from "@/lib/investment-contributions";
import { useCurrencies } from "@/hooks/useAccounts";
import { errorMessage } from "@/lib/action-result";
import { BUDGET_CATEGORY_LABELS, type BudgetCategory } from "@/types/budget";
import type { BudgetLineWithPlan } from "@/types/budget";
import { formatAmount } from "@/lib/format";
import { useShortcut } from "@/lib/keyboard";
import { adjacentMonth, monthLabel } from "@/lib/month-grid";
import {
  BUDGET_GROUP_OF,
  budgetExecution,
  budgetTotalsByGroup,
} from "@/lib/finance/budget-status";
import { BudgetContentSkeleton } from "./_components/BudgetContentSkeleton";
import { BudgetGroupCard, StatusPercent } from "./_components/BudgetGroupCard";
import { CategoryTransactionsSheet } from "./_components/CategoryTransactionsSheet";

export default function BudgetPage() {
  const [selectedMonthId, setSelectedMonthId] = useState<string | null>(null);
  const {
    data: months,
    error: monthsError,
    isFetching: monthsFetching,
    refetch: refetchMonths,
  } = useMonths();
  const { data: baseCurrency } = useBaseCurrency();
  const { data: currencies } = useCurrencies();
  const queryClient = useQueryClient();

  const ensureCurrentMonth = useEnsureCurrentMonth();
  const sortedMonths = useMemo(
    () => [...(months ?? [])].sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month)),
    [months]
  );

  const baseCurrencyInfo = useMemo(
    () => currencies?.find((c) => c.code === baseCurrency),
    [baseCurrency, currencies],
  );
  const currencySymbol = !baseCurrency ? "$" : (baseCurrencyInfo?.symbol ?? baseCurrency);
  const decimals = baseCurrencyInfo?.decimals ?? 2;
  const selectedMonth =
    sortedMonths.find((month) => month.id === selectedMonthId) ?? null;

  useEffect(() => {
    if (!months || months.length > 0 || ensureCurrentMonth.isPending) return;
    ensureCurrentMonth.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  useEffect(() => {
    if (!sortedMonths.length) return;
    // A month just created ("Crear mes siguiente") is selected before the
    // months refetch lists it: wait for the refetch instead of falling back.
    const known = sortedMonths.some((month) => month.id === selectedMonthId);
    if (selectedMonthId && (known || monthsFetching)) return;
    setSelectedMonthId(sortedMonths[0].id);
  }, [selectedMonthId, sortedMonths, monthsFetching]);

  const createNextBudgetFromCurrent = useCreateBudgetNextMonthFromSource(
    selectedMonthId,
  );
  const creatingNext = createNextBudgetFromCurrent.isPending;

  const handleCreateNextBudget = async () => {
    if (!selectedMonthId) return;
    const categories = queryClient.getQueryData<BudgetCategory[]>(BUDGET_KEYS.categories);
    const lines = queryClient.getQueryData<BudgetLineWithPlan[]>(
      BUDGET_KEYS.lines(selectedMonthId),
    );
    const summary = queryClient.getQueryData<{
      categories: Array<{ category_id: string; planned_amount: number }>;
    }>(BUDGET_KEYS.summary(selectedMonthId));
    // Without this month's plan every amount would be copied as 0, and without
    // its categories the next month's plan would be emptied.
    if (!categories || !lines || !summary) {
      toast.error("Todavía no se cargó el presupuesto de este mes.");
      return;
    }

    const lineByCategoryId = new Map(lines.map((line) => [line.category_id, line]));
    const summaryByCategoryId = new Map(
      summary.categories.map((category) => [
        category.category_id,
        category.planned_amount,
      ]),
    );

    const entries = categories.map((row) => ({
      category_id: row.id,
      planned_amount:
        lineByCategoryId.get(row.id)?.planned_amount ??
        summaryByCategoryId.get(row.id) ??
        0,
    }));
    try {
      const result = await createNextBudgetFromCurrent.mutateAsync(entries);
      setSelectedMonthId(result.month_id);
    } catch {
      // toast in hook
    }
  };

  const stepMonth = (direction: -1 | 1) => {
    const target = adjacentMonth(sortedMonths, selectedMonthId, direction);
    if (target) setSelectedMonthId(target.id);
  };
  useShortcut("ArrowLeft", () => stepMonth(-1), { enabled: !creatingNext });
  useShortcut("ArrowRight", () => stepMonth(1), { enabled: !creatingNext });

  const content = (() => {
    if (selectedMonthId) {
      return (
        <BudgetMonthContent
          key={selectedMonthId}
          selectedMonthId={selectedMonthId}
          monthName={!selectedMonth ? "" : monthLabel(selectedMonth)}
          currencySymbol={currencySymbol}
          decimals={decimals}
        />
      );
    }
    if (!months && monthsError) {
      return (
        <StateCard
          variant="error"
          title="No se pudieron cargar los meses"
          error={monthsError}
          onRetry={() => void refetchMonths()}
        />
      );
    }
    if (months?.length === 0 && ensureCurrentMonth.isError) {
      return (
        <StateCard
          variant="error"
          title="No se pudo crear el mes"
          error={ensureCurrentMonth.error}
          onRetry={() => ensureCurrentMonth.mutate()}
        />
      );
    }
    return <BudgetContentSkeleton />;
  })();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderTitleGroup>
          <PageHeaderTitle>Presupuesto</PageHeaderTitle>
          <PageHeaderDescription>Plan vs real por categoría.</PageHeaderDescription>
        </PageHeaderTitleGroup>
        <PageHeaderActions>
          <MonthSwitcher
            months={sortedMonths}
            value={selectedMonthId}
            onChange={(monthId) => setSelectedMonthId(monthId)}
            disabled={creatingNext}
          />
          <PageButton
            variant="outline"
            icon={creatingNext ? undefined : CalendarPlus}
            onClick={handleCreateNextBudget}
            disabled={!selectedMonthId || creatingNext}
          >
            {!creatingNext ? null : <Spinner className="size-3.5" />}
            Crear mes siguiente
          </PageButton>
          <PageButton asChild variant="outline" icon={Tags}>
            <Link href="/budget/categories">Categorías</Link>
          </PageButton>
        </PageHeaderActions>
      </PageHeader>

      {content}
    </div>
  );
}

const TYPE_ORDER: Record<string, number> = {
  income: 0,
  essential_expenses: 1,
  discretionary_expenses: 2,
  investments: 3,
  debt_payments: 4,
  savings: 5,
};

function BudgetMonthContent({
  selectedMonthId,
  monthName,
  currencySymbol,
  decimals,
}: {
  selectedMonthId: string;
  monthName: string;
  currencySymbol: string;
  decimals: number;
}) {
  const queryClient = useQueryClient();
  const categoriesQuery = useBudgetCategories();
  const linesQuery = useBudgetLines(selectedMonthId);
  const summaryQuery = useBudgetSummary(selectedMonthId);
  const { data: categories, isLoading: categoriesLoading, error: categoriesError } = categoriesQuery;
  const { data: lines, isLoading: linesLoading, error: linesError } = linesQuery;
  const { data: summary, isLoading: summaryLoading, error: summaryError } = summaryQuery;
  const createLine = useCreateBudgetLine(selectedMonthId);
  const upsertPlan = useUpsertBudgetMonthPlan();
  const [drillCategory, setDrillCategory] = useState<BudgetCategory | null>(null);
  const safeCategories = useMemo(() => categories ?? [], [categories]);
  const safeLines = useMemo(() => lines ?? [], [lines]);
  const summaryCategories = useMemo(() => summary?.categories ?? [], [summary]);

  const lineByCategoryId = useMemo(() => {
    const map = new Map<string, BudgetLineWithPlan>();
    for (const line of safeLines) {
      if (!map.has(line.category_id)) {
        map.set(line.category_id, line);
      }
    }
    return map;
  }, [safeLines]);

  const summaryByCategoryId = useMemo(() => {
    const map = new Map<string, { planned: number; actual: number; variance: number }>();
    for (const category of summaryCategories) {
      map.set(category.category_id, {
        planned: category.planned_amount,
        actual: category.actual_amount,
        variance: category.variance,
      });
    }
    return map;
  }, [summaryCategories]);

  const categoryRows = useMemo(
    () =>
      safeCategories
        .slice()
        .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
        .map((category) => {
          const line = lineByCategoryId.get(category.id) ?? null;
          const summaryValues = summaryByCategoryId.get(category.id);
          const planned = line?.planned_amount ?? summaryValues?.planned ?? 0;
          const actual = summaryValues?.actual ?? 0;
          return { category, line, planned, actual };
        }),
    [safeCategories, lineByCategoryId, summaryByCategoryId],
  );

  const rowsByType = useMemo(() => {
    const map = new Map<keyof typeof BUDGET_CATEGORY_LABELS, typeof categoryRows>();
    for (const row of categoryRows) {
      const type = row.category.category_type;
      const current = map.get(type) ?? [];
      current.push(row);
      map.set(type, current);
    }
    return Array.from(map.entries())
      .map(([type, rows]) => ({
        type,
        label: BUDGET_CATEGORY_LABELS[type],
        rows: rows.sort((a, b) => a.category.name.localeCompare(b.category.name)),
        plannedTotal: rows.reduce((acc, row) => acc + row.planned, 0),
        actualTotal: rows.reduce((acc, row) => acc + row.actual, 0),
      }))
      .sort((a, b) => (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99));
  }, [categoryRows]);

  // Cash actually put into investments this month (purchases minus sales).
  const { data: monthTransactions, error: transactionsError } = useTransactions(selectedMonthId);
  const monthInvestmentTotal = useMemo(
    () => netInvestmentContributions(monthTransactions ?? []),
    [monthTransactions],
  );

  // Compute grouped totals for summary cards (must be before early return)
  const groupedTotals = useMemo(() => {
    // Ahorro = lo categorizado como ahorro (decisión de producto): el plan y
    // el ejecutado salen de las categorías, no del residuo.
    const totals = budgetTotalsByGroup(
      categoryRows.map((row) => ({
        category_type: row.category.category_type,
        planned_amount: row.planned,
        actual_amount: row.actual,
      })),
    );
    // Inversiones real: del módulo de inversiones (compras del mes)
    const investments = budgetExecution("investments", totals.investments.planned, monthInvestmentTotal);
    // Sobrante informativo: lo que quedó sin gastar ni asignar.
    const leftover =
      totals.income.actual - totals.expenses.actual - investments.actual - totals.savings.actual;

    return { ...totals, investments, leftover };
  }, [categoryRows, monthInvestmentTotal]);

  // Invested this month and the leftover come from the month's transactions:
  // until they load (or when they fail) those two show "—", not 0.
  const investedKnown = monthTransactions != null;
  const money = (amount: number) => `${currencySymbol} ${formatAmount(amount, decimals)}`;
  const formatValue = (amount: number) => formatAmount(amount, decimals);

  if (categoriesLoading || linesLoading || summaryLoading || !categories || !lines || !summary) {
    const loadError =
      (!categories && categoriesError) ||
      (!lines && linesError) ||
      (!summary && summaryError);
    if (loadError) {
      return (
        <StateCard
          variant="error"
          title="No se pudo cargar el presupuesto"
          error={loadError}
          onRetry={() => {
            if (!categories) void categoriesQuery.refetch();
            if (!lines) void linesQuery.refetch();
            if (!summary) void summaryQuery.refetch();
          }}
        />
      );
    }
    return <BudgetContentSkeleton />;
  }

  const ensureLineForCategory = async (category: BudgetCategory) => {
    const existing = queryClient
      .getQueryData<BudgetLineWithPlan[]>(BUDGET_KEYS.lines(selectedMonthId))
      ?.find((line) => line.category_id === category.id);
    if (existing) return existing;
    return createLine.mutateAsync({
      category_id: category.id,
      name: category.name,
      display_order: category.display_order ?? 0,
      is_active: true,
    });
  };

  const handleSaveCategoryAmount = async (category: BudgetCategory, amount: number) => {
    try {
      const ensuredLine = await ensureLineForCategory(category);
      await upsertPlan.mutateAsync({
        line_id: ensuredLine.id,
        month_id: selectedMonthId,
        planned_amount: amount,
      });
      return true;
    } catch {
      return false;
    }
  };

  const { income, expenses, investments, savings, leftover } = groupedTotals;

  return (
    <>
      <StatGrid columns={4}>
        <StatCard
          label="Ingresos"
          value={income.actual}
          currency={currencySymbol}
          format={formatValue}
          sub={
            <span>
              Plan {money(income.planned)} · <StatusPercent execution={income} />
            </span>
          }
        />
        <StatCard
          label="Gastos"
          value={expenses.actual}
          currency={currencySymbol}
          format={formatValue}
          sub={
            <span>
              Plan {money(expenses.planned)} · <StatusPercent execution={expenses} />
            </span>
          }
        />
        <StatCard
          label="Inversiones"
          hint="Compras menos ventas del mes."
          value={investedKnown ? investments.actual : null}
          currency={currencySymbol}
          format={formatValue}
          sub={
            <>
              <span>
                Plan {money(investments.planned)} · <StatusPercent execution={investments} known={investedKnown} />
              </span>
              {!transactionsError ? null : (
                <span className="text-destructive">{errorMessage(transactionsError)}</span>
              )}
            </>
          }
        />
        <StatCard
          label="Ahorro"
          hint="Sobrante: ingresos menos gastos, inversiones y ahorro."
          value={savings.actual}
          currency={currencySymbol}
          format={formatValue}
          sub={
            <>
              <span>
                Plan {money(savings.planned)}
                {savings.planned > 0 && (
                  <>
                    {" · "}
                    <span className="tabular-nums" style={{ color: BUDGET_STATUS_COLORS[savings.status] }}>
                      {savings.favorableVariance >= 0 ? "+" : ""}
                      {money(savings.favorableVariance)} vs plan
                    </span>
                  </>
                )}
              </span>
              <span>Sobrante {investedKnown ? money(leftover) : "—"}</span>
            </>
          }
        />
      </StatGrid>

      {rowsByType.length === 0 ? (
        <StateCard
          variant="empty"
          icon={Tags}
          title="Sin categorías"
          action={
            <PageButton asChild variant="outline" icon={Plus}>
              <Link href="/budget/categories">Crear categoría</Link>
            </PageButton>
          }
        />
      ) : (
        <RenderErrorBoundary name="budget-groups" resetKeys={[rowsByType]} className="min-h-72">
          <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rowsByType.map((group) => {
              // Investments execute from the investments module; every other
              // group (savings included) executes from its own categories.
              const isInvestments = group.type === "investments";
              const effectiveActual = isInvestments ? monthInvestmentTotal : group.actualTotal;
              const actualKnown = !isInvestments || investedKnown;
              return (
                <BudgetGroupCard
                  key={group.type}
                  label={group.label}
                  group={BUDGET_GROUP_OF[group.type]}
                  rows={group.rows}
                  plannedTotal={group.plannedTotal}
                  actualTotal={actualKnown ? effectiveActual : null}
                  decimals={decimals}
                  onOpenCategory={setDrillCategory}
                  onSavePlan={handleSaveCategoryAmount}
                />
              );
            })}
          </div>
        </RenderErrorBoundary>
      )}

      <CategoryTransactionsSheet
        monthId={selectedMonthId}
        monthName={monthName}
        category={drillCategory}
        onClose={() => setDrillCategory(null)}
      />
    </>
  );
}
