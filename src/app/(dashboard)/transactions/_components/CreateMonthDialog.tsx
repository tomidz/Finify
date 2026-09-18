"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { amountTone, formatAmount } from "@/lib/format";
import { monthLabel } from "@/lib/month-grid";
import { uiScale } from "@/lib/ui-scale";
import type { NextMonthPreview } from "@/types/months";

/** Confirms the next month with the opening balance each account carries into it. */
export function CreateMonthDialog({
  open,
  preview,
  baseCurrencySymbol,
  creating,
  onConfirm,
  onClose,
}: {
  open: boolean;
  preview: NextMonthPreview | null;
  baseCurrencySymbol: string;
  creating: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{!preview ? "Nuevo mes" : `Crear ${monthLabel(preview)}`}</DialogTitle>
          <DialogDescription>Revisá los saldos iniciales.</DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : preview.balances.length === 0 ? (
          <p className="text-muted-foreground text-xs">Sin cuentas activas.</p>
        ) : (
          <div className="grid max-h-96 gap-2 overflow-auto pr-1 sm:grid-cols-2">
            {preview.balances.map((balance) => (
              <div
                key={balance.account_id}
                className="flex flex-col gap-0.5 rounded-md border px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{balance.account_name}</span>
                  <span className="text-muted-foreground shrink-0 text-[11px]">
                    {balance.account_currency}
                  </span>
                </div>
                <p
                  className={`text-sm font-semibold tabular-nums ${amountTone(balance.opening_amount)}`}
                >
                  {balance.account_currency_symbol} {formatAmount(balance.opening_amount)}
                </p>
                <p className="text-muted-foreground text-[11px] tabular-nums">
                  Base: {baseCurrencySymbol ? `${baseCurrencySymbol} ` : ""}
                  {formatAmount(
                    balance.current_opening_base_amount ?? balance.opening_base_amount,
                  )}
                </p>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className={uiScale.button}
            onClick={onClose}
            disabled={creating}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className={uiScale.button}
            onClick={onConfirm}
            disabled={!preview || creating}
          >
            {!creating ? null : <Spinner className="size-3.5" />}
            Crear mes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
