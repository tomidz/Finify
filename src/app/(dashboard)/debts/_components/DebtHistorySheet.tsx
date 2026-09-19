"use client";

import { History, Undo2 } from "lucide-react";
import { DetailSheet } from "@/components/detail-sheet";
import { NumericCell } from "@/components/numeric-cell";
import { RowActions } from "@/components/row-actions";
import { StateCard } from "@/components/state-card";
import { TruncatedText } from "@/components/truncated-text";
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
import { useDebtActivities, useReverseDebtActivity } from "@/hooks/useNetWorth";
import {
  DEBT_ACTIVITY_TYPE_LABELS,
  type DebtActivity,
} from "@/types/net-worth";
import type { NwItemWithRelations } from "@/types/net-worth";

interface DebtHistorySheetProps {
  /** The debt shown; null closes the sheet. */
  debt: NwItemWithRelations | null;
  onClose: () => void;
}

function formatDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Payments, interest and adjustments of a debt, each one reversible. */
export function DebtHistorySheet({ debt, onClose }: DebtHistorySheetProps) {
  const { data: activities, error, refetch } = useDebtActivities(debt?.id ?? null);
  const { data: currencies } = useCurrencies();
  const reverse = useReverseDebtActivity();
  const confirm = useConfirm();

  const decimals = currencies?.find((c) => c.code === debt?.currency)?.decimals ?? 2;

  const handleReverse = async (activity: DebtActivity) => {
    const confirmed = await confirm({
      title: `¿Revertir ${DEBT_ACTIVITY_TYPE_LABELS[activity.activity_type].toLowerCase()}?`,
      description:
        activity.activity_type === "payment"
          ? "El saldo de la deuda vuelve a como estaba y se elimina el gasto del pago."
          : "El saldo de la deuda vuelve a como estaba.",
      confirmLabel: "Revertir",
      destructive: true,
    });
    if (!confirmed) return;
    reverse.mutate(activity.id);
  };

  const body = (() => {
    if (!activities) {
      return !error ? (
        <StateCard variant="loading" />
      ) : (
        <StateCard variant="error" error={error} onRetry={() => void refetch()} />
      );
    }
    if (activities.length === 0) {
      return <StateCard variant="empty" icon={History} title="Sin movimientos" />;
    }
    return (
      <div className="rounded-md border">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((activity) => {
              // A payment lowers the debt; interest and adjustments raise it.
              const isPayment = activity.activity_type === "payment";
              return (
                <TableRow key={activity.id}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatDate(activity.date)}
                  </TableCell>
                  <TableCell>{DEBT_ACTIVITY_TYPE_LABELS[activity.activity_type]}</TableCell>
                  <TableCell>
                    <NumericCell
                      value={isPayment ? -activity.amount : activity.amount}
                      currency={debt?.currency_symbol}
                      decimals={decimals}
                      showPlus
                      className={isPayment ? "text-success" : "text-destructive"}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground w-1/2 max-w-0">
                    <TruncatedText>{activity.description || "—"}</TruncatedText>
                  </TableCell>
                  <TableCell className="py-1 text-right">
                    <RowActions
                      actions={[
                        {
                          label: "Revertir",
                          icon: Undo2,
                          destructive: true,
                          disabled: reverse.isPending,
                          onSelect: () => void handleReverse(activity),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  })();

  return (
    <DetailSheet
      open={debt !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Historial de ${debt?.name ?? ""}`}
      description="Pagos, intereses y ajustes."
    >
      {body}
    </DetailSheet>
  );
}
