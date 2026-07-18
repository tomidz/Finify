"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
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
import { AccountCombobox } from "@/components/account-combobox";
import { formatAmount } from "@/lib/format";
import { formatNumberInput, parseNumberInput } from "@/lib/utils";
import { useAccounts } from "@/hooks/useAccounts";
import { useTransferInvestmentPosition } from "@/hooks/useInvestments";
import type { HoldingPosition } from "@/types/investments";
import { INVESTMENT_ACCOUNT_TYPES } from "@/types/investments";

function holdingKeyOf(holding: HoldingPosition): string {
  return `${holding.ticker}::${holding.account_id}`;
}

type FormValues = {
  holding_key: string;
  destination_account_id: string;
  quantity: string;
  fee_quantity: string;
  fee_cash: string;
  transfer_date: string;
  notes: string;
};

export function TransferPositionDialog({
  holdings,
  holding,
  open,
  onOpenChange,
}: {
  holdings: HoldingPosition[];
  holding: HoldingPosition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<FormValues>({
    defaultValues: {
      holding_key: "",
      destination_account_id: "",
      quantity: "",
      fee_quantity: "",
      fee_cash: "",
      transfer_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    },
  });
  const transferMutation = useTransferInvestmentPosition();
  const { data: accounts } = useAccounts();
  const selectedHoldingKey = form.watch("holding_key");

  const resolvedHolding = useMemo(() => {
    const byKey = holdings.find(
      (item) => holdingKeyOf(item) === selectedHoldingKey,
    );
    if (byKey) return byKey;
    if (holding && holdingKeyOf(holding) === selectedHoldingKey) return holding;
    return null;
  }, [holding, holdings, selectedHoldingKey]);

  const destinationAccounts = useMemo(
    () =>
      (accounts ?? []).filter(
        (account) =>
          account.is_active &&
          INVESTMENT_ACCOUNT_TYPES.has(account.account_type) &&
          account.id !== resolvedHolding?.account_id,
      ),
    [accounts, resolvedHolding?.account_id],
  );

  const sourceCurrency = useMemo(
    () =>
      (accounts ?? []).find(
        (account) => account.id === resolvedHolding?.account_id,
      )?.currency ?? "",
    [accounts, resolvedHolding?.account_id],
  );

  const watchQuantity = form.watch("quantity");
  const watchFeeQuantity = form.watch("fee_quantity");
  const receivedQuantity = useMemo(() => {
    const qty = parseNumberInput(watchQuantity);
    const fee = parseNumberInput(watchFeeQuantity);
    const safeQty = Number.isNaN(qty) ? 0 : qty;
    const safeFee = Number.isNaN(fee) ? 0 : fee;
    return Math.max(0, safeQty - safeFee);
  }, [watchQuantity, watchFeeQuantity]);

  const firstDestinationIdFor = useCallback(
    (sourceHolding: HoldingPosition | null) =>
      (accounts ?? []).find(
        (account) =>
          account.is_active &&
          INVESTMENT_ACCOUNT_TYPES.has(account.account_type) &&
          account.id !== sourceHolding?.account_id,
      )?.id ?? "",
    [accounts],
  );

  // Reset only on the closed → open transition: resetting on dependency
  // identity changes (accounts refetch, holdings re-render) used to snap
  // holding_key back to holdings[0] right after the user picked another
  // position in the dropdown.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!justOpened) return;
    const targetHolding = holding ?? holdings[0] ?? null;
    form.reset({
      holding_key: targetHolding ? holdingKeyOf(targetHolding) : "",
      destination_account_id: firstDestinationIdFor(targetHolding),
      quantity: targetHolding
        ? formatNumberInput(String(targetHolding.total_quantity).replace(".", ","))
        : "",
      fee_quantity: "",
      fee_cash: "",
      transfer_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    });
  }, [firstDestinationIdFor, form, holding, holdings, open]);

  const onSubmit = async (values: FormValues) => {
    if (!resolvedHolding) return;

    const quantity = parseNumberInput(values.quantity);
    if (Number.isNaN(quantity) || quantity <= 0) {
      form.setError("quantity", { message: "Cantidad invalida" });
      return;
    }

    if (quantity > resolvedHolding.total_quantity) {
      form.setError("quantity", { message: "Supera la cantidad disponible" });
      return;
    }

    const feeQuantityRaw = parseNumberInput(values.fee_quantity);
    const feeQuantity = Number.isNaN(feeQuantityRaw) ? 0 : feeQuantityRaw;
    if (feeQuantity < 0) {
      form.setError("fee_quantity", { message: "Comisión inválida" });
      return;
    }
    if (feeQuantity >= quantity) {
      form.setError("fee_quantity", {
        message: "Debe ser menor a la cantidad",
      });
      return;
    }

    const feeCashRaw = parseNumberInput(values.fee_cash);
    const feeCash = Number.isNaN(feeCashRaw) ? 0 : feeCashRaw;
    if (feeCash < 0) {
      form.setError("fee_cash", { message: "Comisión inválida" });
      return;
    }

    try {
      await transferMutation.mutateAsync({
        source_account_id: resolvedHolding.account_id,
        destination_account_id: values.destination_account_id,
        asset_name: resolvedHolding.asset_name,
        ticker: resolvedHolding.ticker,
        isin: resolvedHolding.isin,
        asset_type: resolvedHolding.asset_type,
        currency: resolvedHolding.currency,
        quantity,
        fee_quantity: feeQuantity,
        fee_cash: feeCash,
        transfer_date: values.transfer_date,
        notes: values.notes || null,
      });
      onOpenChange(false);
    } catch {
      // handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Transferir posicion</DialogTitle>
          <DialogDescription>
            {resolvedHolding
              ? `Move ${resolvedHolding.asset_name} desde ${resolvedHolding.account_name} a otra cuenta de inversion.`
              : "Selecciona una posicion para transferir."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {!holding && (
              <FormField
                control={form.control}
                name="holding_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Posición</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          const next = holdings.find(
                            (item) => holdingKeyOf(item) === value,
                          );
                          if (next) {
                            form.setValue(
                              "quantity",
                              formatNumberInput(
                                String(next.total_quantity).replace(".", ","),
                              ),
                            );
                            form.setValue(
                              "destination_account_id",
                              firstDestinationIdFor(next),
                            );
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar posición" />
                        </SelectTrigger>
                        <SelectContent>
                          {holdings.map((item) => {
                            const value = holdingKeyOf(item);
                            return (
                              <SelectItem key={value} value={value}>
                                {item.asset_name} - {item.account_name} - {formatAmount(item.total_quantity)} {item.currency}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormItem>
                <FormLabel>Cuenta origen</FormLabel>
                <FormControl>
                  <Input value={resolvedHolding?.account_name ?? ""} disabled />
                </FormControl>
              </FormItem>
              <FormItem>
                <FormLabel>Activo</FormLabel>
                <FormControl>
                  <Input
                    value={resolvedHolding ? `${resolvedHolding.asset_name} (${resolvedHolding.currency})` : ""}
                    disabled
                  />
                </FormControl>
              </FormItem>
            </div>

            <FormField
              control={form.control}
              name="destination_account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta destino</FormLabel>
                  <FormControl>
                    <AccountCombobox
                      accounts={destinationAccounts}
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={transferMutation.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cantidad</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value}
                        onChange={(event) => field.onChange(formatNumberInput(event.target.value))}
                        inputMode="decimal"
                        disabled={transferMutation.isPending}
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-xs">
                      Disponible: {resolvedHolding ? formatNumberInput(String(resolvedHolding.total_quantity).replace(".", ",")) : "0"}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="transfer_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} disabled={transferMutation.isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fee_quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comisión (cantidad)</FormLabel>
                    <FormControl>
                      <Input
                        value={field.value}
                        onChange={(event) =>
                          field.onChange(formatNumberInput(event.target.value))
                        }
                        inputMode="decimal"
                        placeholder="0"
                        disabled={transferMutation.isPending}
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-xs">
                      Llega al destino:{" "}
                      {formatNumberInput(
                        String(receivedQuantity).replace(".", ","),
                      )}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fee_cash"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Comisión en efectivo{sourceCurrency ? ` (${sourceCurrency})` : ""}
                    </FormLabel>
                    <FormControl>
                      <Input
                        value={field.value}
                        onChange={(event) =>
                          field.onChange(formatNumberInput(event.target.value))
                        }
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={transferMutation.isPending}
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-xs">
                      Se descuenta del cash de la cuenta origen.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} disabled={transferMutation.isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={transferMutation.isPending || !resolvedHolding}>
                {transferMutation.isPending ? "Transfiriendo..." : "Transferir posicion"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
