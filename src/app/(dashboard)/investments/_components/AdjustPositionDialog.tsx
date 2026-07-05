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
import { useAdjustInvestmentPosition } from "@/hooks/useInvestments";
import { formatAmount } from "@/lib/format";
import { formatNumberInput, parseNumberInput } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import type { HoldingPosition } from "@/types/investments";

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
    const qty = parseNumberInput(watchedQty);
    if (!qty || qty <= 0) return null;
    const delta = watchedDirection === "increase" ? qty : -qty;
    const newQuantity = holding.total_quantity + delta;
    if (newQuantity < 0) return null;
    return { newQuantity };
  }, [holding, watchedDirection, watchedQty]);

  const onSubmit = async (values: FormValues) => {
    if (!holding) return;
    const quantity = parseNumberInput(values.quantity);
    const costBasis = parseNumberInput(values.cost_basis) ?? 0;

    if (!quantity || quantity <= 0) {
      form.setError("quantity", { message: "Cantidad inválida" });
      return;
    }
    if (
      values.direction === "decrease" &&
      quantity > holding.total_quantity
    ) {
      form.setError("quantity", {
        message: `Máximo disponible: ${formatAmount(holding.total_quantity)}`,
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
            Posición actual: {formatAmount(holding.total_quantity)} unidades en{" "}
            {holding.account_name} • Costo prom: {sym}{" "}
            {formatAmount(holding.avg_cost_per_unit)}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <div className="grid grid-cols-2 gap-4">
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
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        disabled={isPending}
                        value={field.value}
                        onChange={(e) =>
                          form.setValue(
                            "quantity",
                            formatNumberInput(e.target.value, 7),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {watchedDirection === "increase" && (
                <FormField
                  control={form.control}
                  name="cost_basis"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Costo base (opcional)</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          disabled={isPending}
                          value={field.value}
                          onChange={(e) =>
                            form.setValue(
                              "cost_basis",
                              formatNumberInput(e.target.value, 4),
                            )
                          }
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

            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                El ajuste no mueve cash: solo corrige la cantidad de la
                posición (intereses en especie, comisiones, reconciliación con
                el exchange).
              </span>
            </div>

            {preview && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cantidad actual</span>
                  <span>{formatAmount(holding.total_quantity)}</span>
                </div>
                <div className="flex justify-between font-medium border-t pt-1 mt-1">
                  <span>Cantidad luego del ajuste</span>
                  <span>{formatAmount(preview.newQuantity)}</span>
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
                {isPending ? "Ajustando..." : "Ajustar posición"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
