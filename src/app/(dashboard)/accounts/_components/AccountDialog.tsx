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
import { parseMoney, toMoneyInput } from "@/lib/format";
import { fetchExchangeRate } from "@/lib/frankfurter";
import { Callout } from "@/components/callout";
import { MoneyInput } from "@/components/money-input";
import { Spinner } from "@/components/ui/spinner";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
} from "@/types/accounts";
import type { Account } from "@/types/accounts";

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

// Stored and computed amounts are written back at the scale the database
// keeps (numeric(18, 8)), so prefilling never rounds a stored balance.
const STORED_DECIMALS = 8;
const RATE_DECIMALS = 8;

function balanceFormValues(
  balance: { opening_amount: number; opening_base_amount: number } | null | undefined,
): Pick<AccountFormValues, "initial_amount" | "exchange_rate" | "base_amount"> {
  const openingAmount = balance?.opening_amount ?? 0;
  const openingBase = balance?.opening_base_amount ?? 0;
  const rate = openingAmount > 0 ? openingBase / openingAmount : 1;
  return {
    initial_amount: openingAmount > 0 ? toMoneyInput(openingAmount, STORED_DECIMALS) : "",
    exchange_rate: toMoneyInput(rate, RATE_DECIMALS),
    base_amount: openingBase > 0 ? toMoneyInput(openingBase, STORED_DECIMALS) : "",
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
      // Filled by the rate lookup; "1" here would read as a 1:1 conversion.
      exchange_rate: "",
      base_amount: "",
    },
  });

  const { data: currencies } = useCurrencies();
  const { data: baseCurrency } = useBaseCurrency();
  const {
    data: initialBalance,
    isPending: initialBalancePending,
    error: initialBalanceError,
  } = useAccountInitialBalance(isEditing ? account?.id : undefined);
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
      const amt = parseMoney(form.getValues("initial_amount"));
      if (amt != null && amt > 0) {
        form.setValue("base_amount", toMoneyInput(amt, STORED_DECIMALS));
      }
      return;
    }

    setFetchingRate(true);
    const rate = await fetchExchangeRate(currency, baseCurrency);
    setFetchingRate(false);

    if (rate === null) {
      // Never 1:1 in silence: the user types the rate or the base amount.
      form.setValue("exchange_rate", "");
      form.setError("exchange_rate", { message: "No se pudo obtener el tipo de cambio: ingresalo." });
      return;
    }
    form.clearErrors("exchange_rate");
    form.setValue("exchange_rate", toMoneyInput(rate, RATE_DECIMALS));
    baseManuallyEdited.current = false;
    const amt = parseMoney(form.getValues("initial_amount"));
    if (amt != null && amt > 0) {
      const base = Math.round(amt * rate * 100) / 100;
      form.setValue("base_amount", toMoneyInput(base, STORED_DECIMALS));
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
        exchange_rate: "",
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

  // Crypto accounts hold fiat cash (deposits, withdrawals): switching to one
  // with a crypto currency selected falls back to the base currency, visibly.
  useEffect(() => {
    if (!baseCurrency || !open || isEditing || !isCryptoType) return;
    const currentCurrency = form.getValues("currency");
    const isFiat = fiatCurrencies.some((c) => c.code === currentCurrency);
    if (!isFiat) {
      form.setValue("currency", baseCurrency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchAccountType, baseCurrency, open]);

  // Auto-fetch FX rate when dialog opens
  useEffect(() => {
    if (!open || !baseCurrency) return;

    // The base currency itself gets its 1:1 rate here too (applyFxRate).
    const currency = form.getValues("currency");
    if (!currency) return;

    // In edit mode, skip if we have a valid rate from DB
    if (isEditing) {
      const openingAmount = initialBalance?.opening_amount ?? 0;
      if (openingAmount > 0) return; // rate was calculated from stored data
    }

    applyFxRate(currency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, baseCurrency, isEditing, initialBalance]);

  // Each handler gets the field's text as MoneyInput already cleaned it.
  const handleInitialAmountChange = useCallback((next: string) => {
    balanceEdited.current = true;
    form.setValue("initial_amount", next);
    const amt = parseMoney(next);
    if (baseManuallyEdited.current) {
      const base = parseMoney(form.getValues("base_amount"));
      if (amt != null && amt > 0 && base != null && base > 0) {
        const newRate = Math.round((base / amt) * 100000000) / 100000000;
        form.setValue("exchange_rate", toMoneyInput(newRate, RATE_DECIMALS));
      }
    } else {
      const rate = parseMoney(form.getValues("exchange_rate"));
      if (amt != null && amt > 0 && rate != null && rate > 0) {
        const newBase = Math.round(amt * rate * 100) / 100;
        form.setValue("base_amount", toMoneyInput(newBase, STORED_DECIMALS));
      }
    }
  }, [form]);

  const handleRateChange = useCallback((next: string) => {
    balanceEdited.current = true;
    form.setValue("exchange_rate", next);
    baseManuallyEdited.current = false;
    const amt = parseMoney(form.getValues("initial_amount"));
    const rate = parseMoney(next);
    if (amt != null && amt > 0 && rate != null && rate > 0) {
      const newBase = Math.round(amt * rate * 100) / 100;
      form.setValue("base_amount", toMoneyInput(newBase, STORED_DECIMALS));
    }
  }, [form]);

  const handleBaseAmountChange = useCallback((next: string) => {
    balanceEdited.current = true;
    baseManuallyEdited.current = true;
    form.setValue("base_amount", next);
    const amt = parseMoney(form.getValues("initial_amount"));
    const base = parseMoney(next);
    if (amt != null && amt > 0 && base != null) {
      const newRate = Math.round((base / amt) * 100000000) / 100000000;
      form.setValue("exchange_rate", toMoneyInput(newRate, RATE_DECIMALS));
    }
  }, [form]);

  const onSubmit = async (values: AccountFormValues) => {
    form.clearErrors();

    // An emptied field sends nothing and keeps the stored balance: removing
    // it takes an explicit 0.
    if (
      isEditing &&
      balanceEdited.current &&
      parseMoney(values.initial_amount) == null &&
      (initialBalance?.opening_amount ?? 0) !== 0
    ) {
      form.setError("initial_amount", { message: "Ingresá 0 para quitar el saldo inicial." });
      return;
    }

    const balanceFields = isEditing
      ? accountBalancePayload({
          mode: "edit",
          values,
          stored: initialBalance ?? null,
          edited: balanceEdited.current,
        })
      : accountBalancePayload({ mode: "create", values });

    // A converted balance needs a rate or a base amount; an empty rate is
    // never read as 0 or 1.
    if (
      !!baseCurrency &&
      values.currency !== baseCurrency &&
      (balanceFields.initial_amount ?? 0) > 0 &&
      balanceFields.exchange_rate === undefined &&
      balanceFields.base_amount === undefined
    ) {
      form.setError("exchange_rate", { message: "Ingresá el tipo de cambio" });
      return;
    }

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
  const decimalsOf = (code: string | undefined) =>
    currencies?.find((c) => c.code === code)?.decimals ?? 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Datos y saldo inicial de la cuenta." : "Banco, broker, wallet, tarjeta o efectivo."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: ING, N26, Nexo"
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
                  <FormLabel>Tipo</FormLabel>
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
                      {ACCOUNT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {ACCOUNT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isCryptoType ? "Moneda de depósito" : "Moneda"}
                  </FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={handleCurrencyChange}
                    disabled={isPending || isEditing}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
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
                      {!isCryptoType && cryptoCurrencies.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Crypto</SelectLabel>
                          {cryptoCurrencies.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.symbol} {c.code} — {c.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {!isCryptoType && etfCurrencies.length > 0 && (
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
                  {isEditing && (
                    <p className="text-muted-foreground text-xs">
                      No se cambia: los movimientos están en esta moneda. Para otra, creá una cuenta nueva.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {isCryptoType && (
              <Callout>
                {isCryptoWallet
                  ? "Las tenencias crypto (BTC, ETH, USDT…) se agregan como inversiones dentro de la wallet."
                  : "Moneda de los depósitos y retiros fiat. Las tenencias crypto se agregan como inversiones."}
              </Callout>
            )}

            {/* The fields below start empty: say so instead of passing them off as the stored balance. */}
            {!isCryptoWallet && isEditing && !initialBalance && initialBalanceError && (
              <Callout variant="warning" title="No se pudo cargar el saldo inicial">
                Si no lo tocás, se mantiene el guardado.
              </Callout>
            )}

            {/* Saldo inicial — oculto para crypto_wallet */}
            {!isCryptoWallet && (
            <div className={`grid gap-3 ${showConversion ? "sm:grid-cols-3" : ""}`}>
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
                      <MoneyInput
                        ref={field.ref}
                        name={field.name}
                        onBlur={field.onBlur}
                        value={field.value}
                        onValueChange={handleInitialAmountChange}
                        decimals={decimalsOf(selectedCurrency)}
                        disabled={isPending}
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
                          {fetchingRate && <Spinner className="ml-1 inline size-3 align-[-2px]" />}
                        </FormLabel>
                        <FormControl>
                          <MoneyInput
                            ref={field.ref}
                            name={field.name}
                            onBlur={field.onBlur}
                            value={field.value}
                            onValueChange={handleRateChange}
                            decimals={RATE_DECIMALS}
                            placeholder="1"
                            disabled={isPending}
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
                          <MoneyInput
                            ref={field.ref}
                            name={field.name}
                            onBlur={field.onBlur}
                            value={field.value}
                            onValueChange={handleBaseAmountChange}
                            decimals={decimalsOf(baseCurrency)}
                            disabled={isPending}
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
              <Button type="submit" size="sm" disabled={isPending || waitingForBalance}>
                {isPending || waitingForBalance ? <Spinner className="size-3.5" /> : null}
                {isPending
                  ? "Guardando…"
                  : waitingForBalance
                    ? "Cargando saldo…"
                  : isEditing
                    ? "Guardar"
                    : "Crear cuenta"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
