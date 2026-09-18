"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { useAccounts, useCurrencies } from "@/hooks/useAccounts";
import {
  useCreateTransfer,
  useUpdateTransaction,
  useUsageCounts,
} from "@/hooks/useTransactions";
import { AccountCombobox } from "@/components/account-combobox";
import { CreateTransferSchema } from "@/lib/validations/transaction.schema";
import { parseMoney, toMoneyInput } from "@/lib/format";
import { fetchExchangeRate } from "@/lib/frankfurter";
import type { TransactionWithRelations } from "@/types/transactions";
import type { AccountType } from "@/types/accounts";
import { format } from "date-fns";
import { MoneyInput } from "@/components/money-input";
import { Spinner } from "@/components/ui/spinner";
import { uiScale } from "@/lib/ui-scale";

interface TransferDialogProps {
  transfer: TransactionWithRelations | null;
  monthId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowedAccountTypes?: AccountType[];
  title?: string;
  description?: string;
}

type TransferFormValues = {
  date: string;
  source_account_id: string;
  destination_account_id: string;
  description: string;
  amount: string;
  exchange_rate: string;
  destination_amount: string;
  fee: string;
  notes: string;
};

export function TransferDialog({
  transfer,
  open,
  onOpenChange,
  allowedAccountTypes,
  title,
  description,
}: TransferDialogProps) {
  const isEditing = !!transfer;

  const form = useForm<TransferFormValues>({
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      source_account_id: "",
      destination_account_id: "",
      description: "",
      amount: "",
      exchange_rate: "1",
      destination_amount: "",
      fee: "",
      notes: "",
    },
  });

  const { data: accounts } = useAccounts();
  const { data: currencies } = useCurrencies();
  const createTransferMutation = useCreateTransfer();
  const updateMutation = useUpdateTransaction();

  const isPending =
    createTransferMutation.isPending || updateMutation.isPending;

  const { data: usageCounts } = useUsageCounts();
  const activeAccounts = useMemo(
    () =>
      (accounts ?? []).filter(
        (account) =>
          account.is_active &&
          (!allowedAccountTypes ||
            allowedAccountTypes.includes(account.account_type)),
      ),
    [accounts, allowedAccountTypes],
  );
  const sortedAccounts = useMemo(
    () =>
      [...activeAccounts].sort(
        (a, b) =>
          (usageCounts?.accountCounts[b.id] ?? 0) -
            (usageCounts?.accountCounts[a.id] ?? 0) ||
          a.name.localeCompare(b.name),
      ),
    [activeAccounts, usageCounts?.accountCounts],
  );

  const watchSourceId = useWatch({
    control: form.control,
    name: "source_account_id",
  });
  const watchDestId = useWatch({
    control: form.control,
    name: "destination_account_id",
  });
  const watchDate = useWatch({ control: form.control, name: "date" });
  const watchAmount = useWatch({ control: form.control, name: "amount" });

  const sourceAccount = activeAccounts.find((a) => a.id === watchSourceId);
  const destAccount = activeAccounts.find((a) => a.id === watchDestId);
  const destinationCurrency = destAccount?.currency ?? "";
  // Same currency: the destination receives exactly the amount, with no rate.
  const sameCurrency =
    !!sourceAccount && !!destAccount && sourceAccount.currency === destAccount.currency;
  // Converted amounts keep the destination currency's precision (crypto: 8).
  const destinationDecimals =
    currencies?.find((c) => c.code === destinationCurrency)?.decimals ?? 2;
  const sourceDecimals =
    currencies?.find((c) => c.code === sourceAccount?.currency)?.decimals ?? 2;
  const destinationDecimalsRef = useRef(destinationDecimals);
  destinationDecimalsRef.current = destinationDecimals;
  const toDestination = useCallback(
    (value: number) => Number(value.toFixed(destinationDecimalsRef.current)),
    [],
  );

  const destinationManuallyEdited = useRef(false);
  const amountRef = useRef(form.getValues("amount"));
  amountRef.current = watchAmount;

  const [fetchingRate, setFetchingRate] = useState(false);

  useEffect(() => {
    if (isEditing || !sourceAccount || !destAccount || !currencies) return;

    const sourceCurrency = sourceAccount.currency;
    const targetCurrency = destAccount.currency;
    if (sourceCurrency === targetCurrency) {
      form.setValue("exchange_rate", "1");
      const amt = parseMoney(amountRef.current);
      if (amt != null && amt > 0) {
        form.setValue(
          "destination_amount",
          toMoneyInput(amt, destinationDecimalsRef.current)
        );
      }
      return;
    }

    // Without a quote the rate is entered by hand: a rate left from another
    // pair of accounts would convert the amount at it.
    const clearRate = () => {
      form.setValue("exchange_rate", "");
      if (!destinationManuallyEdited.current) form.setValue("destination_amount", "");
    };

    const sourceCurrencyInfo = currencies.find((c) => c.code === sourceCurrency);
    const targetCurrencyInfo = currencies.find((c) => c.code === targetCurrency);
    if (
      sourceCurrencyInfo?.currency_type !== "fiat" ||
      targetCurrencyInfo?.currency_type !== "fiat"
    ) {
      clearRate();
      return;
    }

    let cancelled = false;
    setFetchingRate(true);

    fetchExchangeRate(sourceCurrency, targetCurrency, watchDate).then((rate) => {
      if (cancelled) return;
      setFetchingRate(false);
      if (rate === null) {
        clearRate();
        return;
      }
      form.setValue("exchange_rate", toMoneyInput(rate, 8));
      destinationManuallyEdited.current = false;
      const amt = parseMoney(amountRef.current);
      if (amt != null && amt > 0) {
        const base = toDestination(amt * rate);
        form.setValue(
          "destination_amount",
          toMoneyInput(base, destinationDecimalsRef.current)
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    isEditing,
    sourceAccount,
    destAccount,
    currencies,
    watchDate,
    watchSourceId,
    watchDestId,
    form,
    toDestination,
  ]);

  useEffect(() => {
    if (!isEditing && sourceAccount && destAccount) {
      const srcName = sourceAccount.name;
      const dstName = destAccount.name;
      if (srcName && dstName) {
        form.setValue("description", `${srcName} → ${dstName}`);
      } else if (srcName) {
        form.setValue("description", `${srcName} →`);
      } else {
        form.setValue("description", "");
      }
    }
  }, [isEditing, sourceAccount, destAccount, watchSourceId, watchDestId, form]);

  useEffect(() => {
    if (transfer) {
      const sourceLine =
        transfer.amounts.find((line) => line.amount < 0) ?? transfer.amounts[0];
      const destinationLine =
        transfer.amounts.find((line) => line.amount > 0) ?? transfer.amounts[1];

      const existingFee = Number(transfer.fee ?? 0);
      const sourceAbs = Math.abs(sourceLine?.amount ?? 0);
      const netAmount = Math.max(0, sourceAbs - existingFee);
      // Stored amounts load at full precision: a cosmetic edit keeps them.
      form.reset({
        date: transfer.date,
        source_account_id: sourceLine?.account_id ?? "",
        destination_account_id: destinationLine?.account_id ?? "",
        description: transfer.description,
        amount: toMoneyInput(netAmount, 8),
        exchange_rate: toMoneyInput(sourceLine?.exchange_rate ?? 1, 8),
        destination_amount: toMoneyInput(Math.abs(destinationLine?.amount ?? 0), 8),
        fee: existingFee > 0 ? toMoneyInput(existingFee, 8) : "",
        notes: transfer.notes ?? "",
      });
    } else {
      form.reset({
        date: format(new Date(), "yyyy-MM-dd"),
        source_account_id: activeAccounts[0]?.id ?? "",
        destination_account_id: "",
        description: "",
        amount: "",
        exchange_rate: "1",
        destination_amount: "",
        fee: "",
        notes: "",
      });
    }
    destinationManuallyEdited.current = false;
    // Intentionally keyed on activeAccounts.length (not the array ref) so the
    // form only resets when accounts load, not on every memo recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfer, open, activeAccounts.length, form]);

  // The fields hand over the sanitized text (MoneyInput).
  const handleAmountChange = useCallback((val: string) => {
    form.setValue("amount", val);
    const amt = parseMoney(val);
    if (destinationManuallyEdited.current) {
      const base = parseMoney(form.getValues("destination_amount"));
      if (amt != null && amt > 0 && base != null && base > 0) {
        const newRate = Math.round((base / amt) * 100000000) / 100000000;
        form.setValue("exchange_rate", toMoneyInput(newRate, 8));
      }
    } else {
      const rate = parseMoney(form.getValues("exchange_rate"));
      if (amt != null && amt > 0 && rate != null && rate > 0) {
        const newBase = toDestination(amt * rate);
        form.setValue(
          "destination_amount",
          toMoneyInput(newBase, destinationDecimalsRef.current)
        );
      }
    }
  }, [form, toDestination]);

  const handleRateChange = useCallback((val: string) => {
    form.setValue("exchange_rate", val);
    destinationManuallyEdited.current = false;
    const amt = parseMoney(form.getValues("amount"));
    const rate = parseMoney(val);
    if (amt != null && amt > 0 && rate != null && rate > 0) {
      const newBase = toDestination(amt * rate);
      form.setValue(
        "destination_amount",
        toMoneyInput(newBase, destinationDecimalsRef.current)
      );
    }
  }, [form, toDestination]);

  const handleDestinationAmountChange = useCallback((val: string) => {
    destinationManuallyEdited.current = true;
    form.setValue("destination_amount", val);
    const amt = parseMoney(form.getValues("amount"));
    const base = parseMoney(val);
    if (amt != null && amt > 0 && base != null) {
      const newRate = Math.round((base / amt) * 100000000) / 100000000;
      form.setValue("exchange_rate", toMoneyInput(newRate, 8));
    }
  }, [form]);

  const onSubmit = async (values: TransferFormValues) => {
    form.clearErrors();

    // Empty is missing, never 0.
    const amountNum = parseMoney(values.amount);
    const destinationNum = sameCurrency ? amountNum : parseMoney(values.destination_amount);
    if (amountNum == null || destinationNum == null) {
      if (amountNum == null) form.setError("amount", { message: "Ingresá el monto" });
      if (destinationNum == null) {
        form.setError("destination_amount", { message: "Ingresá el monto destino" });
      }
      return;
    }
    // The rate is the one between the two amounts, implied when left empty.
    const enteredRate = sameCurrency ? 1 : parseMoney(values.exchange_rate);
    const rateNum =
      enteredRate != null && enteredRate > 0
        ? enteredRate
        : amountNum > 0 && destinationNum > 0
          ? destinationNum / amountNum
          : null;
    // The fee is optional: empty is none.
    const feeNum = Math.max(0, parseMoney(values.fee) ?? 0);

    if (isEditing) {
      try {
        await updateMutation.mutateAsync({
          id: transfer.id,
          date: values.date,
          description: values.description,
          amount: amountNum,
          exchange_rate: rateNum ?? undefined,
          base_amount: destinationNum,
          source_account_id: values.source_account_id,
          destination_account_id: values.destination_account_id,
          fee: feeNum,
          category_id: null,
          notes: values.notes || null,
        });
        onOpenChange(false);
      } catch {
        // Error handled by mutation onError (toast)
      }
      return;
    }

    const formData = {
      date: values.date,
      source_account_id: values.source_account_id,
      destination_account_id: values.destination_account_id,
      description: values.description,
      amount: amountNum,
      // No rate: the schema turns NaN down, on the rate field.
      exchange_rate: rateNum ?? Number.NaN,
      base_amount: destinationNum,
      fee: feeNum,
      notes: values.notes,
    };

    const parsed = CreateTransferSchema.safeParse(formData);
    if (!parsed.success) {
      const fieldMap: Record<string, keyof TransferFormValues> = {
        base_amount: "destination_amount",
      };
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field && typeof field === "string") {
          const key = (fieldMap[field] ?? field) as keyof TransferFormValues;
          if (key in form.getValues()) {
            form.setError(key, { message: issue.message });
          }
        }
      }
      return;
    }

    try {
      await createTransferMutation.mutateAsync(parsed.data);
      onOpenChange(false);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {title ?? (isEditing ? "Editar transferencia" : "Nueva transferencia")}
          </DialogTitle>
          <DialogDescription>
            {description ??
              (isEditing
                ? "Modificá los datos de la transferencia."
                : "Transferí fondos entre tus cuentas.")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="source_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuenta origen</FormLabel>
                    <FormControl>
                      <AccountCombobox
                        accounts={sortedAccounts}
                        value={field.value}
                        onValueChange={(val) => {
                          field.onChange(val);
                          if (val === form.getValues("destination_account_id")) {
                            form.setValue("destination_account_id", "");
                          }
                        }}
                        disabled={isPending || isEditing}
                        placeholder="Seleccionar"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="destination_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuenta destino</FormLabel>
                    <FormControl>
                      <AccountCombobox
                        accounts={sortedAccounts.filter((a) => a.id !== watchSourceId)}
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isPending || isEditing}
                        placeholder="Seleccionar"
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
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Traspaso a broker, Recarga wallet..."
                      disabled={isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={`grid gap-4 ${sameCurrency ? "grid-cols-1" : "grid-cols-3"}`}>
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto</FormLabel>
                    <FormControl>
                      <MoneyInput
                        currency={sourceAccount?.currency}
                        decimals={sourceDecimals}
                        disabled={isPending}
                        value={field.value}
                        onValueChange={handleAmountChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!sameCurrency && (
              <>
              <FormField
                control={form.control}
                name="exchange_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      Tipo de cambio
                      {!fetchingRate ? null : <Spinner className="size-3" />}
                    </FormLabel>
                    <FormControl>
                      <MoneyInput
                        decimals={8}
                        placeholder="1"
                        disabled={isPending}
                        value={field.value}
                        onValueChange={handleRateChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="destination_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto destino</FormLabel>
                    <FormControl>
                      <MoneyInput
                        currency={destinationCurrency || undefined}
                        decimals={destinationDecimals}
                        disabled={isPending}
                        value={field.value}
                        onValueChange={handleDestinationAmountChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </>
              )}
            </div>

            <FormField
              control={form.control}
              name="fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comisión (opcional)</FormLabel>
                  <FormControl>
                    <MoneyInput
                      currency={sourceAccount?.currency}
                      decimals={sourceDecimals}
                      disabled={isPending}
                      value={field.value}
                      onValueChange={(next) => form.setValue("fee", next)}
                    />
                  </FormControl>
                  <p className="text-muted-foreground text-[11px]">
                    Se descuenta del origen además del monto.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Información adicional..."
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
                size="sm"
                className={uiScale.button}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" className={uiScale.button} disabled={isPending}>
                {!isPending ? null : <Spinner className="size-3.5" />}
                {isEditing ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
