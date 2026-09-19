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
import { MoneyInput } from "@/components/money-input";
import { Spinner } from "@/components/ui/spinner";
import { parseMoney, toMoneyInput } from "@/lib/format";
import { useAccounts, useCurrencies } from "@/hooks/useAccounts";
import { useTransferInvestmentPosition } from "@/hooks/useInvestments";
import type { HoldingPosition } from "@/types/investments";
import { INVESTMENT_ACCOUNT_TYPES, holdingGroupKey } from "@/types/investments";
import { QUANTITY_DECIMALS, exceedsQuantity, formatExactQuantity } from "./investment-format";

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
  const { data: currencies } = useCurrencies();
  const selectedHoldingKey = form.watch("holding_key");

  const resolvedHolding = useMemo(() => {
    const byKey = holdings.find(
      (item) => holdingGroupKey(item) === selectedHoldingKey,
    );
    if (byKey) return byKey;
    if (holding && holdingGroupKey(holding) === selectedHoldingKey) return holding;
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
  const sourceCurrencyInfo = currencies?.find((c) => c.code === sourceCurrency);

  const watchQuantity = form.watch("quantity");
  const watchFeeQuantity = form.watch("fee_quantity");
  const receivedQuantity = useMemo(() => {
    const qty = parseMoney(watchQuantity) ?? 0;
    const fee = parseMoney(watchFeeQuantity) ?? 0;
    return Math.max(0, qty - fee);
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
      holding_key: targetHolding ? holdingGroupKey(targetHolding) : "",
      destination_account_id: firstDestinationIdFor(targetHolding),
      quantity: targetHolding
        ? toMoneyInput(targetHolding.total_quantity, QUANTITY_DECIMALS)
        : "",
      fee_quantity: "",
      fee_cash: "",
      transfer_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    });
  }, [firstDestinationIdFor, form, holding, holdings, open]);

  const onSubmit = async (values: FormValues) => {
    if (!resolvedHolding) return;

    const quantity = parseMoney(values.quantity);
    if (quantity == null || quantity <= 0) {
      form.setError("quantity", { message: "Cantidad inválida" });
      return;
    }

    if (exceedsQuantity(quantity, resolvedHolding.total_quantity)) {
      form.setError("quantity", { message: "Supera la cantidad disponible" });
      return;
    }

    const feeQuantity = parseMoney(values.fee_quantity) ?? 0;
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

    const feeCash = parseMoney(values.fee_cash) ?? 0;
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
          <DialogTitle>Transferir posición</DialogTitle>
          <DialogDescription>
            {resolvedHolding
              ? `${resolvedHolding.asset_name} de ${resolvedHolding.account_name} a otra cuenta de inversión.`
              : "Elegí la posición a transferir."}
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
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        const next = holdings.find(
                          (item) => holdingGroupKey(item) === value,
                        );
                        if (next) {
                          form.setValue(
                            "quantity",
                            toMoneyInput(next.total_quantity, QUANTITY_DECIMALS),
                          );
                          form.setValue(
                            "destination_account_id",
                            firstDestinationIdFor(next),
                          );
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar posición" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {holdings.map((item) => {
                          const value = holdingGroupKey(item);
                          return (
                            <SelectItem key={value} value={value}>
                              {item.asset_name} · {item.account_name} ·{" "}
                              {formatExactQuantity(item.total_quantity)} {item.currency}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="grid gap-4 sm:grid-cols-2">
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
                        {...field}
                        disabled={transferMutation.isPending}
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-xs">
                      Disponible:{" "}
                      {resolvedHolding
                        ? formatExactQuantity(resolvedHolding.total_quantity)
                        : "0"}
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

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="fee_quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comisión (cantidad)</FormLabel>
                    <FormControl>
                      <MoneyInput
                        decimals={QUANTITY_DECIMALS}
                        placeholder="0"
                        {...field}
                        disabled={transferMutation.isPending}
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-xs">
                      Llega al destino:{" "}
                      {formatExactQuantity(receivedQuantity)}
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
                      <MoneyInput
                        currency={sourceCurrencyInfo?.symbol}
                        // A cash fee is stored with 8 decimals: at least 4, like the other fees.
                        decimals={Math.max(sourceCurrencyInfo?.decimals ?? 2, 4)}
                        {...field}
                        disabled={transferMutation.isPending}
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-xs">
                      Se descuenta del efectivo de la cuenta origen.
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
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={transferMutation.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={transferMutation.isPending || !resolvedHolding}>
                {!transferMutation.isPending ? null : <Spinner />}
                Transferir
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
