"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useBaseCurrency,
  useInfiniteTransactions,
  useTransactions,
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
  useOpeningBalances,
} from "@/hooks/useMonths";
import { useAccounts, useCurrencies } from "@/hooks/useAccounts";
import { useBudgetCategories } from "@/hooks/useBudget";
import {
  TRANSACTION_TYPE_LABELS,
  type TransactionWithRelations,
} from "@/types/transactions";
import { BUDGET_CATEGORY_LABELS } from "@/types/budget";
import { TransactionDialog } from "./TransactionDialog";
import { TransferDialog } from "./TransferDialog";
import { parseISO, format } from "date-fns";
import type { Month, NextMonthPreview } from "@/types/months";
import { MONTH_NAMES, formatAmount, amountTone } from "@/lib/format";
import { useMonthSummary, getPrimaryLine } from "@/hooks/useMonthSummary";
import { recalculateAllOpeningBalances } from "@/actions/months";

type TableTransaction = TransactionWithRelations & {
  primaryLine: NonNullable<ReturnType<typeof getPrimaryLine>> | null;
  primaryAccountName: string;
  primaryAmount: number;
  primaryBaseAmount: number;
  searchText: string;
};

const TYPE_BADGE_STYLES: Record<string, string> = {
  income: "bg-green-100 text-green-800 hover:bg-green-100",
  expense: "bg-red-100 text-red-800 hover:bg-red-100",
  transfer: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  correction: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
};

const AMOUNT_COLOR: Record<string, string> = {
  income: "text-green-600",
  expense: "text-red-600",
  transfer: "text-blue-600",
  correction: "text-yellow-600",
};

