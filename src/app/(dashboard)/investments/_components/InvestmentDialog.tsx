"use client";

import { format } from "date-fns";
import { useCallback, useEffect, useMemo } from "react";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts, useCurrencies } from "@/hooks/useAccounts";
import { useAccountNetWorth } from "@/hooks/useNetWorth";
import {
  useCreateInvestment,
  useLookupInvestmentInstrument,
  useUpdateInvestment,
} from "@/hooks/useInvestments";
import { AccountCombobox } from "@/components/account-combobox";
import { Callout } from "@/components/callout";
import { MoneyInput } from "@/components/money-input";
import { Spinner } from "@/components/ui/spinner";
import { formatAmount, parseMoney, toMoneyInput } from "@/lib/format";
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  INVESTMENT_ACCOUNT_TYPES,
} from "@/types/investments";
import type { InvestmentWithAccount } from "@/types/investments";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";
import {
  QUANTITY_DECIMALS,
  STORED_AMOUNT_DECIMALS,
  UNIT_PRICE_DECIMALS,
} from "./investment-format";

interface InvestmentDialogProps {
  investment: InvestmentWithAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type InvestmentFormValues = {
  account_id: string;
  asset_name: string;
  ticker: string;
  isin: string;
  asset_type: string;
  quantity: string;
  price_per_unit: string;
  total_cost: string;
  fees: string;
  tax: string;
  currency: string;
  purchase_date: string;
  notes: string;
  skip_deduction: boolean;
};

export function InvestmentDialog({
  investment,
  open,
  onOpenChange,
}: InvestmentDialogProps) {
  const isEditing = !!investment;

  const form = useForm<InvestmentFormValues>({
    defaultValues: {
      account_id: "",
      asset_name: "",
      ticker: "",
      isin: "",
      asset_type: "stock",
      quantity: "",
      price_per_unit: "",
      total_cost: "",
      fees: "",
      tax: "",
      currency: "USD",
      purchase_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
      skip_deduction: false,
    },
  });

  const { data: accounts } = useAccounts();
  const { data: currencies } = useCurrencies();
  const { data: accountNetWorth } = useAccountNetWorth(new Date().getFullYear());
  const createMutation = useCreateInvestment();
  const updateMutation = useUpdateInvestment();
  const lookupInstrumentMutation = useLookupInvestmentInstrument();

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Filter accounts to only show brokers, exchanges, wallets
  const investmentAccounts = useMemo(
    () =>
      (accounts ?? []).filter(
        (a) =>
          a.is_active &&
          INVESTMENT_ACCOUNT_TYPES.has(a.account_type)
      ),
    [accounts]
  );

  // Cash balance per account (in the account's own currency) for the selector.
  const balanceByAccount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const account of accountNetWorth?.accounts ?? []) {
      map[account.id] = account.balance;
    }
    return map;
  }, [accountNetWorth]);

  const watchAccountId = useWatch({ control: form.control, name: "account_id" });
  const watchAssetType = useWatch({ control: form.control, name: "asset_type" });
  const watchSkipDeduction = useWatch({
    control: form.control,
    name: "skip_deduction",
  });

  const selectedAccount = useMemo(
    () => investmentAccounts.find((a) => a.id === watchAccountId),
    [investmentAccounts, watchAccountId],
  );

  const isBroker = selectedAccount?.account_type === "investment_broker";
  const isCryptoAccount =
    selectedAccount?.account_type === "crypto_exchange" ||
    selectedAccount?.account_type === "crypto_wallet";
  const watchCurrency = useWatch({ control: form.control, name: "currency" });
  // Mirrors the server gate: auto-deduct only when currencies match.
  const willAutoDeduct =
    !!selectedAccount &&
    (isBroker || isCryptoAccount) &&
    selectedAccount.currency === watchCurrency;
  const isCrypto = watchAssetType === "crypto";
  const currency = currencies?.find((c) => c.code === watchCurrency);
  // Stored with 4 decimals in every currency (a fee of US$ 0,3517 is kept).
  const moneyDecimals = STORED_AMOUNT_DECIMALS;
  const currencyLabel = currency?.symbol ?? watchCurrency;

  const watchTotalCost = useWatch({ control: form.control, name: "total_cost" });
  const watchFees = useWatch({ control: form.control, name: "fees" });
  const watchTax = useWatch({ control: form.control, name: "tax" });
  const totalToDeduct = useMemo(() => {
    const total = parseMoney(watchTotalCost) ?? 0;
    const fees = parseMoney(watchFees) ?? 0;
    const tax = parseMoney(watchTax) ?? 0;
    return total + fees + tax;
  }, [watchTotalCost, watchFees, watchTax]);

  // Filled when the dialog opens, not when the accounts refetch: that would
  // wipe what the user typed.
  const formKey = open ? (investment?.id ?? "new") : null;
  useEffect(() => {
    if (formKey === null) return;
    if (investment) {
      form.reset({
        account_id: investment.account_id,
        asset_name: investment.asset_name,
        ticker: investment.ticker ?? "",
        isin: investment.isin ?? "",
        asset_type: investment.asset_type,
        quantity: toMoneyInput(investment.quantity, QUANTITY_DECIMALS),
        price_per_unit: toMoneyInput(investment.price_per_unit, UNIT_PRICE_DECIMALS),
        total_cost: toMoneyInput(investment.total_cost, STORED_AMOUNT_DECIMALS),
        fees: "",
        tax: "",
        currency: investment.currency,
        purchase_date: investment.purchase_date,
        notes: investment.notes ?? "",
        skip_deduction: false,
      });
    } else {
      form.reset({
        account_id: "",
        asset_name: "",
        ticker: "",
        isin: "",
        asset_type: "stock",
        quantity: "",
        price_per_unit: "",
        total_cost: "",
        fees: "",
        tax: "",
        currency: "",
        purchase_date: format(new Date(), "yyyy-MM-dd"),
        notes: "",
        skip_deduction: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey]);
  // A new purchase's account defaults to the first investment account once
  // they load, unless already chosen (its currency follows below).
  useEffect(() => {
    const first = investmentAccounts[0];
    if (formKey === "new" && first && !form.getValues("account_id")) {
      form.setValue("account_id", first.id);
      form.setValue("currency", first.currency);
    }
  }, [formKey, investmentAccounts, form]);

  // Auto-set currency when account changes
  useEffect(() => {
    if (selectedAccount && !isEditing) {
      form.setValue("currency", selectedAccount.currency);
    }
  }, [selectedAccount, form, isEditing]);

  // The suggested total keeps the decimals the cost is stored with.
  const recalcTotal = useCallback((qtyStr: string, priceStr: string) => {
    const qty = parseMoney(qtyStr);
    const price = parseMoney(priceStr);
    if (qty && price && qty > 0 && price > 0) {
      form.setValue("total_cost", toMoneyInput(qty * price, STORED_AMOUNT_DECIMALS));
    }
  }, [form]);

  const handleLookupInstrument = useCallback(async () => {
    const ticker = form.getValues("ticker").trim();
    const isin = form.getValues("isin").trim();
    if (!ticker && !isin) return;

    try {
      const result = await lookupInstrumentMutation.mutateAsync({
        ticker: ticker || null,
        isin: isin || null,
      });

      if (result.asset_name && !form.getValues("asset_name").trim()) {
        form.setValue("asset_name", result.asset_name);
      }
      if (result.ticker && !ticker) {
        form.setValue("ticker", result.ticker);
      }
      if (result.currency && !isCrypto) {
        form.setValue("currency", result.currency);
      }
      if (result.price_per_unit != null && !form.getValues("price_per_unit").trim()) {
        const priceString = toMoneyInput(result.price_per_unit, UNIT_PRICE_DECIMALS);
        form.setValue("price_per_unit", priceString);
        recalcTotal(form.getValues("quantity"), priceString);
      }
    } catch {
      // toast handled in hook
    }
  }, [form, isCrypto, lookupInstrumentMutation, recalcTotal]);

  const onSubmit = async (values: InvestmentFormValues) => {
    const quantity = parseMoney(values.quantity);
    const pricePerUnit = parseMoney(values.price_per_unit);
    const totalCost = parseMoney(values.total_cost);
    const fees = parseMoney(values.fees) ?? 0;
    const tax = parseMoney(values.tax) ?? 0;

    if (quantity == null || quantity <= 0) {
      form.setError("quantity", { message: "Cantidad inválida" });
      return;
    }
    if (pricePerUnit == null || pricePerUnit <= 0) {
      form.setError("price_per_unit", { message: "Precio inválido" });
      return;
    }
    if (totalCost == null || totalCost <= 0) {
      form.setError("total_cost", { message: "Costo total inválido" });
      return;
    }

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: investment.id,
          account_id: values.account_id,
          asset_name: values.asset_name,
          ticker: values.ticker || null,
          isin: values.isin || null,
          asset_type: values.asset_type as InvestmentWithAccount["asset_type"],
          quantity,
          price_per_unit: pricePerUnit,
          total_cost: totalCost,
          currency: values.currency,
          purchase_date: values.purchase_date,
          notes: values.notes || null,
        });
      } else {
        await createMutation.mutateAsync({
          account_id: values.account_id,
          asset_name: values.asset_name,
          ticker: values.ticker || null,
          isin: values.isin || null,
          asset_type: values.asset_type as InvestmentWithAccount["asset_type"],
          quantity,
          price_per_unit: pricePerUnit,
          total_cost: totalCost,
          fees,
          tax,
          currency: values.currency,
          purchase_date: values.purchase_date,
          notes: values.notes || null,
          skip_deduction: values.skip_deduction,
        });
      }
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
            {isEditing ? "Editar inversión" : "Nueva inversión"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modificá los datos de tu inversión."
              : "Registrá una nueva compra de inversión."}
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
              name="account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta</FormLabel>
                  <FormControl>
                    <AccountCombobox
                      accounts={investmentAccounts}
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isPending}
                      balanceByAccount={balanceByAccount}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="asset_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del activo</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: Vanguard S&P 500"
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
                name="ticker"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ticker</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="Ej: VOO"
                          disabled={isPending}
                          {...field}
                        />
                      </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Completar datos del activo"
                          onClick={handleLookupInstrument}
                          disabled={isPending || lookupInstrumentMutation.isPending}
                        >
                          {lookupInstrumentMutation.isPending ? <Spinner /> : <Search className="size-4" />}
                        </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ISIN</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="Ej: IE00B3XXRP09"
                          disabled={isPending}
                          {...field}
                        />
                      </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Completar datos del activo"
                          onClick={handleLookupInstrument}
                          disabled={isPending || lookupInstrumentMutation.isPending}
                        >
                          {lookupInstrumentMutation.isPending ? <Spinner /> : <Search className="size-4" />}
                        </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="asset_type"
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
                        {ASSET_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {ASSET_TYPE_LABELS[type]}
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
                name="purchase_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de compra</FormLabel>
                    <FormControl>
                      <Input type="date" disabled={isPending} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
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
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value}
                        onValueChange={(next) => {
                          field.onChange(next);
                          recalcTotal(next, form.getValues("price_per_unit"));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price_per_unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio/unidad</FormLabel>
                    <FormControl>
                      <MoneyInput
                        currency={currencyLabel}
                        decimals={UNIT_PRICE_DECIMALS}
                        disabled={isPending}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value}
                        onValueChange={(next) => {
                          field.onChange(next);
                          recalcTotal(form.getValues("quantity"), next);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="total_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Costo total</FormLabel>
                    <FormControl>
                      <MoneyInput
                        currency={currencyLabel}
                        decimals={moneyDecimals}
                        disabled={isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {!isEditing && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="fees"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comisiones</FormLabel>
                      <FormControl>
                        <MoneyInput
                          currency={currencyLabel}
                          decimals={moneyDecimals}
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
                  name="tax"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Impuestos</FormLabel>
                      <FormControl>
                        <MoneyInput
                          currency={currencyLabel}
                          decimals={moneyDecimals}
                          disabled={isPending}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {willAutoDeduct && !isEditing && (
              <div className="space-y-3">
                <FormField
                  control={form.control}
                  name="skip_deduction"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormLabel className="text-sm font-normal cursor-pointer">
                        Inversión existente (no descontar del saldo)
                      </FormLabel>
                    </FormItem>
                  )}
                />
                {!watchSkipDeduction && (
                  <Callout>
                    Se descontará
                    {totalToDeduct > 0
                      ? ` ${currencyLabel} ${formatAmount(totalToDeduct, moneyDecimals)} (costo + comisiones + impuestos)`
                      : " el costo total (más comisiones e impuestos)"}{" "}
                    del saldo de la cuenta. Las comisiones e impuestos se suman
                    al costo del lote.
                  </Callout>
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
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {!isPending ? null : <Spinner />}
                {isEditing ? "Guardar cambios" : "Registrar compra"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
