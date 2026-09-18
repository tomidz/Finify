"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebtActivities, useReverseDebtActivity } from "@/hooks/useNetWorth";
import { errorMessage } from "@/lib/action-result";
import { formatAmount } from "@/lib/format";
import {
  DEBT_ACTIVITY_TYPE_LABELS,
  type DebtActivity,
  type DebtActivityType,
} from "@/types/net-worth";
import type { NwItemWithRelations } from "@/types/net-worth";

interface DebtHistoryDialogProps {
  debt: NwItemWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACTIVITY_BADGE_VARIANT: Record<
  DebtActivityType,
  "default" | "secondary" | "destructive" | "outline"
> = {
  payment: "default",
  interest: "destructive",
  adjustment: "secondary",
};

function formatDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function DebtHistoryDialog({
  debt,
  open,
  onOpenChange,
}: DebtHistoryDialogProps) {
  const { data: activities, isLoading, error } = useDebtActivities(
    open ? debt?.id ?? null : null
  );
  const reverse = useReverseDebtActivity();
  const [reversing, setReversing] = useState<DebtActivity | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Historial de {debt?.name}</DialogTitle>
          <DialogDescription>
            Pagos, intereses y ajustes registrados.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !activities && error ? (
          <p className="text-destructive py-8 text-center text-sm">
            {errorMessage(error)}
          </p>
        ) : !activities || activities.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No hay movimientos registrados.
          </p>
        ) : (
          <div className="max-h-[400px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(activity.date)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          ACTIVITY_BADGE_VARIANT[activity.activity_type]
                        }
                      >
                        {DEBT_ACTIVITY_TYPE_LABELS[activity.activity_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium whitespace-nowrap">
                      {activity.activity_type === "payment" ? (
                        <span className="text-green-600">
                          -{debt?.currency_symbol}{" "}
                          {formatAmount(activity.amount)}
                        </span>
                      ) : (
                        <span className="text-red-600">
                          +{debt?.currency_symbol}{" "}
                          {formatAmount(activity.amount)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[150px] truncate text-sm">
                      {activity.description || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReversing(activity)}
                        disabled={reverse.isPending}
                      >
                        Revertir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>

      <Dialog
        open={reversing !== null}
        onOpenChange={(next) => !next && setReversing(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Revertir {reversing ? DEBT_ACTIVITY_TYPE_LABELS[reversing.activity_type].toLowerCase() : ""}
            </DialogTitle>
            <DialogDescription>
              {reversing?.activity_type === "payment"
                ? "El saldo de la deuda vuelve a como estaba y se elimina el gasto del pago."
                : "El saldo de la deuda vuelve a como estaba."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReversing(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={reverse.isPending}
              onClick={() => {
                if (!reversing) return;
                reverse.mutate(reversing.id, { onSettled: () => setReversing(null) });
              }}
            >
              Revertir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
