"use client";

import { useEffect, useMemo, useRef } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSwapInvestment } from "@/hooks/useInvestments";
import { amountTone, formatAmount } from "@/lib/format";
import { formatNumberInput, parseNumberInput } from "@/lib/utils";
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  type AssetType,
  type HoldingPosition,
} from "@/types/investments";

type FormValues = {
  given_quantity: string;
  received_name: string;
  received_ticker: string;
  received_type: AssetType;
  received_quantity: string;
  value: string;
  fee_quantity: string;
  fee_asset: "given" | "received";
  date: string;
  notes: string;
};

interface SwapInvestmentDialogProps {
  holding: HoldingPosition | null;
  onOpenChange: (open: boolean) => void;
}

const emptyValues = (): FormValues => ({
  given_quantity: "",
  received_name: "",
  received_ticker: "",
  received_type: "crypto",
  received_quantity: "",
  value: "",
  fee_quantity: "",
  fee_asset: "given",
  date: format(new Date(), "yyyy-MM-dd"),
  notes: "",
});

/**
 * Exchange part of a holding for another asset in the same account (USDT for
 * BTC) at market value. No cash moves: the asset given is sold at that value
 * and the asset received is bought at it.
 */
export function SwapInvestmentDialog({ holding, onOpenChange }: SwapInvestmentDialogProps) {
  const swap = useSwapInvestment();
  const isPending = swap.isPending;
  const valueEdited = useRef(false);
  const form = useForm<FormValues>({ defaultValues: emptyValues() });

  useEffect(() => {
    if (!holding) return;
    form.reset(emptyValues());
    valueEdited.current = false;
  }, [holding, form]);

  const givenQuantity = parseNumberInput(useWatch({ control: form.control, name: "given_quantity" }));
  const value = parseNumberInput(useWatch({ control: form.control, name: "value" }));
  const feeQuantity = parseNumberInput(useWatch({ control: form.control, name: "fee_quantity" })) || 0;
  const feeAsset = useWatch({ control: form.control, name: "fee_asset" });

  // Suggest the value of what is given at its current price until the user
  // types one.
  useEffect(() => {
    if (!holding?.current_price || valueEdited.current || !givenQuantity) return;
    form.setValue(
      "value",
      formatNumberInput(String(Number((givenQuantity * holding.current_price).toFixed(4))).replace(".", ","), 4),
    );
  }, [givenQuantity, holding?.current_price, form]);

  const preview = useMemo(() => {
    if (!holding || !givenQuantity || !value) return null;
    const disposed = givenQuantity + (feeAsset === "given" ? feeQuantity : 0);
    const costBasis = disposed * holding.avg_cost_per_unit;
    return { costBasis, result: value - costBasis };
  }, [holding, givenQuantity, value, feeQuantity, feeAsset]);

  if (!holding) return null;

  const onSubmit = async (values: FormValues) => {
    const disposed = (givenQuantity || 0) + (values.fee_asset === "given" ? feeQuantity : 0);
    const receivedQuantity = parseNumberInput(values.received_quantity);
    let invalid = false;
    if (!givenQuantity || givenQuantity <= 0) {
      form.setError("given_quantity", { message: "Cantidad inválida" });
      invalid = true;
    } else if (disposed > holding.total_quantity) {
      form.setError("given_quantity", {
        message: `Máximo disponible: ${formatAmount(holding.total_quantity)}`,
      });
      invalid = true;
    }
    if (!values.received_name.trim()) {
      form.setError("received_name", { message: "Indicá el activo que recibís" });
      invalid = true;
    }
    if (!receivedQuantity || receivedQuantity <= 0) {
      form.setError("received_quantity", { message: "Cantidad inválida" });
      invalid = true;
    } else if (values.fee_asset === "received" && feeQuantity >= receivedQuantity) {
      form.setError("fee_quantity", { message: "La comisión supera lo recibido" });
      invalid = true;
    }
    if (!value || value <= 0) {
      form.setError("value", { message: "Valor inválido" });
      invalid = true;
    }
    if (invalid) return;

    try {
      await swap.mutateAsync({
        account_id: holding.account_id,
        date: values.date,
        value: value!,
        given: {
          asset_name: holding.asset_name,
          ticker: holding.investments[0]?.ticker ?? null,
          isin: holding.isin,
          asset_type: holding.asset_type,
          currency: holding.currency,
          quantity: givenQuantity!,
        },
        received: {
          asset_name: values.received_name.trim(),
          ticker: values.received_ticker.trim().toUpperCase() || null,
          isin: null,
          asset_type: values.received_type,
          currency: holding.currency,
          quantity: receivedQuantity!,
        },
        fee_quantity: feeQuantity,
        fee_asset: values.fee_asset,
        notes: values.notes.trim() || null,
      });
      onOpenChange(false);
    } catch {
      // toast handled by hook
    }
  };

  const decimalField = (name: keyof FormValues, label: string, decimals: number, onEdit?: () => void) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0"
              disabled={isPending}
              value={field.value as string}
              onChange={(e) => {
                onEdit?.();
                form.setValue(name, formatNumberInput(e.target.value, decimals));
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Intercambiar {holding.ticker}</DialogTitle>
          <DialogDescription>
            {holding.account_name} · disponible {formatAmount(holding.total_quantity)}. No mueve efectivo.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            {decimalField("given_quantity", `Entregás (${holding.ticker})`, 8)}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="received_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recibís</FormLabel>
                    <FormControl>
                      <Input placeholder="Bitcoin" disabled={isPending} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="received_ticker"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ticker</FormLabel>
                    <FormControl>
                      <Input placeholder="BTC" disabled={isPending} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="received_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
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
              {decimalField("received_quantity", "Cantidad recibida", 8)}
            </div>

            {decimalField(
              "value",
              `Valor de mercado (${holding.currency})`,
              4,
              () => (valueEdited.current = true),
            )}

            <div className="grid grid-cols-2 gap-4">
              {decimalField("fee_quantity", "Comisión (unidades)", 8)}
              <FormField
                control={form.control}
                name="fee_asset"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comisión en</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="given">Lo que entregás</SelectItem>
                        <SelectItem value="received">Lo que recibís</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Input disabled={isPending} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {preview && (
              <div className="flex flex-col gap-1 rounded-md border bg-muted/30 p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Costo de lo entregado</span>
                  <span>
                    {holding.currency_symbol} {formatAmount(preview.costBasis)}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Resultado realizado</span>
                  <span className={amountTone(preview.result)}>
                    {holding.currency_symbol} {formatAmount(preview.result)}
                  </span>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando..." : "Intercambiar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
