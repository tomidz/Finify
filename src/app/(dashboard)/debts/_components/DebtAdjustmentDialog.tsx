"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { MoneyInput } from "@/components/money-input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrencies } from "@/hooks/useAccounts";
import { useRecordDebtAdjustment } from "@/hooks/useNetWorth";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { formatAmount, parseMoney } from "@/lib/format";
import { today } from "@/lib/dates";
import { fetchExchangeRate } from "@/lib/frankfurter";
import { uiScale } from "@/lib/ui-scale";
import type { NwItemWithRelations } from "@/types/net-worth";

interface DebtAdjustmentDialogProps {
  debt: (NwItemWithRelations & { currentAmount?: number }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AdjustmentFormValues = {
  activity_type: "interest" | "adjustment";
  date: string;
  amount: string;
  description: string;
};

export function DebtAdjustmentDialog({
  debt,
  open,
  onOpenChange,
}: DebtAdjustmentDialogProps) {
  const form = useForm<AdjustmentFormValues>({
    defaultValues: {
      activity_type: "interest",
      date: today(),
      amount: "",
      description: "",
    },
  });

  const { data: baseCurrency } = useBaseCurrency();
  const { data: currencies } = useCurrencies();
  const recordAdjustment = useRecordDebtAdjustment();
  // Interest and adjustments are in the debt's currency and only raise it.
  // Stored with 4 decimals.
  const debtDecimals = Math.min(currencies?.find((c) => c.code === debt?.currency)?.decimals ?? 2, 4);

  useEffect(() => {
    if (!open) return;
    form.reset({
      activity_type: "interest",
      date: today(),
      amount: "",
      description: "",
    });
  }, [open, form]);

  const onSubmit = async (values: AdjustmentFormValues) => {
    if (!debt) return;

    const amount = parseMoney(values.amount);
    if (amount == null || amount <= 0) {
      form.setError("amount", { message: "Ingresá un monto válido" });
      return;
    }

    let amountBase: number | null = null;
    if (debt.currency === baseCurrency) {
      amountBase = amount;
    } else if (baseCurrency && amount !== 0) {
      try {
        const rate = await fetchExchangeRate(debt.currency, baseCurrency);
        if (rate) amountBase = amount * rate;
      } catch {
        // leave null
      }
    }

    try {
      await recordAdjustment.mutateAsync({
        nw_item_id: debt.id,
        date: values.date,
        amount,
        amount_base: amountBase,
        activity_type: values.activity_type,
        description: values.description || undefined,
      });
      onOpenChange(false);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar ajuste</DialogTitle>
          <DialogDescription>
            Registrá intereses o un ajuste para{" "}
            <span className="font-semibold">{debt?.name}</span>.
            {debt?.currentAmount != null && (
              <>
                {" "}
                Saldo actual:{" "}
                <span className="font-semibold">
                  {debt.currency_symbol} {formatAmount(debt.currentAmount, debtDecimals)}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="activity_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={recordAdjustment.isPending}
                  >
                    <FormControl>
                      <SelectTrigger className={`w-full ${uiScale.trigger}`}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="interest">Intereses</SelectItem>
                      <SelectItem value="adjustment">Ajuste</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        disabled={recordAdjustment.isPending}
                        className={uiScale.field}
                        {...field}
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
                    <FormLabel>Monto</FormLabel>
                    <FormControl>
                      <MoneyInput
                        {...field}
                        currency={debt?.currency_symbol}
                        decimals={debtDecimals}
                        disabled={recordAdjustment.isPending}
                        className={uiScale.field}
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
                  <FormLabel>Descripción (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Intereses de abril"
                      disabled={recordAdjustment.isPending}
                      className={uiScale.field}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" size="sm" className={uiScale.button} disabled={recordAdjustment.isPending}>
                {recordAdjustment.isPending
                  ? "Registrando..."
                  : "Registrar ajuste"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