export function TransactionsTable() {
  const [selectedMonthId, setSelectedMonthId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [transactionTypeFilter, setTransactionTypeFilter] = useState("all");
  const [accountIdFilter, setAccountIdFilter] = useState("all");
  const [categoryIdFilter, setCategoryIdFilter] = useState("all");
  const [categoryTypeFilter, setCategoryTypeFilter] = useState("all");

  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionWithRelations | null>(
    null,
  );
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] =
    useState<TransactionWithRelations | null>(null);
  const [deletingTx, setDeletingTx] = useState<TransactionWithRelations | null>(
    null,
  );
  const [createMonthDialogOpen, setCreateMonthDialogOpen] = useState(false);
  const [nextMonthPreview, setNextMonthPreview] =
    useState<NextMonthPreview | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const { data: months } = useMonths();
  const ensureCurrentMonth = useEnsureCurrentMonth();
  const createNextMonth = useCreateNextMonth();
  const previewNextMonth = usePreviewNextMonth();
  const sortedMonths = useMemo(() => months ?? [], [months]);
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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchTerm(searchDraft.trim());
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [searchDraft]);

  // One-time recalculation of all opening balances to fix stale data
  useEffect(() => {
    recalculateAllOpeningBalances().catch(console.error);
  }, []);

  const selectedMonth =
    sortedMonths.find((month) => month.id === selectedMonthId) ?? null;
  const hasActiveFilters =
    searchDraft.trim().length > 0 ||
    transactionTypeFilter !== "all" ||
    accountIdFilter !== "all" ||
    categoryIdFilter !== "all" ||
    categoryTypeFilter !== "all";

  const {
    data: transactions,
    isLoading: summaryLoading,
  } = useTransactions(selectedMonthId);
  const {
    data: transactionPages,
    isLoading: isFeedLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteTransactions(selectedMonthId, {
    search: searchTerm || undefined,
    transaction_type:
      transactionTypeFilter === "all"
        ? null
        : (transactionTypeFilter as TransactionWithRelations["transaction_type"]),
    account_id: accountIdFilter === "all" ? null : accountIdFilter,
    category_id: categoryIdFilter === "all" ? null : categoryIdFilter,
    category_type:
      categoryTypeFilter === "all"
        ? null
        : (categoryTypeFilter as NonNullable<TransactionWithRelations["category_type"]>),
  });
  const { data: openingBalances } = useOpeningBalances(selectedMonthId);
  const deleteMutation = useDeleteTransaction();
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

  const feedTransactions = useMemo(
    () => transactionPages?.pages.flatMap((page) => page.items) ?? [],
    [transactionPages],
  );

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage) return;

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
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, feedTransactions.length]);

  const tableTransactions = useMemo<TableTransaction[]>(() => {
    return feedTransactions.map((transaction) => {
      const primaryLine = getPrimaryLine(transaction);
      const primaryAccountName = primaryLine?.account_name ?? "";
      const primaryAmount = Math.abs(primaryLine?.amount ?? 0);
      const primaryBaseAmount = Math.abs(
        primaryLine?.current_base_amount ?? primaryLine?.base_amount ?? 0,
      );

      return {
        ...transaction,
        primaryLine,
        primaryAccountName,
        primaryAmount,
        primaryBaseAmount,
        searchText: [
          transaction.description,
          transaction.category_name ?? "",
          primaryAccountName,
          TRANSACTION_TYPE_LABELS[transaction.transaction_type],
        ]
          .join(" ")
          .toLowerCase(),
      };
    });
  }, [feedTransactions]);

  const { monthSummary, accountMonthlyBalances } = useMonthSummary(
    transactions,
    openingBalances,
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

  const accountFilterOptions = useMemo(
    () =>
      (accounts ?? [])
        .filter((account) => account.is_active)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [accounts],
  );

  const categoryFilterOptions = useMemo(
    () =>
      (categories ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const columns = useMemo<ColumnDef<TableTransaction>[]>(
    () => [
      {
        accessorKey: "date",
        header: "Fecha",
        cell: ({ row }) => format(parseISO(row.original.date), "dd/MM/yyyy"),
      },
      {
        accessorKey: "description",
        header: "Descripción",
        enableSorting: false,
        cell: ({ row }) => {
          const tx = row.original;
          const fee = Number(tx.fee ?? 0);
          const sourceLine = tx.amounts?.find((line) => line.amount < 0);
          return (
            <div className="flex items-center gap-1.5">
              <span>{tx.description}</span>
              {tx.notes && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <StickyNote className="size-3.5 shrink-0 cursor-pointer text-amber-500 hover:text-amber-600" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs whitespace-pre-wrap">{tx.notes}</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {tx.transaction_type === "transfer" && fee > 0 && (
                <span className="text-xs text-muted-foreground">
                  · fee {sourceLine?.account_currency_symbol ?? ""}{" "}
                  {formatAmount(fee)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "transaction_type",
        header: "Tipo",
        enableSorting: false,
        cell: ({ row }) => {
          const type = row.original.transaction_type;
          return (
            <Badge
              variant="secondary"
              className={TYPE_BADGE_STYLES[type] ?? ""}
            >
              {TRANSACTION_TYPE_LABELS[type]}
            </Badge>
          );
        },
      },
      {
        accessorFn: (row) => row.primaryAccountName || "—",
        id: "account_name",
        header: "Cuenta",
        enableSorting: false,
        cell: ({ row }) => row.original.primaryAccountName || "—",
      },
      {
        accessorKey: "category_name",
        header: "Categoría",
        enableSorting: false,
        filterFn: "equalsString",
        cell: ({ row }) => row.original.category_name ?? "—",
      },
      {
        accessorKey: "category_type",
        header: "Tipo de categoría",
        enableSorting: false,
        enableHiding: true,
      },
      {
        accessorFn: (row) => row.primaryAmount,
        id: "amount",
        header: "Monto",
        cell: ({ row }) => {
          const tx = row.original;
          const line = tx.primaryLine;
          const color = AMOUNT_COLOR[tx.transaction_type] ?? "";
          return (
            <span className={`font-medium ${color}`}>
              {line?.account_currency_symbol ?? ""}{" "}
              {formatAmount(Math.abs(line?.amount ?? 0))}
            </span>
          );
        },
      },
      {
        accessorFn: (row) => row.primaryBaseAmount,
        id: "base_amount",
        header: "Monto Base",
        cell: ({ row }) =>
          `${baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}${formatAmount(
            row.original.primaryBaseAmount,
          )}`,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Acciones</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const tx = row.original;
          return (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar transacción"
                onClick={() => handleEdit(tx)}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar transacción"
                onClick={() => setDeletingTx(tx)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    // handleEdit is a stable useCallback([]) declared below; referencing it here
    // would hit the temporal dead zone, so it is intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseCurrencySymbol],
  );

  const table = useReactTable({
    data: tableTransactions,
    columns,
    initialState: { columnVisibility: { category_type: false } },
    getCoreRowModel: getCoreRowModel(),
  });

  const handleCreateTx = useCallback(() => {
    setEditingTx(null);
    setTxDialogOpen(true);
  }, []);

  const handleCreateTransfer = useCallback(() => {
    setEditingTransfer(null);
    setTransferDialogOpen(true);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchDraft("");
    setSearchTerm("");
    setTransactionTypeFilter("all");
    setAccountIdFilter("all");
    setCategoryIdFilter("all");
    setCategoryTypeFilter("all");
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

  const handleDelete = async () => {
    if (!deletingTx) return;
    try {
      await deleteMutation.mutateAsync(deletingTx.id);
      setDeletingTx(null);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

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

  if ((isFeedLoading || summaryLoading) && !selectedMonthId) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError && error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
        <p className="text-destructive font-medium">
          Error al cargar las transacciones
        </p>
        <p className="text-muted-foreground mt-1 text-sm">{error.message}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => refetch()}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <>
      <TransactionsToolbar
        selectedMonthId={selectedMonthId}
        selectedMonth={selectedMonth}
        sortedMonths={sortedMonths}
        isCreatingMonth={createNextMonth.isPending || previewNextMonth.isPending}
        onMonthChange={setSelectedMonthId}
        onCreateNextMonth={handleCreateNextMonth}
        onCreateTransfer={handleCreateTransfer}
        onCreateTransaction={handleCreateTx}
      />

      <TransactionsSummaryCards
        monthSummary={monthSummary}
        baseCurrencySymbol={baseCurrencySymbol}
      />

      <TransactionsAccountBalances
        selectedMonth={selectedMonth}
        accountMonthlyBalances={accountMonthlyBalances}
        investmentByAccount={investmentByAccount}
        currentInvestmentByAccount={currentInvestmentByAccount}
        baseCurrencySymbol={baseCurrencySymbol}
      />

      <div className="flex flex-wrap items-start justify-start gap-2">
        <Input
          className="w-full md:w-80"
          placeholder="Buscar descripción/cuenta/categoría..."
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
        />
        <Select
          value={transactionTypeFilter}
          onValueChange={setTransactionTypeFilter}
        >
          <SelectTrigger className="w-full md:w-52">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="income">Ingreso</SelectItem>
            <SelectItem value="expense">Gasto</SelectItem>
            <SelectItem value="transfer">Transferencia</SelectItem>
            <SelectItem value="correction">Corrección</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={accountIdFilter}
          onValueChange={setAccountIdFilter}
        >
          <SelectTrigger className="w-full md:w-52">
            <SelectValue placeholder="Cuenta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las cuentas</SelectItem>
            {accountFilterOptions.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={categoryIdFilter}
          onValueChange={setCategoryIdFilter}
        >
          <SelectTrigger className="w-full md:w-52">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categoryFilterOptions.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={categoryTypeFilter}
          onValueChange={setCategoryTypeFilter}
        >
          <SelectTrigger className="w-full md:w-52">
            <SelectValue placeholder="Tipo de gasto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {Object.entries(BUDGET_CATEGORY_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={handleClearFilters}
          disabled={!hasActiveFilters}
        >
          Limpiar filtros
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
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
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center justify-center gap-3">
                    <p className="text-sm">
                      {selectedMonth
                        ? `No hay transacciones en ${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}.`
                        : "Seleccioná un mes para ver transacciones."}
                    </p>
                    <Button
                      onClick={handleCreateTx}
                      variant="outline"
                      size="sm"
                      disabled={!selectedMonthId}
                    >
                      <Plus className="mr-1 size-4" />
                      Crear transacción
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          {tableTransactions.length} resultado(s) cargados
        </p>
        <div className="flex items-center gap-2">
          {hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? "Cargando..." : "Cargar más"}
            </Button>
          ) : (
            <span className="text-muted-foreground text-sm">
              No hay más resultados
            </span>
          )}
        </div>
      </div>

      <div ref={loadMoreRef} className="h-1 w-full" />

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

      <Dialog
        open={!!deletingTx}
        onOpenChange={(open) => !open && setDeletingTx(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar transacción</DialogTitle>
            <DialogDescription>
              {deletingTx?.transaction_type === "transfer" ? (
                <>
                  ¿Estás seguro de que querés eliminar esta transferencia? Se
                  eliminará la transacción y sus líneas asociadas. Esta acción
                  no se puede deshacer.
                </>
              ) : (
                <>
                  ¿Estás seguro de que querés eliminar la transacción{" "}
                  <span className="font-semibold">
                    {deletingTx?.description}
                  </span>
                  ? Esta acción no se puede deshacer.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeletingTx(null)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createMonthDialogOpen}
        onOpenChange={(open) => {
          setCreateMonthDialogOpen(open);
          if (!open) setNextMonthPreview(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear nuevo mes</DialogTitle>
            <DialogDescription>
              {nextMonthPreview
                ? `Vas a crear ${MONTH_NAMES[nextMonthPreview.month - 1]} ${nextMonthPreview.year}. Revisá los saldos iniciales por cuenta antes de confirmar.`
                : "Calculando saldos iniciales..."}
            </DialogDescription>
          </DialogHeader>

          {!nextMonthPreview ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="max-h-96 overflow-auto pr-1">
              {nextMonthPreview.balances.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No hay cuentas activas para inicializar saldos.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {nextMonthPreview.balances.map((balance) => (
                    <Card
                      key={balance.account_id}
                      className="gap-0 overflow-hidden py-0"
                    >
                      <CardHeader className="bg-muted/35 px-4 py-3">
                        <CardTitle className="text-sm">
                          {balance.account_name}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {balance.account_currency}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-1 px-4 py-3">
                        <p
                          className={`text-base font-semibold ${amountTone(
                            balance.opening_amount,
                          )}`}
                        >
                          {balance.account_currency_symbol}{" "}
                          {formatAmount(balance.opening_amount)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Base:{" "}
                          {baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}
                          {formatAmount(
                            balance.current_opening_base_amount ??
                              balance.opening_base_amount,
                          )}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateMonthDialogOpen(false);
                setNextMonthPreview(null);
              }}
              disabled={createNextMonth.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmCreateMonth}
              disabled={!nextMonthPreview || createNextMonth.isPending}
            >
              {createNextMonth.isPending ? "Creando..." : "Confirmar y crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
    </TooltipProvider>
  );
}

const TransactionsToolbar = memo(function TransactionsToolbar({
  selectedMonthId,
  selectedMonth,
  sortedMonths,
  isCreatingMonth,
  onMonthChange,
  onCreateNextMonth,
  onCreateTransfer,
  onCreateTransaction,
}: {
  selectedMonthId: string | null;
  selectedMonth: Month | null;
  sortedMonths: Month[];
  isCreatingMonth: boolean;
  onMonthChange: (value: string) => void;
  onCreateNextMonth: () => void;
  onCreateTransfer: () => void;
  onCreateTransaction: () => void;
}) {
  const currentIdx = sortedMonths.findIndex((m) => m.id === selectedMonthId);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            if (currentIdx < sortedMonths.length - 1)
              onMonthChange(sortedMonths[currentIdx + 1].id);
          }}
          disabled={!selectedMonthId || currentIdx >= sortedMonths.length - 1}
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
            if (currentIdx > 0)
              onMonthChange(sortedMonths[currentIdx - 1].id);
          }}
          disabled={!selectedMonthId || currentIdx <= 0}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onCreateNextMonth} disabled={isCreatingMonth}>
          {isCreatingMonth ? "Calculando..." : "Nuevo mes"}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={onCreateTransfer}
          size="sm"
          variant="outline"
          disabled={!selectedMonthId}
        >
          <ArrowLeftRight className="mr-1 size-4" />
          Transferencia
        </Button>
        <Button onClick={onCreateTransaction} size="sm" disabled={!selectedMonthId}>
          <Plus className="mr-1 size-4" />
          Nueva transacción
        </Button>
      </div>
    </div>
  );
});

const TransactionsSummaryCards = memo(function TransactionsSummaryCards({
  monthSummary,
  baseCurrencySymbol,
}: {
  monthSummary: ReturnType<typeof useMonthSummary>["monthSummary"];
  baseCurrencySymbol: string;
}) {
  const cards = [
    { label: "Saldo apertura", value: monthSummary.openingBase, tone: amountTone(monthSummary.openingBase) },
    { label: "Ingresos", value: Math.abs(monthSummary.income), tone: "text-green-600" },
    { label: "Gastos Esenciales", value: Math.abs(monthSummary.essentialExpenses), tone: "text-red-600" },
    { label: "Gastos Discrecionales", value: Math.abs(monthSummary.discretionaryExpenses), tone: "text-orange-600" },
    { label: "Pago de Deudas", value: Math.abs(monthSummary.debtPayments), tone: "text-rose-600" },
    { label: "Ahorros", value: Math.abs(monthSummary.savings), tone: "text-cyan-600" },
    { label: "Inversiones", value: Math.abs(monthSummary.investments), tone: "text-indigo-600" },
    { label: "Saldo cierre", value: monthSummary.closingBase, tone: amountTone(monthSummary.closingBase) },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="gap-0 py-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardDescription>{card.label}</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-semibold ${card.tone}`}>
              {baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}
              {formatAmount(card.value)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
});

const TransactionsAccountBalances = memo(function TransactionsAccountBalances({
  selectedMonth,
  accountMonthlyBalances,
  investmentByAccount,
  currentInvestmentByAccount,
  baseCurrencySymbol,
}: {
  selectedMonth: Month | null;
  accountMonthlyBalances: ReturnType<typeof useMonthSummary>["accountMonthlyBalances"];
  investmentByAccount: Map<string, number>;
  currentInvestmentByAccount:
    | Record<string, { current: number; cost: number }>
    | undefined;
  baseCurrencySymbol: string;
}) {
  const [hideZero, setHideZero] = useState(false);

  if (!selectedMonth) return null;

  // "En cero" = the account currently holds nothing: its closing (final)
  // balance rounds to 0,00 and it has no investments. The opening balance is
  // irrelevant (an account that started with money and ended at 0 is empty).
  const roundsToZero = (n: number) => Math.round(n * 100) === 0;
  const isZeroAccount = (
    account: (typeof accountMonthlyBalances)[number],
  ) => {
    if (!roundsToZero(account.closing)) return false;
    const live = currentInvestmentByAccount?.[account.accountId];
    if (live && (!roundsToZero(live.current) || !roundsToZero(live.cost)))
      return false;
    if (!roundsToZero(investmentByAccount.get(account.accountId) ?? 0))
      return false;
    return true;
  };

  const visibleAccounts = hideZero
    ? accountMonthlyBalances.filter((account) => !isZeroAccount(account))
    : accountMonthlyBalances;

  return (
    <div className="rounded-md border p-3 sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold">
            Saldos por cuenta - {MONTH_NAMES[selectedMonth.month - 1]} {selectedMonth.year}
          </p>
          <p className="text-muted-foreground text-xs">
            Inicio y cierre del mes seleccionado.
          </p>
        </div>
        <label className="text-muted-foreground flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs">
          <Checkbox
            checked={hideZero}
            onCheckedChange={(checked) => setHideZero(checked === true)}
          />
          Ocultar cuentas en cero
        </label>
      </div>
      {accountMonthlyBalances.length > 0 ? (
        visibleAccounts.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {visibleAccounts.map((account) => {
            const live = currentInvestmentByAccount?.[account.accountId];
            const hasLive = live != null && live.cost > 0;
            const invTotal = investmentByAccount.get(account.accountId) ?? 0;
            const gain = hasLive ? live.current - live.cost : 0;
            const gainPct = hasLive ? (gain / live.cost) * 100 : 0;
            const up = gain >= 0;
            const gainTone = up ? "text-green-600" : "text-red-600";
            return (
              <div key={account.name} className="bg-muted/20 space-y-2 rounded-md border px-3 py-2.5">
                <p className="text-foreground truncate text-sm font-semibold">
                  {account.name} ({account.currencyCode})
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Inicio del mes</span>
                  <span className={`whitespace-nowrap text-sm font-semibold ${amountTone(account.opening)}`}>
                    {account.symbol} {formatAmount(account.opening)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Final del mes</span>
                  <span className={`whitespace-nowrap text-sm font-semibold ${amountTone(account.closing)}`}>
                    {account.symbol} {formatAmount(account.closing)}
                  </span>
                </div>
                {hasLive ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Invertido</span>
                      <span className="whitespace-nowrap text-sm font-semibold text-indigo-600">
                        {baseCurrencySymbol} {formatAmount(live.cost)}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground">Valor actual</span>
                      <span className="text-right">
                        <span className={`block whitespace-nowrap text-sm font-semibold ${gainTone}`}>
                          {baseCurrencySymbol} {formatAmount(live.current)}
                        </span>
                        <span className={`block text-xs font-medium ${gainTone}`}>
                          {up ? "▲" : "▼"} {formatAmount(Math.abs(gainPct))}%
                        </span>
                      </span>
                    </div>
                  </>
                ) : (
                  invTotal > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Inversiones</span>
                      <span className="whitespace-nowrap text-sm font-semibold text-indigo-600">
                        {account.symbol} {formatAmount(invTotal)}
                      </span>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Todas las cuentas están en cero.
          </p>
        )
      ) : (
        <p className="text-muted-foreground text-sm">
          No hay saldos iniciales cargados para este mes.
        </p>
      )}
    </div>
  );
});
