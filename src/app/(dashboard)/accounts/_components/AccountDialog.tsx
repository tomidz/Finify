"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateAccount,
  useUpdateAccount,
  useCurrencies,
  useAccountInitialBalance,
} from "@/hooks/useAccounts";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { CreateAccountSchema, UpdateAccountSchema } from "@/lib/validations/account.schema";
import { accountBalancePayload } from "@/lib/account-balance-payload";
import { formatNumberInput, parseNumberInput } from "@/lib/utils";
import { fetchExchangeRate } from "@/lib/frankfurter";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
} from "@/types/accounts";
import type { Account } from "@/types/accounts";
import { Info, Loader2 } from "lucide-react";

interface AccountDialogProps {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AccountFormValues = {
  name: string;
  account_type: Account["account_type"];
  currency: string;
  notes: string;
  initial_amount: string;
  exchange_rate: string;
  base_amount: string;
};

function balanceFormValues(
  balance: { opening_amount: number; opening_base_amount: number } | null | undefined,
): Pick<AccountFormValues, "initial_amount" | "exchange_rate" | "base_amount"> {
  const openingAmount = balance?.opening_amount ?? 0;
  const openingBase = balance?.opening_base_amount ?? 0;
  const rate = openingAmount > 0 ? openingBase / openingAmount : 1;
  return {
    initial_amount:
      openingAmount > 0
        ? formatNumberInput(String(openingAmount).replace(".", ","))
        : "",
    exchange_rate: formatNumberInput(String(rate).replace(".", ",")),
    base_amount:
      openingBase > 0
        ? formatNumberInput(String(openingBase).replace(".", ","))
        : "",
  };
}

export function AccountDialog({
  account,
  open,
  onOpenChange,
}: AccountDialogProps) {
  const isEditing = !!account;

  const form = useForm<AccountFormValues>({
    defaultValues: {
      name: "",
      account_type: "bank",
      currency: "USD",
      notes: "",
      initial_amount: "",
      exchange_rate: "1",
      base_amount: "",
    },
  });

  const { data: currencies } = useCurrencies();
  const { data: baseCurrency } = useBaseCurrency();
  const { data: initialBalance, isPending: initialBalancePending } = useAccountInitialBalance(
    isEditing ? account?.id : undefined,
  );
  // Editing an account waits for its stored balance before saving.
  const waitingForBalance = isEditing && initialBalancePending;
  const createMutation = useCreateAccount();
  const updateMutation = useUpdateAccount();

  const isPending = createMutation.isPending || updateMutation.isPending;

  const [fetchingRate, setFetchingRate] = useState(false);
  const baseManuallyEdited = useRef(false);
  // Whether the user typed in a balance field since the dialog opened.
  const balanceEdited = useRef(false);

  const watchCurrency = useWatch({ control: form.control, name: "currency" });
  const watchAccountType = useWatch({
    control: form.control,
    name: "account_type",
  });
  const isCryptoWallet = watchAccountType === "crypto_wallet";
  const isCryptoExchange = watchAccountType === "crypto_exchange";
  const isCryptoType = isCryptoWallet || isCryptoExchange;

  const fiatCurrencies =
    currencies?.filter((c) => c.currency_type === "fiat") ?? [];
  const cryptoCurrencies =
    currencies?.filter((c) => c.currency_type === "crypto") ?? [];

  // Shared helper: fetch FX rate and update form fields
  const applyFxRate = useCallback(async (currency: string) => {
    if (!baseCurrency || currency === baseCurrency) {
      form.setValue("exchange_rate", "1");
      baseManuallyEdited.current = false;
      const amt = parseNumberInput(form.getValues("initial_amount"));
      if (!isNaN(amt) && amt > 0) {
        form.setValue(
          "base_amount",
          formatNumberInput(String(amt).replace(".", ",")),
        );
      }
      return;
    }

    setFetchingRate(true);
    const rate = await fetchExchangeRate(currency, baseCurrency);
    setFetchingRate(false);

    if (rate !== null) {
      form.setValue(
        "exchange_rate",
        formatNumberInput(String(rate).replace(".", ",")),
      );
      baseManuallyEdited.current = false;
      const amt = parseNumberInput(form.getValues("initial_amount"));
      if (!isNaN(amt) && amt > 0) {
        const base = Math.round(amt * rate * 100) / 100;
        form.setValue(
          "base_amount",
          formatNumberInput(String(base).replace(".", ",")),
        );
      }
    }
  }, [form, baseCurrency]);

  // Called when user manually changes currency in the Select
  const handleCurrencyChange = useCallback((newCurrency: string) => {
    form.setValue("currency", newCurrency);
    applyFxRate(newCurrency);
  }, [form, applyFxRate]);

  // Reset the form when the dialog opens for an account (or for a new one).
  useEffect(() => {
    if (!open) return;

    if (account) {
      form.reset({
        name: account.name,
        account_type: account.account_type,
        currency: account.currency,
        notes: account.notes ?? "",
        ...balanceFormValues(initialBalance),
      });
    } else {
      form.reset({
        name: "",
        account_type: "bank",
        currency: "USD",
        notes: "",
        initial_amount: "",
        exchange_rate: "1",
        base_amount: "",
      });
    }
    baseManuallyEdited.current = false;
    balanceEdited.current = false;
    // initialBalance is applied by the effect below, without resetting the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, open, form]);

  // The stored balance can arrive after the dialog opened: fill the balance
  // fields then, unless the user already typed in them.
  useEffect(() => {
    if (!open || !account || !initialBalance || balanceEdited.current) return;
    const values = balanceFormValues(initialBalance);
    form.setValue("initial_amount", values.initial_amount);
    form.setValue("exchange_rate", values.exchange_rate);
    form.setValue("base_amount", values.base_amount);
  }, [open, account, initialBalance, form]);

  // Auto-set currency when switching to crypto account types
  useEffect(() => {
    if (!baseCurrency || !open || isEditing) return;
    if (isCryptoWallet) {
      form.setValue("currency", baseCurrency);
    } else if (isCryptoExchange) {
      const currentCurrency = form.getValues("currency");
      const isFiat = fiatCurrencies.some((c) => c.code === currentCurrency);
      if (!isFiat) {
        form.setValue("currency", baseCurrency);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchAccountType, baseCurrency, open]);

  // Auto-fetch FX rate when dialog opens with a non-base currency
  useEffect(() => {
    if (!open || !baseCurrency) return;

    const currency = form.getValues("currency");
    if (!currency || currency === baseCurrency) return;

    // In edit mode, skip if we have a valid rate from DB
    if (isEditing) {
      const openingAmount = initialBalance?.opening_amount ?? 0;
      if (openingAmount > 0) return; // rate was calculated from stored data
    }

    applyFxRate(currency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, baseCurrency, isEditing, initialBalance]);

  const handleInitialAmountChange = useCallback((val: string) => {
    balanceEdited.current = true;
    const formatted = formatNumberInput(val);
    form.setValue("initial_amount", formatted);
    const amt = parseNumberInput(formatted);
    if (baseManuallyEdited.current) {
      const base = parseNumberInput(form.getValues("base_amount"));
      if (!isNaN(amt) && amt > 0 && !isNaN(base) && base > 0) {
        const newRate = Math.round((base / amt) * 100000000) / 100000000;
        form.setValue(
          "exchange_rate",
          formatNumberInput(String(newRate).replace(".", ",")),
        );
      }
    } else {
      const rate = parseNumberInput(form.getValues("exchange_rate"));
      if (!isNaN(amt) && amt > 0 && !isNaN(rate) && rate > 0) {
        const newBase = Math.round(amt * rate * 100) / 100;
        form.setValue(
          "base_amount",
          formatNumberInput(String(newBase).replace(".", ",")),
        );
      }
    }
  }, [form]);

  const handleRateChange = useCallback((val: string) => {
    balanceEdited.current = true;
    const formatted = formatNumberInput(val);
    form.setValue("exchange_rate", formatted);
    baseManuallyEdited.current = false;
    const amt = parseNumberInput(form.getValues("initial_amount"));
    const rate = parseNumberInput(formatted);
    if (!isNaN(amt) && amt > 0 && !isNaN(rate) && rate > 0) {
      const newBase = Math.round(amt * rate * 100) / 100;
      form.setValue(
        "base_amount",
        formatNumberInput(String(newBase).replace(".", ",")),
      );
    }
  }, [form]);

  const handleBaseAmountChange = useCallback((val: string) => {
    balanceEdited.current = true;
    baseManuallyEdited.current = true;
    const formatted = formatNumberInput(val);
    form.setValue("base_amount", formatted);
    const amt = parseNumberInput(form.getValues("initial_amount"));
    const base = parseNumberInput(formatted);
    if (!isNaN(amt) && amt > 0 && !isNaN(base)) {
      const newRate = Math.round((base / amt) * 100000000) / 100000000;
      form.setValue(
        "exchange_rate",
        formatNumberInput(String(newRate).replace(".", ",")),
      );
    }
  }, [form]);

  const onSubmit = async (values: AccountFormValues) => {
    form.clearErrors();

    const balanceFields = isEditing
      ? accountBalancePayload({
          mode: "edit",
          values,
          stored: initialBalance ?? null,
          edited: balanceEdited.current,
        })
      : accountBalancePayload({ mode: "create", values });

    try {
      if (isEditing) {
        const parsed = UpdateAccountSchema.safeParse({
          id: account.id,
          name: values.name,
          account_type: values.account_type,
          currency: values.currency,
          notes: values.notes,
          ...balanceFields,
        });
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            const field = issue.path[0];
            if (field && typeof field === "string") {
              form.setError(field as keyof AccountFormValues, {
                message: issue.message,
              });
            }
          }
          return;
        }
        await updateMutation.mutateAsync(parsed.data);
      } else {
        const parsed = CreateAccountSchema.safeParse({
          name: values.name,
          account_type: values.account_type,
          currency: values.currency,
          notes: values.notes,
          ...balanceFields,
        });
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            const field = issue.path[0];
            if (field && typeof field === "string") {
              form.setError(field as keyof AccountFormValues, {
                message: issue.message,
              });
            }
          }
          return;
        }
        await createMutation.mutateAsync(parsed.data);
      }
      onOpenChange(false);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const etfCurrencies = currencies?.filter((c) => c.currency_type === "etf") ?? [];

  const selectedCurrency = watchCurrency;
  const showConversion = baseCurrency && selectedCurrency && selectedCurrency !== baseCurrency;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar cuenta" : "Nueva cuenta"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modificá los datos de tu cuenta."
              : "Agregá una nueva cuenta para trackear tus finanzas."}
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
                      placeholder="Ej: ING, N26, Nexo..."
                      disabled={isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="account_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de cuenta</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {ACCOUNT_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isCryptoWallet && (
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {isCryptoExchange ? "Moneda de depósito" : "Moneda"}
                    </FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={handleCurrencyChange}
                        disabled={isPending || isEditing}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
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
                          {!isCryptoExchange && cryptoCurrencies.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>Crypto</SelectLabel>
                              {cryptoCurrencies.map((c) => (
                                <SelectItem key={c.code} value={c.code}>
                                  {c.symbol} {c.code} — {c.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          {!isCryptoExchange && etfCurrencies.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>ETFs</SelectLabel>
                              {etfCurrencies.map((c) => (
                                <SelectItem key={c.code} value={c.code}>
                                  {c.symbol} {c.code} — {c.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    {isEditing && (
                      <p className="text-muted-foreground text-xs">
                        La moneda no se cambia: los movimientos quedaron en esta moneda. Para otra
                        moneda, creá una cuenta nueva.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {isCryptoType && (
              <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>
                  {isCryptoWallet
                    ? "Las tenencias crypto (BTC, ETH, USDT, etc.) se agregan como inversiones dentro de la wallet."
                    : "Moneda para depósitos/retiros fiat. Las tenencias crypto se agregan como inversiones."}
                </span>
              </div>
            )}

            {/* Saldo inicial — oculto para crypto_wallet */}
            {!isCryptoWallet && (
            <div className={`grid gap-4 ${showConversion ? "grid-cols-3" : "grid-cols-1"}`}>
              <FormField
                control={form.control}
                name="initial_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {isCryptoExchange ? "Saldo fiat inicial" : "Saldo inicial"}
                      {selectedCurrency ? ` (${selectedCurrency})` : ""}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={isPending}
                        value={field.value}
                        onChange={(e) => handleInitialAmountChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {showConversion && (
                <>
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
                    name="base_amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Monto base{baseCurrency ? ` (${baseCurrency})` : ""}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0,00"
                            disabled={isPending}
                            value={field.value}
                            onChange={(e) => handleBaseAmountChange(e.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
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
                      placeholder="Información adicional..."
                      disabled={isPending}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isPending || waitingForBalance}>
                {isPending
                  ? "Guardando..."
                  : waitingForBalance
                    ? "Cargando saldo..."
                  : isEditing
                    ? "Guardar cambios"
                    : "Crear cuenta"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
