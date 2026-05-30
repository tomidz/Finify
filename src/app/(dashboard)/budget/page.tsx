"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
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
import { useBaseCurrency } from "@/hooks/useTransactions";
import { useInvestments } from "@/hooks/useInvestments";
import { useCurrencies } from "@/hooks/useAccounts";
import { useQueryClient } from "@tanstack/react-query";
import { BUDGET_CATEGORY_LABELS, type BudgetCategory } from "@/types/budget";
import type { BudgetLineWithPlan } from "@/types/budget";
import {
  MONTH_NAMES,
  formatAmount,
  parseMoneyInput,
  formatMoneyDisplay,
} from "@/lib/format";

/**
 * Returns a color class for the execution percentage based on category type.
 * For income: more is better (green). For expenses: less is better (green).
 */
function executionColor(type: string, percent: number): string {
  if (type === "income" || type === "savings" || type === "investments") {
    // Income/savings/investments: more is better
    if (percent >= 100) return "text-green-600";
    if (percent >= 80) return "text-yellow-600";
    return "text-red-600";
  }
  // Expenses, debt payments: under budget is good
  if (percent <= 50) return "text-green-600";
  if (percent <= 80) return "text-yellow-600";
  return "text-red-600";
}

const CATEGORY_HEADER_STYLES: Record<string, string> = {
  income: "bg-teal-700 text-white",
  essential_expenses: "bg-amber-700 text-white",
  discretionary_expenses: "bg-amber-600 text-white",
  debt_payments: "bg-rose-700 text-white",
  savings: "bg-sky-700 text-white",
  investments: "bg-emerald-700 text-white",
};

export default function BudgetPage() {
  const [selectedMonthId, setSelectedMonthId] = useState<string | null>(null);
  const { data: months } = useMonths();
  const { data: baseCurrency } = useBaseCurrency();
  const { data: currencies } = useCurrencies();
  const queryClient = useQueryClient();
  const [amountDraftByCategoryId, setAmountDraftByCategoryId] = useState<
    Record<string, string>
  >({});
  const [editingCategoryIds, setEditingCategoryIds] = useState<
    Record<string, boolean>
  >({});

  const ensureCurrentMonth = useEnsureCurrentMonth();
  const sortedMonths = useMemo(
    () => [...(months ?? [])].sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month)),
    [months]
  );

  const currencySymbol = useMemo(() => {
    if (!baseCurrency) return "$";
    const found = currencies?.find((c) => c.code === baseCurrency);
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, currencies]);
  const selectedMonth =
    sortedMonths.find((month) => month.id === selectedMonthId) ?? null;

  useEffect(() => {
    if (!months || months.length > 0 || ensureCurrentMonth.isPending) return;
    ensureCurrentMonth.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  useEffect(() => {
    if (!sortedMonths.length) return;
    if (
      !selectedMonthId ||
      !sortedMonths.some((month) => month.id === selectedMonthId)
    ) {
      setSelectedMonthId(sortedMonths[0].id);
    }
  }, [selectedMonthId, sortedMonths]);

  const createLine = useCreateBudgetLine(selectedMonthId);
  const createNextBudgetFromCurrent = useCreateBudgetNextMonthFromSource(
    selectedMonthId,
  );
  const upsertPlan = useUpsertBudgetMonthPlan(selectedMonthId);

  const ensureLineForCategory = async (category: BudgetCategory) => {
    const existing = queryClient
      .getQueryData<BudgetLineWithPlan[]>(BUDGET_KEYS.lines(selectedMonthId ?? ""))
      ?.find((line) => line.category_id === category.id);
    if (existing) return existing;
    return createLine.mutateAsync({
      category_id: category.id,
      name: category.name,
      display_order: category.display_order ?? 0,
      is_active: true,
    });
  };

  const handleDraftAmountChange = useCallback((categoryId: string, value: string) => {
    setAmountDraftByCategoryId((prev) => ({ ...prev, [categoryId]: value }));
  }, []);

  const handleDraftAmountBlur = useCallback((categoryId: string) => {
    setAmountDraftByCategoryId((prev) => ({
      ...prev,
      [categoryId]: formatMoneyDisplay(prev[categoryId] ?? ""),
    }));
  }, []);

  const handleCreateNextBudget = async () => {
    if (!selectedMonthId) return;
    const categories = queryClient.getQueryData<BudgetCategory[]>(BUDGET_KEYS.categories) ?? [];
    const lines =
      queryClient.getQueryData<BudgetLineWithPlan[]>(
        BUDGET_KEYS.lines(selectedMonthId),
      ) ?? [];
    const summary = queryClient.getQueryData<{
      categories: Array<{ category_id: string; planned_amount: number }>;
    }>(BUDGET_KEYS.summary(selectedMonthId));

    const lineByCategoryId = new Map(lines.map((line) => [line.category_id, line]));
    const summaryByCategoryId = new Map(
      (summary?.categories ?? []).map((category) => [
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

  if (!selectedMonthId) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Presupuesto</h1>
        <p className="text-muted-foreground text-sm">
          Planificá tus categorías por mes y compará plan vs real.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              const idx = sortedMonths.findIndex((m) => m.id === selectedMonthId);
              if (idx < sortedMonths.length - 1) setSelectedMonthId(sortedMonths[idx + 1].id);
            }}
            disabled={
              !selectedMonthId ||
              sortedMonths.findIndex((m) => m.id === selectedMonthId) >= sortedMonths.length - 1
            }
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[160px] text-center text-sm font-medium">
            {selectedMonth
              ? `${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`
              : "—"}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              const idx = sortedMonths.findIndex((m) => m.id === selectedMonthId);
              if (idx > 0) setSelectedMonthId(sortedMonths[idx - 1].id);
            }}
            disabled={
              !selectedMonthId ||
              sortedMonths.findIndex((m) => m.id === selectedMonthId) <= 0
            }
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/budget/categories">Categorías</Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCreateNextBudget}
            disabled={!selectedMonthId || createNextBudgetFromCurrent.isPending}
          >
            Crear mes siguiente
          </Button>
        </div>
      </div>

      <BudgetMonthContent
        selectedMonthId={selectedMonthId}
        selectedMonth={selectedMonth}
        currencySymbol={currencySymbol}
        amountDraftByCategoryId={amountDraftByCategoryId}
        editingCategoryIds={editingCategoryIds}
        createLine={createLine}
        upsertPlan={upsertPlan}
        onDraftAmountChange={handleDraftAmountChange}
        onDraftAmountBlur={handleDraftAmountBlur}
        onSetDrafts={setAmountDraftByCategoryId}
        onSetEditingCategoryIds={setEditingCategoryIds}
        onEnsureLineForCategory={ensureLineForCategory}
      />

    </div>
  );
}

