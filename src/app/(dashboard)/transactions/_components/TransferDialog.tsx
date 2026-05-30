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
import { formatNumberInput, parseNumberInput } from "@/lib/utils";
import { fetchExchangeRate } from "@/lib/frankfurter";
import type { TransactionWithRelations } from "@/types/transactions";
import type { AccountType } from "@/types/accounts";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

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
      const amt = parseNumberInput(amountRef.current);
      if (!isNaN(amt) && amt > 0) {
        form.setValue(
          "destination_amount",
          formatNumberInput(String(amt).replace(".", ","))
        );
      }
      return;
    }

    const sourceCurrencyInfo = currencies.find((c) => c.code === sourceCurrency);
    const targetCurrencyInfo = currencies.find((c) => c.code === targetCurrency);
    if (
      sourceCurrencyInfo?.currency_type !== "fiat" ||
      targetCurrencyInfo?.currency_type !== "fiat"
    ) {
      return;
    }

    let cancelled = false;
    setFetchingRate(true);

    fetchExchangeRate(sourceCurrency, targetCurrency, watchDate).then((rate) => {
      if (cancelled) return;
      setFetchingRate(false);
      if (rate !== null) {
        const formattedRate = formatNumberInput(String(rate).replace(".", ","));
        form.setValue("exchange_rate", formattedRate);
        destinationManuallyEdited.current = false;
        const amt = parseNumberInput(amountRef.current);
        if (!isNaN(amt) && amt > 0) {
          const base = Math.round(amt * rate * 100) / 100;
          form.setValue(
            "destination_amount",
            formatNumberInput(String(base).replace(".", ","))
          );
        }
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
      form.reset({
        date: transfer.date,
        source_account_id: sourceLine?.account_id ?? "",
        destination_account_id: destinationLine?.account_id ?? "",
        description: transfer.description,
        amount: formatNumberInput(String(netAmount).replace(".", ",")),
        exchange_rate: formatNumberInput(
          String(sourceLine?.exchange_rate ?? 1).replace(".", ",")
        ),
        destination_amount: formatNumberInput(
          String(Math.abs(destinationLine?.amount ?? 0)).replace(".", ",")
        ),
        fee: existingFee > 0
          ? formatNumberInput(String(existingFee).replace(".", ","))
          : "",
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

  const handleAmountChange = useCallback((val: string) => {
    const formatted = formatNumberInput(val);
    form.setValue("amount", formatted);
    const amt = parseNumberInput(formatted);
    if (destinationManuallyEdited.current) {
      const base = parseNumberInput(form.getValues("destination_amount"));
      if (!isNaN(amt) && amt > 0 && !isNaN(base) && base > 0) {
        const newRate = Math.round((base / amt) * 100000000) / 100000000;
        form.setValue(
          "exchange_rate",
          formatNumberInput(String(newRate).replace(".", ","))
        );
      }
    } else {
      const rate = parseNumberInput(form.getValues("exchange_rate"));
      if (!isNaN(amt) && amt > 0 && !isNaN(rate) && rate > 0) {
        const newBase = Math.round(amt * rate * 100) / 100;
        form.setValue(
          "destination_amount",
          formatNumberInput(String(newBase).replace(".", ","))
        );
      }
    }
  }, [form]);

  const handleRateChange = useCallback((val: string) => {
    const formatted = formatNumberInput(val);
    form.setValue("exchange_rate", formatted);
    destinationManuallyEdited.current = false;
    const amt = parseNumberInput(form.getValues("amount"));
    const rate = parseNumberInput(formatted);
    if (!isNaN(amt) && amt > 0 && !isNaN(rate) && rate > 0) {
      const newBase = Math.round(amt * rate * 100) / 100;
      form.setValue(
        "destination_amount",
        formatNumberInput(String(newBase).replace(".", ","))
      );
    }
  }, [form]);

  const handleDestinationAmountChange = useCallback((val: string) => {
    destinationManuallyEdited.current = true;
    const formatted = formatNumberInput(val);
    form.setValue("destination_amount", formatted);
    const amt = parseNumberInput(form.getValues("amount"));
    const base = parseNumberInput(formatted);
    if (!isNaN(amt) && amt > 0 && !isNaN(base)) {
      const newRate = Math.round((base / amt) * 100000000) / 100000000;
      form.setValue(
        "exchange_rate",
        formatNumberInput(String(newRate).replace(".", ","))
      );
    }
  }, [form]);

  const onSubmit = async (values: TransferFormValues) => {
    form.clearErrors();

    const amountNum = parseNumberInput(values.amount);
    const rateNum = parseNumberInput(values.exchange_rate);
    const destinationNum = parseNumberInput(values.destination_amount);
    const feeRaw = parseNumberInput(values.fee);
    const feeNum = isNaN(feeRaw) ? 0 : Math.max(0, feeRaw);

    if (isEditing) {
      try {
        await updateMutation.mutateAsync({
          id: transfer.id,
          date: values.date,
          description: values.description,
          amount: isNaN(amountNum) ? 0 : amountNum,
          exchange_rate: isNaN(rateNum) ? 1 : rateNum,
          base_amount: isNaN(destinationNum) ? 0 : destinationNum,
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
      amount: isNaN(amountNum) ? 0 : amountNum,
      exchange_rate: isNaN(rateNum) ? 1 : rateNum,
      base_amount: isNaN(destinationNum) ? 0 : destinationNum,
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
            className="space-y-4"
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

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Monto{sourceAccount ? ` (${sourceAccount.currency})` : ""}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={isPending}
                        value={field.value}
                        onChange={(e) => handleAmountChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="exchange_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Tipo de cambio
                      {fetchingRate && (
                        <Loader2 className="ml-1 inline size-3 animate-spin" />
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="1"
                        disabled={isPending}
                        value={field.value}
                        onChange={(e) => handleRateChange(e.target.value)}
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
                    <FormLabel>
                      Monto destino
                      {destinationCurrency ? ` (${destinationCurrency})` : ""}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={isPending}
                        value={field.value}
                        onChange={(e) =>
                          handleDestinationAmountChange(e.target.value)
                        }
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-xs">
                      Monto en la moneda de la cuenta destino.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Comisión (opcional)
                    {sourceAccount ? ` (${sourceAccount.currency})` : ""}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      disabled={isPending}
                      value={field.value}
                      onChange={(e) =>
                        form.setValue("fee", formatNumberInput(e.target.value))
                      }
                    />
                  </FormControl>
                  <p className="text-muted-foreground text-xs">
                    Costo adicional cobrado al origen (red, banco). Se descuenta del origen además del monto.
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
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "Guardando..."
                  : isEditing
                    ? "Guardar cambios"
                    : "Crear transferencia"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
