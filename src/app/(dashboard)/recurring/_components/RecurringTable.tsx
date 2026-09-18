"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  useRecurringTransactions,
  useDeleteRecurring,
} from "@/hooks/useRecurring";
import { formatAmount } from "@/lib/format";
import { RECURRENCE_LABELS, type RecurringWithRelations } from "@/types/recurring";
import { errorMessage } from "@/lib/action-result";
import { RecurringDialog } from "./RecurringDialog";

export function RecurringTable() {
  const { data: recurrings, isLoading, isError, error, refetch } =
    useRecurringTransactions();
  const deleteMutation = useDeleteRecurring();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringWithRelations | null>(
    null
  );
  const [deletingItem, setDeletingItem] =
    useState<RecurringWithRelations | null>(null);

  const handleCreate = () => {
    setEditingItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (item: RecurringWithRelations) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    try {
      await deleteMutation.mutateAsync(deletingItem.id);
      setDeletingItem(null);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // A failed refresh keeps what is on screen (QueryProvider says it failed).
  if (isError && error && !recurrings) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
        <p className="text-destructive font-medium">
          Error al cargar las transacciones recurrentes
        </p>
        <p className="text-muted-foreground mt-1 text-sm">{errorMessage(error)}</p>
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
      <div className="flex justify-end">
        <Button onClick={handleCreate} size="sm">
          <Plus className="mr-1 size-4" />
          Nueva recurrente
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descripción</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Frecuencia</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-24 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!recurrings || recurrings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-32 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center justify-center gap-3">
                    <p className="text-sm">
                      No hay transacciones recurrentes. Creá una para
                      automatizar tu registro.
                    </p>
                    <Button
                      onClick={handleCreate}
                      variant="outline"
                      size="sm"
                    >
                      <Plus className="mr-1 size-4" />
                      Crear recurrente
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              recurrings.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.description}
                    {item.day_of_month && (
                      <span className="text-muted-foreground text-xs ml-1">
                        (día {item.day_of_month})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.type === "income" ? "default" : "secondary"
                      }
                    >
                      {item.type === "income" ? "Ingreso" : "Gasto"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {RECURRENCE_LABELS[item.recurrence]}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.account_name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.category_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={`text-sm font-medium ${
                        item.type === "income"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {item.type === "income" ? "+" : "-"}
                      {item.currency_symbol} {formatAmount(item.amount)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={item.is_active ? "default" : "outline"}
                    >
                      {item.is_active ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar recurrente"
                        onClick={() => handleEdit(item)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar recurrente"
                        onClick={() => setDeletingItem(item)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <RecurringDialog
        recurring={editingItem}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <Dialog
        open={!!deletingItem}
        onOpenChange={(open) => !open && setDeletingItem(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar recurrente</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que querés eliminar{" "}
              <span className="font-semibold">{deletingItem?.description}</span>
              ? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeletingItem(null)}
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
