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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Callout } from "@/components/callout";
import { MoneyInput } from "@/components/money-input";
import { Spinner } from "@/components/ui/spinner";
import { useSellInvestment } from "@/hooks/useInvestments";
import { useAccounts } from "@/hooks/useAccounts";
import { formatAmount, amountTone, parseMoney, toMoneyInput } from "@/lib/format";
import { INVESTMENT_ACCOUNT_TYPES, type HoldingPosition } from "@/types/investments";
import {
  QUANTITY_DECIMALS,
  UNIT_PRICE_DECIMALS,
  exceedsQuantity,
  formatExactQuantity,
  formatUnitPrice,
  STORED_AMOUNT_DECIMALS,
} from "./investment-format";

type FormValues = {
  quantity_sold: string;
  price_per_unit: string;
  fees: string;
  tax: string;
  sale_date: string;
  notes: string;
  skip_credit: boolean;
};

interface SellInvestmentDialogProps {
  holding: HoldingPosition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SellInvestmentDialog({
  holding,
  open,
  onOpenChange,
}: SellInvestmentDialogProps) {
  const sellMutation = useSellInvestment();
  const { data: accounts } = useAccounts();
  const isPending = sellMutation.isPending;

  const form = useForm<FormValues>({
    defaultValues: {
      quantity_sold: "",
      price_per_unit: "",
      fees: "",
      tax: "",
      sale_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
      skip_credit: false,
    },
  });

  const account = useMemo(
    () => accounts?.find((a) => a.id === holding?.account_id),
    [accounts, holding?.account_id],
  );

  // Mirrors the server gate: the net is credited only in an investment
  // account in the holding's currency.
  const willAutoCredit =
    !!account &&
    INVESTMENT_ACCOUNT_TYPES.has(account.account_type) &&
    account.currency === holding?.currency;
  // Stored with 4 decimals in every currency (a fee of US$ 0,3517 is kept).
  const moneyDecimals = STORED_AMOUNT_DECIMALS;

  useEffect(() => {
    if (!open || !holding) return;
    form.reset({
      quantity_sold: "",
      price_per_unit: holding.current_price
        ? toMoneyInput(holding.current_price, UNIT_PRICE_DECIMALS)
        : "",
      fees: "",
      tax: "",
      sale_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
      skip_credit: false,
    });
  }, [holding, open, form]);

  const watchedQty = useWatch({ control: form.control, name: "quantity_sold" });
  const watchedPrice = useWatch({ control: form.control, name: "price_per_unit" });
  const watchedFees = useWatch({ control: form.control, name: "fees" });
  const watchedTax = useWatch({ control: form.control, name: "tax" });
  const watchedSkipCredit = useWatch({
    control: form.control,
    name: "skip_credit",
  });

  const preview = useMemo(() => {
    if (!holding) return null;
    const qty = parseMoney(watchedQty);
    const price = parseMoney(watchedPrice);
    const fees = parseMoney(watchedFees) ?? 0;
    const tax = parseMoney(watchedTax) ?? 0;
    if (!qty || !price || qty <= 0 || price <= 0) return null;

    const grossProceeds = qty * price;
    const costBasis = qty * holding.avg_cost_per_unit;
    const realizedPnl = grossProceeds - fees - tax - costBasis;
    const netProceeds = grossProceeds - fees - tax;

    return { grossProceeds, costBasis, realizedPnl, netProceeds };
  }, [holding, watchedQty, watchedPrice, watchedFees, watchedTax]);

  const onSubmit = async (values: FormValues) => {
    if (!holding) return;
    const quantity = parseMoney(values.quantity_sold);
    const price = parseMoney(values.price_per_unit);
    const fees = parseMoney(values.fees) ?? 0;
    const tax = parseMoney(values.tax) ?? 0;

    if (quantity == null || quantity <= 0) {
      form.setError("quantity_sold", { message: "Cantidad inválida" });
      return;
    }
    if (exceedsQuantity(quantity, holding.total_quantity)) {
      form.setError("quantity_sold", {
        message: `Máximo disponible: ${formatExactQuantity(holding.total_quantity)}`,
      });
      return;
    }
    if (price == null || price <= 0) {
      form.setError("price_per_unit", { message: "Precio inválido" });
      return;
    }

    try {
      await sellMutation.mutateAsync({
        account_id: holding.account_id,
        asset_name: holding.asset_name,
        ticker: holding.ticker || null,
        isin: holding.isin || null,
        asset_type: holding.asset_type,
        currency: holding.currency,
        quantity_sold: quantity,
        price_per_unit: price,
        fees,
        tax,
        sale_date: values.sale_date,
        notes: values.notes || null,
        skip_credit: values.skip_credit,
      });
      onOpenChange(false);
    } catch {
      // toast handled by hook
    }
  };

  const sellAll = () => {
    if (!holding) return;
    form.setValue("quantity_sold", toMoneyInput(holding.total_quantity, QUANTITY_DECIMALS));
    form.clearErrors("quantity_sold");
  };

  if (!holding) return null;

  const sym = holding.currency_symbol;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vender {holding.asset_name}</DialogTitle>
          <DialogDescription>
            Disponible: {formatExactQuantity(holding.total_quantity)} · Costo prom.{" "}
            {sym} {formatUnitPrice(holding.avg_cost_per_unit)}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="quantity_sold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center justify-between">
                      <span>Cantidad a vender</span>
                      <button
                        type="button"
                        onClick={sellAll}
                        className="text-xs text-primary hover:underline"
                      >
                        Vender todo
                      </button>
                    </FormLabel>
                    <FormControl>
                      <MoneyInput
                        decimals={QUANTITY_DECIMALS}
                        placeholder="0"
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
                name="price_per_unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio de venta</FormLabel>
                    <FormControl>
                      <MoneyInput
                        currency={sym}
                        decimals={UNIT_PRICE_DECIMALS}
                        disabled={isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="fees"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comisiones</FormLabel>
                    <FormControl>
                      <MoneyInput
                        currency={sym}
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
                        currency={sym}
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
                name="sale_date"
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

            {preview && (
              <div className="flex flex-col gap-1 rounded-md border bg-muted/30 p-3 text-xs tabular-nums">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Producido bruto
                  </span>
                  <span>
                    {sym} {formatAmount(preview.grossProceeds)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Costo base (promedio)
                  </span>
                  <span>
                    {sym} {formatAmount(preview.costBasis)}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Producido neto</span>
                  <span>
                    {sym} {formatAmount(preview.netProceeds)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
                  <span>Ganancia / Pérdida</span>
                  <span className={amountTone(preview.realizedPnl)}>
                    {sym} {formatAmount(preview.realizedPnl)}
                  </span>
                </div>
              </div>
            )}

            {willAutoCredit && (
              <div className="flex flex-col gap-3">
                <FormField
                  control={form.control}
                  name="skip_credit"
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
                        No acreditar el neto en la cuenta
                      </FormLabel>
                    </FormItem>
                  )}
                />
                {watchedSkipCredit ? null : preview && preview.netProceeds <= 0 ? (
                  <Callout>Sin producido neto: no se acredita nada.</Callout>
                ) : (
                  <Callout>El producido neto se acreditará en la cuenta.</Callout>
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
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {!isPending ? null : <Spinner />}
                Registrar venta
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
