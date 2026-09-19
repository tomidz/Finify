"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import { ArrowLeftRight, Download, Plus, SearchX } from "lucide-react";
import { toast } from "sonner";
import { getTransactionsPage } from "@/actions/transactions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import {
  FilterChipBar,
  FilterDropdown,
  type FilterChip,
  type FilterOption,
} from "@/components/filter-dropdown";
import { MonthSwitcher } from "@/components/month-switcher";
import { PageButton } from "@/components/page-button";
import { RenderErrorBoundary } from "@/components/render-error-boundary";
import { SearchInput } from "@/components/search-input";
import { StateCard } from "@/components/state-card";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/hooks/use-confirm";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  useBaseCurrency,
  useInfiniteTransactions,
  usePeriodSummary,
  useDeleteTransaction,
} from "@/hooks/useTransactions";
import {
  useInvestments,
  useCurrentInvestmentValuesByAccount,
} from "@/hooks/useInvestments";
import {
  useMonths,
  useEnsureCurrentMonth,
  useCreateNextMonth,
  usePreviewNextMonth,
} from "@/hooks/useMonths";
import { useAccounts, useCurrencies } from "@/hooks/useAccounts";
import { useBudgetCategories } from "@/hooks/useBudget";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  type TransactionFeedFilters,
  type TransactionType,
  type TransactionWithRelations,
} from "@/types/transactions";
import { BUDGET_CATEGORY_LABELS, type BudgetCategoryType } from "@/types/budget";
import type { NextMonthPreview } from "@/types/months";
import { errorMessage, unwrapResult } from "@/lib/action-result";
import { buildCsv, downloadCsv } from "@/lib/csv-export";
import { useShortcut } from "@/lib/keyboard";
import { adjacentMonth, monthKey, monthLabel } from "@/lib/month-grid";
import { uiScale } from "@/lib/ui-scale";
import { cn } from "@/lib/utils";
import { SummaryCards } from "../../_components/SummaryCards";
import { currentYearMonth } from "@/lib/dates";
import { defaultMonth } from "@/lib/months";
import { TransactionDialog } from "./TransactionDialog";
import { TransferDialog } from "./TransferDialog";
import { CreateMonthDialog } from "./CreateMonthDialog";
import { MonthAccountBalances } from "./MonthAccountBalances";
import { toTableTransaction, transactionColumns } from "./transaction-columns";
import { fetchAllPages, transactionCsvColumns } from "./transactions-export";

const TYPE_OPTIONS: FilterOption[] = TRANSACTION_TYPES.map((type) => ({
  value: type,
  label: TRANSACTION_TYPE_LABELS[type],
}));

const CATEGORY_TYPE_OPTIONS: FilterOption[] = Object.entries(BUDGET_CATEGORY_LABELS).map(
  ([value, label]) => ({ value, label }),
);

// The server caps a page at 100: the export asks for the largest.
const EXPORT_PAGE_SIZE = 100;

