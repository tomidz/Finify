"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Banknote,
  TrendingUp,
  History,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDebts,
  useDeleteNwItem,
  useLiabilitiesForMonth,
} from "@/hooks/useNetWorth";
import { formatAmount, MONTH_NAMES } from "@/lib/format";
import type { NwItemWithRelations } from "@/types/net-worth";
import { DebtDialog } from "./DebtDialog";
import { DebtPaymentDialog } from "./DebtPaymentDialog";
import { DebtAdjustmentDialog } from "./DebtAdjustmentDialog";
import { DebtHistoryDialog } from "./DebtHistoryDialog";

export function DebtsTable() {
  const { data: debts, isLoading, isError, error, refetch } = useDebts();
  const deleteMutation = useDeleteNwItem();

  // Month/year navigation
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const { data: liabilities } = useLiabilitiesForMonth(
    selectedYear,
    selectedMonth
  );

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

  // Navigation helpers
  const goToPrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const isCurrentMonth =
    selectedYear === now.getFullYear() &&
    selectedMonth === now.getMonth() + 1;

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<
    (NwItemWithRelations & { currentAmount?: number }) | null
  >(null);
  const [deletingDebt, setDeletingDebt] = useState<NwItemWithRelations | null>(
    null
  );
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

  const handleEdit = (debt: NwItemWithRelations) => {
    setEditingDebt({
      ...debt,
      currentAmount: amountByItem.get(debt.id) ?? 0,
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingDebt) return;
    try {
      await deleteMutation.mutateAsync(deletingDebt.id);
      setDeletingDebt(null);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const handlePayment = (debt: NwItemWithRelations) => {
    setPaymentDebt({
      ...debt,
      currentAmount: amountByItem.get(debt.id) ?? 0,
    });
  };

  const handleAdjustment = (debt: NwItemWithRelations) => {
    setAdjustmentDebt({
      ...debt,
      currentAmount: amountByItem.get(debt.id) ?? 0,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError && error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
        <p className="text-destructive font-medium">
          Error al cargar las deudas
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
    <>
      {/* Header: month selector + new debt button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-medium">
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={goToNextMonth}
            disabled={isCurrentMonth}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="mr-1 size-4" />
          Nueva deuda
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="w-32 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!debts || debts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground h-32 text-center"
                >
                  <div className="flex flex-col items-center justify-center gap-3">
                    <p className="text-sm">
                      No hay deudas registradas. Agregá una deuda para empezar.
                    </p>
                    <Button onClick={handleCreate} variant="outline" size="sm">
                      <Plus className="mr-1 size-4" />
                      Crear deuda
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              debts.map((debt) => (
                <TableRow key={debt.id}>
                  <TableCell className="font-medium">{debt.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{debt.currency}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm font-medium">
                      {debt.currency_symbol}{" "}
                      {formatAmount(amountByItem.get(debt.id) ?? 0)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handlePayment(debt)}>
                            <Banknote className="mr-2 size-4" />
                            Registrar pago
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleAdjustment(debt)}
                          >
                            <TrendingUp className="mr-2 size-4" />
                            Agregar interés/ajuste
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setHistoryDebt(debt)}
                          >
                            <History className="mr-2 size-4" />
                            Ver historial
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(debt)}>
                            <Pencil className="mr-2 size-4" />
                            Editar deuda
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeletingDebt(debt)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 size-4" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-muted-foreground text-xs">
        Estás viendo y editando el saldo de deuda al cierre de{" "}
        {MONTH_NAMES[selectedMonth - 1]} {selectedYear}.
      </p>

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

      <DebtHistoryDialog
        debt={historyDebt}
        open={!!historyDebt}
        onOpenChange={(open) => !open && setHistoryDebt(null)}
      />

      <Dialog
        open={!!deletingDebt}
        onOpenChange={(open) => !open && setDeletingDebt(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar deuda</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que querés eliminar la deuda{" "}
              <span className="font-semibold">{deletingDebt?.name}</span>?
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeletingDebt(null)}
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
    </>
  );
}
