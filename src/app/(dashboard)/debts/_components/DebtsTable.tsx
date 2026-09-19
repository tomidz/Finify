"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  History,
  Landmark,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { MonthSwitcher } from "@/components/month-switcher";
import { NumericCell } from "@/components/numeric-cell";
import { PageButton } from "@/components/page-button";
import { RowActions } from "@/components/row-actions";
import { StateCard } from "@/components/state-card";
import { TruncatedText } from "@/components/truncated-text";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/hooks/use-confirm";
import { useCurrencies } from "@/hooks/useAccounts";
import {
  useDebts,
  useDeleteNwItem,
  useLiabilitiesForMonth,
} from "@/hooks/useNetWorth";
import { errorMessage } from "@/lib/action-result";
import { currentYearMonth } from "@/lib/dates";
import { useShortcut } from "@/lib/keyboard";
import { adjacentMonth, calendarMonths, monthKey, monthLabel } from "@/lib/month-grid";
import type { NwItemWithRelations } from "@/types/net-worth";
import { DebtDialog } from "./DebtDialog";
import { DebtPaymentDialog } from "./DebtPaymentDialog";
import { DebtAdjustmentDialog } from "./DebtAdjustmentDialog";
import { DebtHistorySheet } from "./DebtHistorySheet";

export function DebtsTable() {
  const { data: debts, isLoading, isLoadingError, error, refetch } = useDebts();
  const deleteMutation = useDeleteNwItem();
  const confirm = useConfirm();
  const { data: currencies } = useCurrencies();

  // Month/year navigation over calendar months, up to the current one.
  const [current] = useState(currentYearMonth);
  const [selectedYear, setSelectedYear] = useState(current.year);
  const [selectedMonth, setSelectedMonth] = useState(current.month);
  const monthOptions = useMemo(
    () => calendarMonths({ year: current.year - 10, month: 1 }, current),
    [current],
  );
  const selectedKey = monthKey({ year: selectedYear, month: selectedMonth });

  const {
    data: liabilities,
    error: liabilitiesError,
    refetch: refetchLiabilities,
  } = useLiabilitiesForMonth(selectedYear, selectedMonth);

  // Map item_id → amount from liabilities summary
  const amountByItem = useMemo(() => {
    const map = new Map<string, number>();
    if (liabilities) {
      for (const item of liabilities.items) {
        map.set(item.item_id, item.amount);
      }
    }
    return map;
  }, [liabilities]);
  // Until the month's amounts load there is no amount, not 0: editing would
  // save the empty field as the debt's balance.
  const currentAmountOf = (debtId: string) =>
    !liabilities ? undefined : (amountByItem.get(debtId) ?? 0);

  const decimalsOf = (code: string) => currencies?.find((c) => c.code === code)?.decimals ?? 2;

  const selectMonth = (year: number, month: number) => {
    setSelectedYear(year);
    setSelectedMonth(month);
  };
  const stepMonth = (direction: -1 | 1) => {
    const target = adjacentMonth(monthOptions, selectedKey, direction);
    if (target) selectMonth(target.year, target.month);
  };
  useShortcut("ArrowLeft", () => stepMonth(-1));
  useShortcut("ArrowRight", () => stepMonth(1));

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<
    (NwItemWithRelations & { currentAmount?: number }) | null
  >(null);
  const [paymentDebt, setPaymentDebt] = useState<
    (NwItemWithRelations & { currentAmount?: number }) | null
  >(null);
  const [adjustmentDebt, setAdjustmentDebt] = useState<
    (NwItemWithRelations & { currentAmount?: number }) | null
  >(null);
  const [historyDebt, setHistoryDebt] = useState<NwItemWithRelations | null>(
    null
  );

  const handleCreate = () => {
    setEditingDebt(null);
    setDialogOpen(true);
  };
  useShortcut("n", handleCreate);

  const handleEdit = (debt: NwItemWithRelations) => {
    setEditingDebt({
      ...debt,
      currentAmount: currentAmountOf(debt.id),
    });
    setDialogOpen(true);
  };

  // Deleting the nw_item cascades to its monthly snapshots and its
  // debt_activities (0008, 0019); the expenses its payments created stay.
  const handleDelete = async (debt: NwItemWithRelations) => {
    const confirmed = await confirm({
      title: `¿Borrar "${debt.name}"?`,
      description:
        "Se borran sus saldos de todos los meses y su historial; los gastos de sus pagos quedan en Transacciones.",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(debt.id);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const handlePayment = (debt: NwItemWithRelations) => {
    setPaymentDebt({
      ...debt,
      currentAmount: currentAmountOf(debt.id),
    });
  };

  const handleAdjustment = (debt: NwItemWithRelations) => {
    setAdjustmentDebt({
      ...debt,
      currentAmount: currentAmountOf(debt.id),
    });
  };

  const content = (() => {
    if (isLoading) {
      return (
        <StateCard variant="loading">
          <Skeleton className="h-48 w-full rounded-md" />
        </StateCard>
      );
    }

    // A failed refresh keeps what is on screen (QueryProvider says it failed).
    if (isLoadingError) {
      return (
        <StateCard
          variant="error"
          title="No se pudieron cargar las deudas"
          error={error}
          onRetry={() => void refetch()}
        />
      );
    }

    if (debts.length === 0) {
      return (
        <StateCard
          variant="empty"
          icon={Landmark}
          title="Sin deudas"
          action={
            <PageButton variant="outline" icon={Plus} onClick={handleCreate}>
              Nueva deuda
            </PageButton>
          }
        />
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-md border">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="w-20">Moneda</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {debts.map((debt) => (
                <TableRow
                  key={debt.id}
                  className="cursor-pointer"
                  onClick={() => setHistoryDebt(debt)}
                >
                  <TableCell className="w-1/2 max-w-0 font-medium">
                    <button
                      type="button"
                      className="block max-w-full text-left outline-none hover:underline focus-visible:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        setHistoryDebt(debt);
                      }}
                    >
                      <TruncatedText>{debt.name}</TruncatedText>
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{debt.currency}</TableCell>
                  <TableCell>
                    <NumericCell
                      value={!liabilities ? null : (amountByItem.get(debt.id) ?? 0)}
                      currency={debt.currency_symbol}
                      decimals={decimalsOf(debt.currency)}
                    />
                  </TableCell>
                  <TableCell className="py-1 text-right">
                    <RowActions
                      actions={[
                        { label: "Registrar pago", icon: Banknote, onSelect: () => handlePayment(debt) },
                        { label: "Agregar interés/ajuste", icon: TrendingUp, onSelect: () => handleAdjustment(debt) },
                        { label: "Ver historial", icon: History, onSelect: () => setHistoryDebt(debt) },
                        {
                          label: "Editar deuda",
                          icon: Pencil,
                          disabled: !liabilities,
                          onSelect: () => handleEdit(debt),
                        },
                        {
                          label: "Borrar",
                          icon: Trash2,
                          destructive: true,
                          disabled: deleteMutation.isPending,
                          onSelect: () => void handleDelete(debt),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!liabilities && liabilitiesError && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-destructive">
              No se pudieron cargar los saldos: {errorMessage(liabilitiesError)}
            </span>
            <Button
              variant="link"
              size="xs"
              className="h-auto p-0 text-xs"
              onClick={() => void refetchLiabilities()}
            >
              Reintentar
            </Button>
          </div>
        )}
      </div>
    );
  })();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderTitleGroup>
          <PageHeaderTitle>Deudas</PageHeaderTitle>
          <PageHeaderDescription>
            Saldos al cierre de {monthLabel({ year: selectedYear, month: selectedMonth })}.
          </PageHeaderDescription>
        </PageHeaderTitleGroup>
        <PageHeaderActions>
          <MonthSwitcher
            months={monthOptions}
            value={selectedKey}
            onChange={(_, month) => selectMonth(month.year, month.month)}
          />
          <PageButton icon={Plus} kbd="N" onClick={handleCreate}>
            Nueva deuda
          </PageButton>
        </PageHeaderActions>
      </PageHeader>

      {content}

      {/* Dialogs */}
      <DebtDialog
        debt={editingDebt}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        year={selectedYear}
        month={selectedMonth}
      />

      <DebtPaymentDialog
        debt={paymentDebt}
        open={!!paymentDebt}
        onOpenChange={(open) => !open && setPaymentDebt(null)}
      />

      <DebtAdjustmentDialog
        debt={adjustmentDebt}
        open={!!adjustmentDebt}
        onOpenChange={(open) => !open && setAdjustmentDebt(null)}
      />

      <DebtHistorySheet
        debt={historyDebt}
        onClose={() => setHistoryDebt(null)}
      />
    </div>
  );
}
