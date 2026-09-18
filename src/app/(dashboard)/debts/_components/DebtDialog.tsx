"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateDebt, useUpdateNwItem, useUpsertNwSnapshot } from "@/hooks/useNetWorth";
import { useCurrencies } from "@/hooks/useAccounts";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { parseMoney, toMoneyInput } from "@/lib/format";
import { fetchExchangeRate } from "@/lib/frankfurter";
import { uiScale } from "@/lib/ui-scale";
import type { NwItemWithRelations } from "@/types/net-worth";

interface DebtDialogProps {
  debt: (NwItemWithRelations & { currentAmount?: number }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
}

type DebtFormValues = {
  name: string;
  currency: string;
  amount: string;
};

export function DebtDialog({ debt, open, onOpenChange, year, month }: DebtDialogProps) {
  const isEditing = !!debt;

  const form = useForm<DebtFormValues>({
    defaultValues: { name: "", currency: "USD", amount: "" },
  });

  const { data: currencies } = useCurrencies();
  const { data: baseCurrency } = useBaseCurrency();
  const createDebt = useCreateDebt();
  const updateItem = useUpdateNwItem();
  const upsertSnapshot = useUpsertNwSnapshot(year);

  const isPending = createDebt.isPending || updateItem.isPending || upsertSnapshot.isPending;
  const selectedCurrency = useWatch({ control: form.control, name: "currency" });
  const amountCurrency = currencies?.find((c) => c.code === selectedCurrency);

  // Filled when the dialog opens, not on a refetch (that would wipe what the
  // user typed). The balance at its 4 stored decimals: a save that leaves it
  // alone writes nothing.
  const formKey = open ? (debt?.id ?? "new") : null;
  useEffect(() => {
    if (formKey === null) return;
    if (debt) {
      form.reset({
        name: debt.name,
        currency: debt.currency,
        amount: toMoneyInput(debt.currentAmount, 4),
      });
    } else {
      form.reset({ name: "", currency: "", amount: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey]);
  useEffect(() => {
    if (formKey === "new" && baseCurrency && !form.getValues("currency")) {
      form.setValue("currency", baseCurrency);
    }
  }, [formKey, baseCurrency, form]);

  const onSubmit = async (values: DebtFormValues) => {
    const amount = parseMoney(values.amount);
    if (amount == null) {
      form.setError("amount", { message: "Ingresá un monto" });
      return;
    }

    // Calculate amount_base for non-base currencies
    let amountBase: number | null = null;
    if (values.currency === baseCurrency) {
      amountBase = amount;
    } else if (baseCurrency && amount !== 0) {
      try {
        const rate = await fetchExchangeRate(values.currency, baseCurrency);
        if (rate) amountBase = amount * rate;
      } catch {
        // If FX fails, leave null — server will convert on read
      }
    }

    try {
      if (isEditing) {
        await updateItem.mutateAsync({
          id: debt.id,
          name: values.name,
          currency: values.currency,
        });
        // An unchanged balance keeps its snapshot (and the rate it was saved at).
        const unchanged =
          values.currency === debt.currency &&
          debt.currentAmount != null &&
          amount === Number(debt.currentAmount.toFixed(4));
        if (!unchanged) await upsertSnapshot.mutateAsync({
          nw_item_id: debt.id,
          year,
          month,
          amount,
          amount_base: amountBase,
        });
      } else {
        const result = await createDebt.mutateAsync({
          name: values.name,
          currency: values.currency,
          account_id: null,
          display_order: 0,
        });
        await upsertSnapshot.mutateAsync({
          nw_item_id: result.id,
          year,
          month,
          amount,
          amount_base: amountBase,
        });
      }
      onOpenChange(false);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const fiatCurrencies = currencies?.filter((c) => c.currency_type === "fiat") ?? [];
  const cryptoCurrencies = currencies?.filter((c) => c.currency_type === "crypto") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar deuda" : "Nueva deuda"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modificá los datos de tu deuda."
              : "Agregá una nueva deuda o pasivo."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Hipoteca, Préstamo personal..."
                      disabled={isPending}
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
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Moneda</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending}
                  >
                    <FormControl>
                      <SelectTrigger className={`w-full ${uiScale.trigger}`}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fiatCurrencies.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Fiat</SelectLabel>
                          {fiatCurrencies.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.symbol} {c.code} — {c.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {cryptoCurrencies.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Crypto</SelectLabel>
                          {cryptoCurrencies.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.symbol} {c.code} — {c.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto actual</FormLabel>
                  <FormControl>
                    <MoneyInput
                      {...field}
                      currency={amountCurrency?.symbol}
                      // Debt balances are stored with 4 decimals.
                      decimals={Math.min(amountCurrency?.decimals ?? 2, 4)}
                      disabled={isPending}
                      className={uiScale.field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" size="sm" className={uiScale.button} disabled={isPending}>
                {isPending
                  ? "Guardando..."
                  : isEditing
                    ? "Guardar cambios"
                    : "Crear deuda"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
