"use client";

import { useState } from "react";
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";
import { NumericCell } from "@/components/numeric-cell";
import { useCurrencyDecimals } from "@/hooks/useAccounts";
import { PageButton } from "@/components/page-button";
import { RowActions } from "@/components/row-actions";
import { StateCard } from "@/components/state-card";
import { TruncatedText } from "@/components/truncated-text";
import { useConfirm } from "@/hooks/use-confirm";
import {
  useRecurringTransactions,
  useDeleteRecurring,
} from "@/hooks/useRecurring";
import { useShortcut } from "@/lib/keyboard";
import { RECURRENCE_LABELS, type RecurringWithRelations } from "@/types/recurring";
import { PendingRecurringCard } from "./PendingRecurringCard";
import { RecurringDialog } from "./RecurringDialog";

export function RecurringTable() {
  const { data: recurrings, isLoading, isError, error, refetch } =
    useRecurringTransactions();
  const deleteMutation = useDeleteRecurring();
  const confirm = useConfirm();
  const decimalsOf = useCurrencyDecimals();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecurringWithRelations | null>(
    null
  );

  const handleCreate = () => {
    setEditingItem(null);
    setDialogOpen(true);
  };
  useShortcut("n", handleCreate);

  const handleEdit = (item: RecurringWithRelations) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleDelete = async (item: RecurringWithRelations) => {
    // transactions.recurring_id is ON DELETE SET NULL (0049): registered
    // occurrences stay, unlinked.
    const confirmed = await confirm({
      title: `¿Borrar "${item.description}"?`,
      description: "Las transacciones ya registradas se mantienen.",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(item.id);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const renderContent = () => {
    if (isLoading) return <StateCard variant="loading" className="min-h-64" />;
    // A failed refresh keeps what is on screen (QueryProvider says it failed).
    if (isError && error && !recurrings) {
      return <StateCard variant="error" error={error} onRetry={() => refetch()} className="min-h-64" />;
    }
    if (!recurrings || recurrings.length === 0) {
      return (
        <StateCard
          variant="empty"
          icon={Repeat}
          title="Sin recurrentes"
          description="Creá una para registrar lo que se repite con un clic."
          action={
            <PageButton variant="outline" icon={Plus} onClick={handleCreate}>
              Nueva recurrente
            </PageButton>
          }
          className="min-h-64"
        />
      );
    }
    return (
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
              <TableHead className="w-10">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recurrings.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  <div className="flex max-w-72 items-baseline gap-1">
                    <TruncatedText>{item.description}</TruncatedText>
                    {item.day_of_month && (
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">
                        (día {item.day_of_month})
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>{item.type === "income" ? "Ingreso" : "Gasto"}</TableCell>
                <TableCell>{RECURRENCE_LABELS[item.recurrence]}</TableCell>
                <TableCell>
                  <TruncatedText className="max-w-40">{item.account_name}</TruncatedText>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <TruncatedText className="max-w-40">{item.category_name ?? "—"}</TruncatedText>
                </TableCell>
                <TableCell>
                  {/* Stored positive; the type carries the sign. */}
                  <NumericCell
                    value={item.type === "income" ? item.amount : -item.amount}
                    currency={item.currency_symbol}
                    decimals={decimalsOf(item.currency)}
                    tone
                    className="font-medium"
                  />
                </TableCell>
                <TableCell>
                  {item.is_active ? (
                    "Activa"
                  ) : (
                    <span className="text-muted-foreground">Inactiva</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <RowActions
                    actions={[
                      { label: "Editar", icon: Pencil, onSelect: () => handleEdit(item) },
                      {
                        label: "Borrar",
                        icon: Trash2,
                        destructive: true,
                        onSelect: () => void handleDelete(item),
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <>
      <PageHeader>
        <PageHeaderTitleGroup>
          <PageHeaderTitle>Recurrentes</PageHeaderTitle>
          <PageHeaderDescription>Gastos e ingresos que se repiten.</PageHeaderDescription>
        </PageHeaderTitleGroup>
        <PageHeaderActions>
          <PageButton icon={Plus} kbd="N" onClick={handleCreate}>
            Nueva recurrente
          </PageButton>
        </PageHeaderActions>
      </PageHeader>

      <PendingRecurringCard />

      {renderContent()}

      <RecurringDialog
        recurring={editingItem}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