function BudgetMonthContent({
  selectedMonthId,
  selectedMonth,
  currencySymbol,
  amountDraftByCategoryId,
  editingCategoryIds,
  createLine,
  upsertPlan,
  onDraftAmountChange,
  onDraftAmountBlur,
  onSetDrafts,
  onSetEditingCategoryIds,
  onEnsureLineForCategory,
}: {
  selectedMonthId: string;
  selectedMonth: { year: number; month: number } | null;
  currencySymbol: string;
  amountDraftByCategoryId: Record<string, string>;
  editingCategoryIds: Record<string, boolean>;
  createLine: ReturnType<typeof useCreateBudgetLine>;
  upsertPlan: ReturnType<typeof useUpsertBudgetMonthPlan>;
  onDraftAmountChange: (categoryId: string, value: string) => void;
  onDraftAmountBlur: (categoryId: string) => void;
  onSetDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSetEditingCategoryIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onEnsureLineForCategory: (category: BudgetCategory) => Promise<BudgetLineWithPlan | { id: string }>;
}) {
  const { data: categories, isLoading: categoriesLoading } = useBudgetCategories();
  const { data: lines, isLoading: linesLoading } = useBudgetLines(selectedMonthId);
  const { data: summary, isLoading: summaryLoading } = useBudgetSummary(selectedMonthId);
  const safeCategories = useMemo(() => categories ?? [], [categories]);
  const safeLines = useMemo(() => lines ?? [], [lines]);
  const safeSummary = useMemo(
    () =>
      summary ?? { totals: { planned: 0, actual: 0, variance: 0 }, categories: [] },
    [summary]
  );

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
    for (const category of safeSummary.categories) {
      map.set(category.category_id, {
        planned: category.planned_amount,
        actual: category.actual_amount,
        variance: category.variance,
      });
    }
    return map;
  }, [safeSummary]);

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
          return { category, line, planned, actual, variance: planned - actual };
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
    const TYPE_ORDER: Record<string, number> = {
      income: 0,
      essential_expenses: 1,
      discretionary_expenses: 2,
      investments: 3,
      debt_payments: 4,
      savings: 5,
    };
    return Array.from(map.entries())
      .map(([type, rows]) => ({
        type,
        label: BUDGET_CATEGORY_LABELS[type],
        rows: rows.sort((a, b) => a.category.name.localeCompare(b.category.name)),
        plannedTotal: rows.reduce((acc, row) => acc + row.planned, 0),
        actualTotal: rows.reduce((acc, row) => acc + row.actual, 0),
        varianceTotal: rows.reduce((acc, row) => acc + row.variance, 0),
      }))
      .sort((a, b) => (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99));
  }, [categoryRows]);

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    for (const row of categoryRows) {
      nextDrafts[row.category.id] = formatAmount(row.planned);
    }
    onSetDrafts((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(nextDrafts);
      if (prevKeys.length === nextKeys.length) {
        const isSame = nextKeys.every((key) => prev[key] === nextDrafts[key]);
        if (isSame) return prev;
      }
      return nextDrafts;
    });
  }, [categoryRows, onSetDrafts]);

  // Get investment purchases for the selected month
  const { data: allInvestments } = useInvestments();
  const monthInvestmentTotal = useMemo(() => {
    if (!allInvestments || !selectedMonth) return 0;
    return allInvestments
      .filter((inv) => {
        const d = new Date(`${inv.purchase_date}T00:00:00`);
        return d.getFullYear() === selectedMonth.year && d.getMonth() + 1 === selectedMonth.month;
      })
      .reduce((sum, inv) => sum + Math.abs(inv.total_cost), 0);
  }, [allInvestments, selectedMonth]);

  // Compute grouped totals for summary cards (must be before early return)
  const groupedTotals = useMemo(() => {
    const income = { planned: 0, actual: 0 };
    const expenses = { planned: 0, actual: 0 };
    const savings = { planned: 0, actual: 0 };
    const investments = { planned: 0, actual: 0 };

    for (const group of rowsByType) {
      if (group.type === "income") {
        income.planned += group.plannedTotal;
        income.actual += group.actualTotal;
      } else if (group.type === "savings") {
        savings.planned += group.plannedTotal;
      } else if (group.type === "investments") {
        investments.planned += group.plannedTotal;
      } else {
        expenses.planned += group.plannedTotal;
        expenses.actual += group.actualTotal;
      }
    }

    // Inversiones real: del módulo de inversiones (compras del mes)
    investments.actual = monthInvestmentTotal;
    // Plan de ahorro: lo que debería sobrar según el presupuesto
    savings.planned = income.planned - expenses.planned - investments.planned;
    // Ahorro real: lo que sobra después de gastos e inversiones
    savings.actual = income.actual - expenses.actual - investments.actual;

    return { income, expenses, savings, investments };
  }, [rowsByType, monthInvestmentTotal]);

  if (categoriesLoading || linesLoading || summaryLoading || !categories || !lines || !summary) {
    return <BudgetContentFallback />;
  }

  const handleSaveCategoryAmount = async (category: BudgetCategory) => {
    const amount = parseMoneyInput(amountDraftByCategoryId[category.id] ?? "");
    if (amount == null) return false;

    try {
      const ensuredLine = await onEnsureLineForCategory(category);
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

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-1"><CardDescription>Ingresos</CardDescription></CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-semibold ${groupedTotals.income.actual >= groupedTotals.income.planned ? "text-green-600" : "text-amber-600"}`}>{currencySymbol} {formatAmount(groupedTotals.income.actual)}</p>
            <p className="text-muted-foreground text-xs">Plan: {currencySymbol} {formatAmount(groupedTotals.income.planned)}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-1"><CardDescription>Gastos</CardDescription></CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-semibold ${groupedTotals.expenses.actual <= groupedTotals.expenses.planned ? "text-green-600" : "text-red-600"}`}>{currencySymbol} {formatAmount(groupedTotals.expenses.actual)}</p>
            <p className="text-muted-foreground text-xs">Plan: {currencySymbol} {formatAmount(groupedTotals.expenses.planned)}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-1"><CardDescription>Inversiones</CardDescription></CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-semibold ${groupedTotals.investments.actual > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>{currencySymbol} {formatAmount(groupedTotals.investments.actual)}</p>
            <p className="text-muted-foreground text-xs">Plan: {currencySymbol} {formatAmount(groupedTotals.investments.planned)}</p>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-1"><CardDescription>Ahorro</CardDescription></CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-semibold ${groupedTotals.savings.actual >= 0 ? "text-cyan-600" : "text-red-600"}`}>{currencySymbol} {formatAmount(groupedTotals.savings.actual)}</p>
            <p className="text-muted-foreground text-xs">Plan: {currencySymbol} {formatAmount(groupedTotals.savings.planned)}</p>
            {groupedTotals.savings.planned > 0 && (
              <p className={`text-xs font-medium ${groupedTotals.savings.actual >= groupedTotals.savings.planned ? "text-green-600" : "text-red-600"}`}>
                {groupedTotals.savings.actual >= groupedTotals.savings.planned ? "+" : ""}{currencySymbol} {formatAmount(groupedTotals.savings.actual - groupedTotals.savings.planned)} vs plan
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {rowsByType.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="text-muted-foreground mb-3 text-sm">No hay categorías de presupuesto para este mes.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rowsByType.map((group) => {
              // For investments, use real from investments module; for savings, use calculated value
              const effectiveActual = group.type === "investments" ? monthInvestmentTotal
                : group.type === "savings" ? groupedTotals.savings.actual
                : group.actualTotal;
              const executionPercent = group.plannedTotal > 0 ? (effectiveActual / group.plannedTotal) * 100 : 0;
              return (
                <div key={group.type} className="overflow-hidden rounded-md border bg-white">
                  <div className={`px-3 py-2 text-xs font-semibold ${CATEGORY_HEADER_STYLES[group.type] ?? "bg-muted text-foreground"}`}>{group.label}</div>
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b bg-muted/20 px-3 py-2 text-xs font-medium">
                    <span>Subcategoría</span>
                    <span className="w-32 text-right">Plan</span>
                    <span className="w-24 text-right">Ejecutado</span>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    {group.rows.length === 0 ? (
                      <div className="text-muted-foreground px-3 py-2 text-xs">Sin categorías cargadas.</div>
                    ) : (
                      group.rows.map((row) => {
                        const rowPercent = row.planned > 0 ? (row.actual / row.planned) * 100 : 0;
                        return (
                          <div key={row.category.id} className="grid grid-cols-[1fr_auto_auto] gap-2 border-b px-3 py-2 text-xs">
                            <span className="truncate self-center">{row.category.name}</span>
                            <div className="flex items-center gap-1">
                              <Input className="h-8 w-32 text-right" value={amountDraftByCategoryId[row.category.id] ?? formatAmount(row.planned)} onChange={(event) => onDraftAmountChange(row.category.id, event.target.value)} onBlur={() => onDraftAmountBlur(row.category.id)} inputMode="decimal" placeholder="0,00" disabled={!editingCategoryIds[row.category.id]} />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 p-0"
                                title={editingCategoryIds[row.category.id] ? "Guardar monto" : "Editar monto"}
                                onClick={async () => {
                                  if (!editingCategoryIds[row.category.id]) {
                                    onSetEditingCategoryIds((prev) => ({ ...prev, [row.category.id]: true }));
                                    return;
                                  }
                                  const saved = await handleSaveCategoryAmount(row.category);
                                  if (saved) {
                                    onSetEditingCategoryIds((prev) => ({ ...prev, [row.category.id]: false }));
                                  }
                                }}
                                disabled={upsertPlan.isPending || createLine.isPending}
                              >
                                {editingCategoryIds[row.category.id] ? <Save className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                            <div className="flex w-24 flex-col items-end justify-center">
                              <span className={`font-medium ${row.actual === 0 ? "text-muted-foreground" : executionColor(group.type, rowPercent)}`}>
                                {currencySymbol} {formatAmount(row.actual)}
                              </span>
                              {row.planned > 0 && row.actual > 0 && (
                                <span className={`text-[10px] ${executionColor(group.type, rowPercent)}`}>
                                  {rowPercent.toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="border-t bg-muted/30 px-3 py-2">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs font-medium">
                      <span>Total</span>
                      <span className="w-32 text-right">{currencySymbol} {formatAmount(group.plannedTotal)}</span>
                      <span className={`w-24 text-right ${executionColor(group.type, executionPercent)}`}>{currencySymbol} {formatAmount(effectiveActual)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-end text-xs">
                      <span className={executionColor(group.type, executionPercent)}>{executionPercent.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function BudgetContentFallback() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