export function TransactionsTable() {
  // The month and the filters live in the URL, so a link from the budget or a
  // chart opens the list already filtered.
  const searchParams = useSearchParams();
  const urlMonthId = searchParams.get("month");
  const searchTerm = searchParams.get("q") ?? "";
  const filterParam = (key: string) => {
    const value = searchParams.get(key);
    return !value || value === "all" ? null : value;
  };
  const transactionTypeFilter = filterParam("type");
  const accountIdFilter = filterParam("account");
  const categoryIdFilter = filterParam("category");
  const categoryTypeFilter = filterParam("categoryType");
  const wantsNewTransaction = searchParams.get("new") === "1";
  const [searchDraft, setSearchDraft] = useState(searchTerm);

  const setParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    if (query === window.location.search.replace(/^\?/, "")) return;
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, []);
  const setSelectedMonthId = useCallback((id: string) => setParams({ month: id }), [setParams]);

  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionWithRelations | null>(
    null,
  );
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] =
    useState<TransactionWithRelations | null>(null);
  const [createMonthDialogOpen, setCreateMonthDialogOpen] = useState(false);
  const [nextMonthPreview, setNextMonthPreview] =
    useState<NextMonthPreview | null>(null);
  const [exporting, setExporting] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const confirm = useConfirm();

  const { data: months, error: monthsError, refetch: refetchMonths } = useMonths();
  const ensureCurrentMonth = useEnsureCurrentMonth();
  const createNextMonth = useCreateNextMonth();
  const previewNextMonth = usePreviewNextMonth();
  const sortedMonths = useMemo(() => months ?? [], [months]);
  useEffect(() => {
    if (!months || months.length > 0 || ensureCurrentMonth.isPending) return;
    ensureCurrentMonth.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  const selectedMonthId = useMemo(() => {
    if (sortedMonths.some((month) => month.id === urlMonthId)) return urlMonthId;
    if (!sortedMonths.length) return null;
    return (defaultMonth(sortedMonths, currentYearMonth()) ?? sortedMonths[0]).id;
  }, [urlMonthId, sortedMonths]);

  // The search reaches the URL (and the query) once typing settles.
  const appliedSearch = useDebouncedValue(searchDraft.trim(), 180);
  useEffect(() => {
    setParams({ q: appliedSearch });
  }, [appliedSearch, setParams]);
  // A search the URL got from elsewhere (a link, the palette) replaces the
  // typed one; the page's own push matches what it applied.
  const [seenSearch, setSeenSearch] = useState(searchTerm);
  if (searchTerm !== seenSearch) {
    setSeenSearch(searchTerm);
    if (searchTerm !== appliedSearch) setSearchDraft(searchTerm);
  }

  const selectedMonth =
    sortedMonths.find((month) => month.id === selectedMonthId) ?? null;
  const isCreatingMonth = createNextMonth.isPending || previewNextMonth.isPending;

  const {
    data: period,
    isPlaceholderData: periodIsPrevious,
    error: periodError,
    refetch: refetchPeriod,
  } = usePeriodSummary(
    selectedMonthId,
    selectedMonthId,
  );
  const feedFilters = useMemo<TransactionFeedFilters>(
    () => ({
      search: searchTerm || undefined,
      transaction_type: transactionTypeFilter as TransactionType | null,
      account_id: accountIdFilter,
      category_id: categoryIdFilter,
      category_type: categoryTypeFilter as BudgetCategoryType | null,
    }),
    [searchTerm, transactionTypeFilter, accountIdFilter, categoryIdFilter, categoryTypeFilter],
  );
  const {
    data: transactionPages,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteTransactions(selectedMonthId, feedFilters);
  const {
    mutate: deleteTransaction,
    isPending: isDeleting,
    variables: deletingId,
  } = useDeleteTransaction();
  const { data: baseCurrency } = useBaseCurrency();
  const { data: currencies } = useCurrencies();
  const { data: accounts } = useAccounts();
  const { data: categories } = useBudgetCategories();

  const baseCurrencySymbol = useMemo(() => {
    if (!baseCurrency) return "";
    const found = currencies?.find(
      (currency) => currency.code === baseCurrency,
    );
    return found?.symbol ?? baseCurrency;
  }, [baseCurrency, currencies]);

  const decimalsOf = useCallback(
    (code: string) => currencies?.find((currency) => currency.code === code)?.decimals ?? 2,
    [currencies],
  );

  const feedTransactions = useMemo(
    () => transactionPages?.pages.flatMap((page) => page.items) ?? [],
    [transactionPages],
  );

  useEffect(() => {
    const target = loadMoreRef.current;
    // After a failed page only the button asks again: the sentinel is still
    // in view and would retry without end.
    if (!target || !hasNextPage || isFetchNextPageError) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "300px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError, feedTransactions.length]);

  const tableTransactions = useMemo(
    () => feedTransactions.map(toTableTransaction),
    [feedTransactions],
  );

  const { data: allInvestments } = useInvestments();
  const { data: currentInvestmentByAccount } =
    useCurrentInvestmentValuesByAccount();

  // Sum investment total_cost per account (in the account's currency).
  const investmentByAccount = useMemo(() => {
    const map = new Map<string, number>();
    if (!allInvestments) return map;
    for (const inv of allInvestments) {
      const current = map.get(inv.account_id) ?? 0;
      map.set(inv.account_id, current + inv.total_cost);
    }
    return map;
  }, [allInvestments]);

  // Active accounts, plus an inactive one a link filtered by.
  const accountOptions = useMemo<FilterOption[]>(
    () =>
      (accounts ?? [])
        .filter((account) => account.is_active || account.id === accountIdFilter)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((account) => ({ value: account.id, label: account.name })),
    [accounts, accountIdFilter],
  );

  const categoryOptions = useMemo<FilterOption[]>(
    () =>
      (categories ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((category) => ({ value: category.id, label: category.name })),
    [categories],
  );

  const clearFilters = useCallback(() => {
    setSearchDraft("");
    setParams({ q: null, type: null, account: null, category: null, categoryType: null });
  }, [setParams]);

  const filterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    if (transactionTypeFilter) {
      chips.push({
        id: "type",
        label: "Tipo",
        value: TRANSACTION_TYPE_LABELS[transactionTypeFilter as TransactionType] ?? transactionTypeFilter,
        onRemove: () => setParams({ type: null }),
      });
    }
    if (accountIdFilter) {
      chips.push({
        id: "account",
        label: "Cuenta",
        value: accounts?.find((account) => account.id === accountIdFilter)?.name ?? "—",
        onRemove: () => setParams({ account: null }),
      });
    }
    if (categoryIdFilter) {
      chips.push({
        id: "category",
        label: "Categoría",
        value: categories?.find((category) => category.id === categoryIdFilter)?.name ?? "—",
        onRemove: () => setParams({ category: null }),
      });
    }
    if (categoryTypeFilter) {
      chips.push({
        id: "categoryType",
        label: "Tipo de categoría",
        value:
          BUDGET_CATEGORY_LABELS[categoryTypeFilter as BudgetCategoryType] ?? categoryTypeFilter,
        onRemove: () => setParams({ categoryType: null }),
      });
    }
    return chips;
  }, [
    transactionTypeFilter,
    accountIdFilter,
    categoryIdFilter,
    categoryTypeFilter,
    accounts,
    categories,
    setParams,
  ]);
  const hasActiveFilters = searchTerm !== "" || filterChips.length > 0;

  const handleCreateTx = useCallback(() => {
    setEditingTx(null);
    setTxDialogOpen(true);
  }, []);

  const handleCreateTransfer = useCallback(() => {
    setEditingTransfer(null);
    setTransferDialogOpen(true);
  }, []);

  const handleEdit = useCallback((tx: TransactionWithRelations) => {
    if (tx.transaction_type === "transfer") {
      setEditingTransfer(tx);
      setTransferDialogOpen(true);
      return;
    }
    setEditingTx(tx);
    setTxDialogOpen(true);
  }, []);

  // The success toast offers the undo (useDeleteTransaction); errors toast too.
  const handleDelete = useCallback(
    async (tx: TransactionWithRelations) => {
      const confirmed = await confirm({
        title:
          tx.transaction_type === "transfer"
            ? "¿Eliminar transferencia?"
            : "¿Eliminar transacción?",
        description: (
          <>
            <p className="text-foreground font-medium">{tx.description}</p>
            <p>Podés deshacerlo desde el aviso.</p>
          </>
        ),
        confirmLabel: "Eliminar",
        destructive: true,
      });
      if (!confirmed) return;
      deleteTransaction(tx.id);
    },
    [confirm, deleteTransaction],
  );

  const columns = useMemo(
    () =>
      transactionColumns({
        baseCurrencySymbol,
        decimalsOf,
        deletingId: isDeleting ? deletingId : undefined,
        onEdit: handleEdit,
        onDelete: handleDelete,
      }),
    [baseCurrencySymbol, decimalsOf, isDeleting, deletingId, handleEdit, handleDelete],
  );

  const table = useReactTable({
    data: tableTransactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const stepMonth = (direction: -1 | 1) => {
    const target = adjacentMonth(sortedMonths, selectedMonthId, direction);
    if (target) setSelectedMonthId(target.id);
  };
  useShortcut("n", handleCreateTx, { enabled: !!selectedMonthId });
  useShortcut("ArrowLeft", () => stepMonth(-1), { enabled: !isCreatingMonth });
  useShortcut("ArrowRight", () => stepMonth(1), { enabled: !isCreatingMonth });

  // The ⌘K palette's "Nueva transacción" lands on ?new=1.
  useEffect(() => {
    if (!wantsNewTransaction || !selectedMonthId) return;
    handleCreateTx();
    setParams({ new: null });
  }, [wantsNewTransaction, selectedMonthId, handleCreateTx, setParams]);

  const handleCreateNextMonth = async () => {
    try {
      const preview = await previewNextMonth.mutateAsync();
      setNextMonthPreview(preview);
      setCreateMonthDialogOpen(true);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const handleConfirmCreateMonth = async () => {
    try {
      const month = await createNextMonth.mutateAsync();
      setSelectedMonthId(month.id);
      setCreateMonthDialogOpen(false);
      setNextMonthPreview(null);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  // Every transaction of the month that matches the filters, not only the
  // loaded pages.
  const handleExport = async () => {
    if (!selectedMonth) return;
    setExporting(true);
    try {
      const monthId = selectedMonth.id;
      const rows = await fetchAllPages(async (offset) =>
        unwrapResult(
          await getTransactionsPage({ monthId, limit: EXPORT_PAGE_SIZE, offset, ...feedFilters }),
        ),
      );
      if (rows.length === 0) {
        toast("No hay movimientos para exportar");
        return;
      }
      downloadCsv(
        `movimientos-${monthKey(selectedMonth)}.csv`,
        buildCsv(rows, transactionCsvColumns(baseCurrency ?? null)),
      );
    } catch (exportError) {
      console.error("[transactions] export failed", exportError);
      toast.error(errorMessage(exportError));
    } finally {
      setExporting(false);
    }
  };

  const monthsFailed = (!!monthsError && !months) || ensureCurrentMonth.isError;

  const renderSummary = () => {
    if (!selectedMonthId) return monthsFailed ? null : <SummarySkeleton />;
    // A failed refresh keeps the figures on screen.
    if (periodError && !period) {
      return (
        <StateCard
          variant="error"
          title="No se pudo calcular el resumen"
          error={periodError}
          onRetry={() => refetchPeriod()}
        />
      );
    }
    if (!period) return <SummarySkeleton />;
    return (
      // While another month loads, the previous one's figures stay dimmed.
      <div className={cn("flex flex-col gap-6", periodIsPrevious && "opacity-60")}>
        <SummaryCards summary={period.summary} currencySymbol={baseCurrencySymbol} detailed />
        <MonthAccountBalances
          accountMonthlyBalances={period.accountBalances}
          investmentByAccount={investmentByAccount}
          currentInvestmentByAccount={currentInvestmentByAccount}
          baseCurrencySymbol={baseCurrencySymbol}
        />
      </div>
    );
  };

  const renderFeed = () => {
    if (!selectedMonthId) {
      if (monthsError && !months) {
        return (
          <StateCard variant="error" error={monthsError} onRetry={() => refetchMonths()} className="min-h-72" />
        );
      }
      if (ensureCurrentMonth.isError) {
        return (
          <StateCard
            variant="error"
            error={ensureCurrentMonth.error}
            onRetry={() => ensureCurrentMonth.mutate()}
            className="min-h-72"
          />
        );
      }
      return <StateCard variant="loading" className="min-h-72" />;
    }

    // A failed refresh keeps the rows (QueryProvider says it failed).
    if (!transactionPages) {
      return isError ? (
        <StateCard variant="error" error={error} onRetry={() => refetch()} className="min-h-72" />
      ) : (
        <StateCard variant="loading" className="min-h-72" />
      );
    }

    if (tableTransactions.length === 0) {
      return hasActiveFilters ? (
        <StateCard
          variant="empty"
          icon={SearchX}
          title="Sin resultados"
          action={
            <Button variant="outline" size="sm" className={uiScale.button} onClick={clearFilters}>
              Limpiar filtros
            </Button>
          }
          className="min-h-72"
        />
      ) : (
        <StateCard
          variant="empty"
          title={!selectedMonth ? "Sin movimientos" : `Sin movimientos en ${monthLabel(selectedMonth)}`}
          action={
            <Button variant="outline" size="sm" className={uiScale.button} onClick={handleCreateTx}>
              <Plus />
              Nueva transacción
            </Button>
          }
          className="min-h-72"
        />
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-md border">
          <Table className="text-xs">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-1.5">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
          <span className="tabular-nums">
            {tableTransactions.length.toLocaleString("es-AR")} cargados
          </span>
          {hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              className={uiScale.button}
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {!isFetchingNextPage ? null : <Spinner className="size-3.5" />}
              Cargar más
            </Button>
          ) : (
            <span>No hay más</span>
          )}
        </div>

        <div ref={loadMoreRef} className="h-1 w-full" />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderTitleGroup>
          <PageHeaderTitle>Transacciones</PageHeaderTitle>
        </PageHeaderTitleGroup>
        <PageHeaderActions>
          <PageButton
            variant="outline"
            icon={exporting ? undefined : Download}
            onClick={handleExport}
            disabled={!selectedMonth || exporting}
          >
            {!exporting ? null : <Spinner className="size-3.5" />}
            Exportar
          </PageButton>
          <PageButton
            variant="outline"
            icon={ArrowLeftRight}
            onClick={handleCreateTransfer}
            disabled={!selectedMonthId}
          >
            Transferencia
          </PageButton>
          <PageButton
            icon={Plus}
            kbd="N"
            onClick={handleCreateTx}
            disabled={!selectedMonthId}
          >
            Nueva transacción
          </PageButton>
        </PageHeaderActions>
      </PageHeader>

      <MonthSwitcher
        months={sortedMonths}
        value={selectedMonthId}
        onChange={setSelectedMonthId}
        onCreateNext={handleCreateNextMonth}
        creatingNext={isCreatingMonth}
      />

      <RenderErrorBoundary name="transactions-summary" resetKeys={[period]} className="min-h-40">
        {renderSummary()}
      </RenderErrorBoundary>

      <div className="flex flex-col gap-3">
        <DataTableToolbar
          search={
            <SearchInput
              value={searchDraft}
              onValueChange={setSearchDraft}
              placeholder="Buscar"
              shortcut
            />
          }
          filters={
            <>
              <FilterDropdown
                label="Tipo"
                options={TYPE_OPTIONS}
                value={transactionTypeFilter}
                onValueChange={(value) => setParams({ type: value })}
              />
              <FilterDropdown
                label="Cuenta"
                options={accountOptions}
                value={accountIdFilter}
                onValueChange={(value) => setParams({ account: value })}
              />
              <FilterDropdown
                label="Categoría"
                options={categoryOptions}
                value={categoryIdFilter}
                onValueChange={(value) => setParams({ category: value })}
              />
              <FilterDropdown
                label="Tipo de categoría"
                options={CATEGORY_TYPE_OPTIONS}
                value={categoryTypeFilter}
                onValueChange={(value) => setParams({ categoryType: value })}
              />
            </>
          }
        >
          <FilterChipBar chips={filterChips} onClearAll={clearFilters} />
        </DataTableToolbar>

        <RenderErrorBoundary name="transactions-feed" resetKeys={[transactionPages]} className="min-h-72">
          {renderFeed()}
        </RenderErrorBoundary>
      </div>

      {(txDialogOpen || editingTx) && (
        <TransactionDialog
          transaction={editingTx}
          monthId={selectedMonthId}
          open={txDialogOpen}
          onOpenChange={setTxDialogOpen}
        />
      )}

      {(transferDialogOpen || editingTransfer) && (
        <TransferDialog
          transfer={editingTransfer}
          monthId={selectedMonthId}
          open={transferDialogOpen}
          onOpenChange={setTransferDialogOpen}
        />
      )}

      <CreateMonthDialog
        open={createMonthDialogOpen}
        preview={nextMonthPreview}
        baseCurrencySymbol={baseCurrencySymbol}
        creating={createNextMonth.isPending}
        onConfirm={handleConfirmCreateMonth}
        onClose={() => {
          setCreateMonthDialogOpen(false);
          setNextMonthPreview(null);
        }}
      />
    </div>
  );
}

/** The summary cards and account balances while the month's figures load. */
function SummarySkeleton() {
  return (
    <StateCard variant="loading">
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    </StateCard>
  );
}
