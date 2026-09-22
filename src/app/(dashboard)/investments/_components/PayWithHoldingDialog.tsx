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
import { CategoryCombobox } from "@/components/category-combobox";
import { MoneyInput } from "@/components/money-input";
import { Spinner } from "@/components/ui/spinner";
import { usePayWithInvestment } from "@/hooks/useInvestments";
import { useBudgetCategories } from "@/hooks/useBudget";
import { formatAmount, parseMoney } from "@/lib/format";
import type { HoldingPosition } from "@/types/investments";
import {
  QUANTITY_DECIMALS,
  STORED_AMOUNT_DECIMALS,
  exceedsQuantity,
  formatExactQuantity,
} from "./investment-format";

type FormValues = {
  quantity: string;
  amount: string;
  category_id: string;
  description: string;
  date: string;
  notes: string;
};

interface PayWithHoldingDialogProps {
  holding: HoldingPosition | null;
  onOpenChange: (open: boolean) => void;
}

const emptyValues = (): FormValues => ({
  quantity: "",
  amount: "",
  category_id: "",
  description: "",
  date: format(new Date(), "yyyy-MM-dd"),
  notes: "",
});

/**
 * A purchase paid with a holding, like the card of an exchange that debits
 * stablecoins. The holding is sold for what the purchase cost and the expense
 * spends it, in one write: what the exchange kept in between is the fee.
 */
export function PayWithHoldingDialog({ holding, onOpenChange }: PayWithHoldingDialogProps) {
  const pay = usePayWithInvestment();
  const isPending = pay.isPending;
  const { data: categories } = useBudgetCategories();
  const form = useForm<FormValues>({ defaultValues: emptyValues() });

  useEffect(() => {
    if (holding) form.reset(emptyValues());
  }, [holding, form]);

  const quantity = parseMoney(useWatch({ control: form.control, name: "quantity" }));
  const amount = parseMoney(useWatch({ control: form.control, name: "amount" }));

  const expenseCategories = useMemo(
    () => (categories ?? []).filter((category) => category.category_type !== "income"),
    [categories],
  );

  const fee = quantity != null && amount != null ? quantity - amount : null;

  if (!holding) return null;

  const onSubmit = async (values: FormValues) => {
    let invalid = false;
    if (quantity == null || quantity <= 0) {
      form.setError("quantity", { message: "Cantidad inválida" });
      invalid = true;
    } else if (exceedsQuantity(quantity, holding.total_quantity)) {
      form.setError("quantity", {
        message: `Máximo disponible: ${formatExactQuantity(holding.total_quantity)}`,
      });
      invalid = true;
    }
    if (amount == null || amount <= 0) {
      form.setError("amount", { message: "Monto inválido" });
      invalid = true;
    } else if (quantity != null && amount > quantity) {
      form.setError("amount", { message: "El monto no puede superar lo que entregás" });
      invalid = true;
    }
    if (!values.category_id) {
      form.setError("category_id", { message: "Elegí una categoría" });
      invalid = true;
    }
    if (!values.description.trim()) {
      form.setError("description", { message: "Poné qué compraste" });
      invalid = true;
    }
    if (invalid) return;

    try {
      await pay.mutateAsync({
        account_id: holding.account_id,
        asset_name: holding.asset_name,
        ticker: holding.ticker || null,
        isin: holding.isin,
        asset_type: holding.asset_type,
        currency: holding.currency,
        quantity: quantity!,
        amount: amount!,
        category_id: values.category_id,
        description: values.description.trim(),
        date: values.date,
        notes: values.notes.trim() || null,
      });
      onOpenChange(false);
    } catch {
      // toast handled by hook
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pagar con {holding.ticker || holding.asset_name}</DialogTitle>
          <DialogDescription>
            {holding.account_name} · disponible {formatExactQuantity(holding.total_quantity)}.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entregás ({holding.ticker || holding.asset_name})</FormLabel>
                    <FormControl>
                      <MoneyInput
                        decimals={QUANTITY_DECIMALS}
                        placeholder="0"
                        disabled={isPending}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto de la compra</FormLabel>
                    <FormControl>
                      <MoneyInput
                        currency={holding.currency_symbol}
                        decimals={STORED_AMOUNT_DECIMALS}
                        disabled={isPending}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Qué compraste</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Bershka" disabled={isPending} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría</FormLabel>
                    <FormControl>
                      <CategoryCombobox
                        categories={expenseCategories}
                        value={field.value}
                        onValueChange={field.onChange}
                        grouped
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date"
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

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Input disabled={isPending} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {fee !== null && fee >= 0 && (
              <div className="flex flex-col gap-1 rounded-md border bg-muted/30 p-3 text-xs tabular-nums">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Comisión del exchange</span>
                  <span>
                    {holding.currency_symbol} {formatAmount(fee)}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Queda</span>
                  <span>{formatExactQuantity(holding.total_quantity - (quantity ?? 0))}</span>
                </div>
              </div>
            )}

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
                {isPending ? <Spinner /> : null}
                Registrar pago
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
