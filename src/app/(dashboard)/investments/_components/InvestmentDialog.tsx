"use client";

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
import { useAccounts } from "@/hooks/useAccounts";
import {
  useCreateInvestment,
  useLookupInvestmentInstrument,
  useUpdateInvestment,
} from "@/hooks/useInvestments";
import { AccountCombobox } from "@/components/account-combobox";
import { formatNumberInput, numberToInputString, parseNumberInput } from "@/lib/utils";
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
} from "@/types/investments";
import type { InvestmentWithAccount } from "@/types/investments";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Search } from "lucide-react";

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
      currency: "USD",
      purchase_date: new Date().toISOString().slice(0, 10),
      notes: "",
      skip_deduction: false,
    },
  });

  const { data: accounts } = useAccounts();
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
          ["investment_broker", "crypto_exchange", "crypto_wallet"].includes(
            a.account_type
          )
      ),
    [accounts]
  );

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
  const willAutoDeduct =
    !!selectedAccount &&
    (isBroker ||
      (isCryptoAccount && selectedAccount.currency === watchCurrency));
  const isCrypto = watchAssetType === "crypto";
  const maxDec = 7;

  useEffect(() => {
    if (!open) return;
    if (investment) {
      form.reset({
        account_id: investment.account_id,
        asset_name: investment.asset_name,
        ticker: investment.ticker ?? "",
        isin: investment.isin ?? "",
        asset_type: investment.asset_type,
        quantity: numberToInputString(investment.quantity),
        price_per_unit: numberToInputString(investment.price_per_unit),
        total_cost: numberToInputString(investment.total_cost),
        currency: investment.currency,
        purchase_date: investment.purchase_date,
        notes: investment.notes ?? "",
        skip_deduction: false,
      });
    } else {
      form.reset({
        account_id: investmentAccounts[0]?.id ?? "",
        asset_name: "",
        ticker: "",
        isin: "",
        asset_type: "stock",
        quantity: "",
        price_per_unit: "",
        total_cost: "",
        currency: investmentAccounts[0]?.currency ?? "USD",
        purchase_date: new Date().toISOString().slice(0, 10),
        notes: "",
        skip_deduction: false,
      });
    }
  }, [investment, open, form, investmentAccounts]);

  // Auto-set currency when account changes
  useEffect(() => {
    if (selectedAccount && !isEditing) {
      form.setValue("currency", selectedAccount.currency);
    }
  }, [selectedAccount, form, isEditing]);

  const recalcTotal = useCallback((qtyStr: string, priceStr: string) => {
    const qty = parseNumberInput(qtyStr);
    const price = parseNumberInput(priceStr);
    if (qty && price && qty > 0 && price > 0) {
      const decimals = 7;
      const factor = Math.pow(10, decimals);
      const total = Math.round(qty * price * factor) / factor;
      form.setValue("total_cost", numberToInputString(total));
    }
  }, [form]);

  const handleQuantityChange = useCallback((val: string, decimals: number) => {
    const formatted = formatNumberInput(val, decimals);
    form.setValue("quantity", formatted);
    recalcTotal(formatted, form.getValues("price_per_unit"));
  }, [form, recalcTotal]);

  const handlePriceChange = useCallback((val: string, decimals: number) => {
    const formatted = formatNumberInput(val, decimals);
    form.setValue("price_per_unit", formatted);
    recalcTotal(form.getValues("quantity"), formatted);
  }, [form, recalcTotal]);

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
        const priceString = numberToInputString(result.price_per_unit);
        form.setValue("price_per_unit", priceString);
        recalcTotal(form.getValues("quantity"), priceString);
      }
    } catch {
      // toast handled in hook
    }
  }, [form, isCrypto, lookupInstrumentMutation, recalcTotal]);

  const onSubmit = async (values: InvestmentFormValues) => {
    const quantity = parseNumberInput(values.quantity);
    const pricePerUnit = parseNumberInput(values.price_per_unit);
    const totalCost = parseNumberInput(values.total_cost);

    if (!quantity || isNaN(quantity) || quantity <= 0) {
      form.setError("quantity", { message: "Cantidad inválida" });
      return;
    }
    if (!pricePerUnit || isNaN(pricePerUnit) || pricePerUnit <= 0) {
      form.setError("price_per_unit", { message: "Precio inválido" });
      return;
    }
    if (!totalCost || isNaN(totalCost) || totalCost <= 0) {
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
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
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
                    <FormControl>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Ej: VOO"
                          disabled={isPending}
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={handleLookupInstrument}
                          disabled={isPending || lookupInstrumentMutation.isPending}
                        >
                          <Search className="size-4" />
                        </Button>
                      </div>
                    </FormControl>
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
                    <FormControl>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Ej: IE00B3XXRP09"
                          disabled={isPending}
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={handleLookupInstrument}
                          disabled={isPending || lookupInstrumentMutation.isPending}
                        >
                          <Search className="size-4" />
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="asset_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
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
                          {ASSET_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {ASSET_TYPE_LABELS[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
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

            <div className="grid grid-cols-3 gap-4">
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
                        onChange={(e) => handleQuantityChange(e.target.value, maxDec)}
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
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={isPending}
                        value={field.value}
                        onChange={(e) => handlePriceChange(e.target.value, maxDec)}
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
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={isPending}
                        value={field.value}
                        onChange={(e) =>
                          form.setValue(
                            "total_cost",
                            formatNumberInput(e.target.value, maxDec)
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Se descontará el costo total del saldo de la cuenta
                      automáticamente.
                    </span>
                  </div>
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
                {isPending
                  ? "Guardando..."
                  : isEditing
                    ? "Guardar cambios"
                    : "Registrar compra"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
