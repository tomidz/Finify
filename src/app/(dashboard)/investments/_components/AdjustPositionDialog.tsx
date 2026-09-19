"use client";

import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Callout } from "@/components/callout";
import { MoneyInput } from "@/components/money-input";
import { Spinner } from "@/components/ui/spinner";
import { useAdjustInvestmentPosition } from "@/hooks/useInvestments";
import { parseMoney } from "@/lib/format";
import type { HoldingPosition } from "@/types/investments";
import {
  QUANTITY_DECIMALS,
  exceedsQuantity,
  formatExactQuantity,
  formatUnitPrice,
  STORED_AMOUNT_DECIMALS,
} from "./investment-format";

type FormValues = {
  direction: "increase" | "decrease";
  quantity: string;
  cost_basis: string;
  adjustment_date: string;
  notes: string;
};

interface AdjustPositionDialogProps {
  holding: HoldingPosition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdjustPositionDialog({
  holding,
  open,
  onOpenChange,
}: AdjustPositionDialogProps) {
  const adjustMutation = useAdjustInvestmentPosition();
  const isPending = adjustMutation.isPending;
  // Stored with 4 decimals in every currency (a fee of US$ 0,3517 is kept).
  const moneyDecimals = STORED_AMOUNT_DECIMALS;

  const form = useForm<FormValues>({
    defaultValues: {
      direction: "increase",
      quantity: "",
      cost_basis: "",
      adjustment_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    },
  });

  useEffect(() => {
    if (!open || !holding) return;
    form.reset({
      direction: "increase",
      quantity: "",
      cost_basis: "",
      adjustment_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    });
  }, [holding, open, form]);

  const watchedDirection = useWatch({ control: form.control, name: "direction" });
  const watchedQty = useWatch({ control: form.control, name: "quantity" });

  const preview = useMemo(() => {
    if (!holding) return null;
    const qty = parseMoney(watchedQty);
    if (!qty || qty <= 0) return null;
    if (watchedDirection === "decrease" && exceedsQuantity(qty, holding.total_quantity)) return null;
    const delta = watchedDirection === "increase" ? qty : -qty;
    // Reducing it all can leave the float drift of the sum below 0.
    return { newQuantity: Math.max(0, holding.total_quantity + delta) };
  }, [holding, watchedDirection, watchedQty]);

  const onSubmit = async (values: FormValues) => {
    if (!holding) return;
    const quantity = parseMoney(values.quantity);
    const costBasis = parseMoney(values.cost_basis) ?? 0;

    if (quantity == null || quantity <= 0) {
      form.setError("quantity", { message: "Cantidad inválida" });
      return;
    }
    if (
      values.direction === "decrease" &&
      exceedsQuantity(quantity, holding.total_quantity)
    ) {
      form.setError("quantity", {
        message: `Máximo disponible: ${formatExactQuantity(holding.total_quantity)}`,
      });
      return;
    }
    if (costBasis < 0) {
      form.setError("cost_basis", { message: "Costo inválido" });
      return;
    }

    try {
      await adjustMutation.mutateAsync({
        account_id: holding.account_id,
        asset_name: holding.asset_name,
        ticker: holding.ticker || null,
        isin: holding.isin || null,
        asset_type: holding.asset_type,
        currency: holding.currency,
        direction: values.direction,
        quantity,
        cost_basis: values.direction === "increase" ? costBasis : 0,
        adjustment_date: values.adjustment_date,
        notes: values.notes || null,
      });
      onOpenChange(false);
    } catch {
      // toast handled by hook
    }
  };

  if (!holding) return null;

  const sym = holding.currency_symbol;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustar {holding.asset_name}</DialogTitle>
          <DialogDescription>
            {formatExactQuantity(holding.total_quantity)} en {holding.account_name} · Costo
            prom. {sym} {formatUnitPrice(holding.avg_cost_per_unit)}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="direction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de ajuste</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="increase">Aumentar cantidad</SelectItem>
                        <SelectItem value="decrease">Reducir cantidad</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad</FormLabel>
                    <FormControl>
                      <MoneyInput
                        decimals={QUANTITY_DECIMALS}
                        placeholder="0"
                        disabled={isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {watchedDirection === "increase" && (
                <FormField
                  control={form.control}
                  name="cost_basis"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Costo base (opcional)</FormLabel>
                      <FormControl>
                        <MoneyInput
                          currency={sym}
                          decimals={moneyDecimals}
                          disabled={isPending}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="adjustment_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl>
                      <Input type="date" disabled={isPending} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Callout>
              No mueve efectivo: solo corrige la cantidad (intereses en especie,
              comisiones, conciliación con el exchange).
            </Callout>

            {preview && (
              <div className="flex flex-col gap-1 rounded-md border bg-muted/30 p-3 text-xs tabular-nums">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cantidad actual</span>
                  <span>{formatExactQuantity(holding.total_quantity)}</span>
                </div>
                <div className="mt-1 flex justify-between border-t pt-1 font-medium">
                  <span>Luego del ajuste</span>
                  <span>{formatExactQuantity(preview.newQuantity)}</span>
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Motivo del ajuste..."
                      disabled={isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {!isPending ? null : <Spinner />}
                Ajustar posición
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
