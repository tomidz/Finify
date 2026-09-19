"use client";

import { useEffect, useMemo } from "react";
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
import { MoneyInput } from "@/components/money-input";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { AccountCombobox } from "@/components/account-combobox";
import { CategoryCombobox } from "@/components/category-combobox";
import { useAccounts, useCurrencies } from "@/hooks/useAccounts";
import { useBudgetCategories } from "@/hooks/useBudget";
import { useRecordDebtPayment } from "@/hooks/useNetWorth";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { formatAmount, parseMoney } from "@/lib/format";
import { today } from "@/lib/dates";
import { fetchExchangeRate } from "@/lib/frankfurter";
import { uiScale } from "@/lib/ui-scale";
import type { NwItemWithRelations } from "@/types/net-worth";

interface DebtPaymentDialogProps {
  debt: (NwItemWithRelations & { currentAmount?: number }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PaymentFormValues = {
  date: string;
  amount: string;
  account_id: string;
  category_id: string;
  description: string;
};

export function DebtPaymentDialog({
  debt,
  open,
  onOpenChange,
}: DebtPaymentDialogProps) {
  const form = useForm<PaymentFormValues>({
    defaultValues: {
      date: today(),
      amount: "",
      account_id: "",
      category_id: "",
      description: "",
    },
  });

  const { data: accounts } = useAccounts();
  const { data: currencies } = useCurrencies();
  const { data: categories } = useBudgetCategories();
  const { data: baseCurrency } = useBaseCurrency();
  const recordPayment = useRecordDebtPayment();

  // Filter categories to only debt_payments type
  const debtCategories = useMemo(
    () => (categories ?? []).filter((c) => c.category_type === "debt_payments"),
    [categories]
  );

  // Sort accounts by name
  const sortedAccounts = useMemo(
    () =>
      [...(accounts ?? [])]
        .filter((a) => a.is_active)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [accounts]
  );

  // The amount leaves the chosen account, in that account's currency.
  const accountId = useWatch({ control: form.control, name: "account_id" });
  const accountCurrency = useMemo(() => {
    const code = sortedAccounts.find((a) => a.id === accountId)?.currency;
    return currencies?.find((c) => c.code === code);
  }, [accountId, currencies, sortedAccounts]);
  const debtDecimals = currencies?.find((c) => c.code === debt?.currency)?.decimals ?? 2;

  useEffect(() => {
    if (!open) return;
    form.reset({
      date: today(),
      amount: "",
      account_id: "",
      category_id: debtCategories.length === 1 ? debtCategories[0].id : "",
      description: debt ? `Pago de ${debt.name}` : "",
    });
  }, [open, debt, form, debtCategories]);

  const onSubmit = async (values: PaymentFormValues) => {
    if (!debt) return;

    const amount = parseMoney(values.amount);
    if (amount == null || amount <= 0) {
      form.setError("amount", { message: "Ingresá un monto válido" });
      return;
    }

    // Calculate base amount for FX
    let amountBase: number | null = null;
    if (debt.currency === baseCurrency) {
      amountBase = amount;
    } else if (baseCurrency && amount !== 0) {
      try {
        const rate = await fetchExchangeRate(debt.currency, baseCurrency);
        if (rate) amountBase = amount * rate;
      } catch {
        // leave null
      }
    }

    try {
      await recordPayment.mutateAsync({
        nw_item_id: debt.id,
        date: values.date,
        amount,
        amount_base: amountBase,
        account_id: values.account_id,
        category_id: values.category_id,
        description: values.description,
      });
      onOpenChange(false);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            Registrá un pago para{" "}
            <span className="font-semibold">{debt?.name}</span>.
            {debt?.currentAmount != null && (
              <>
                {" "}
                Saldo actual:{" "}
                <span className="font-semibold">
                  {debt.currency_symbol} {formatAmount(debt.currentAmount, debtDecimals)}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        disabled={recordPayment.isPending}
                        className={uiScale.field}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto</FormLabel>
                    <FormControl>
                      <MoneyInput
                        {...field}
                        currency={accountCurrency?.symbol}
                        // Leaves the account as typed; the server converts the debt's side.
                        decimals={accountCurrency?.decimals ?? 2}
                        disabled={recordPayment.isPending}
                        className={uiScale.field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta de origen</FormLabel>
                  <FormControl>
                    <AccountCombobox
                      accounts={sortedAccounts}
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={recordPayment.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría</FormLabel>
                  <FormControl>
                    <CategoryCombobox
                      categories={debtCategories}
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={recordPayment.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Descripción del pago"
                      disabled={recordPayment.isPending}
                      className={uiScale.field}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" size="sm" className={uiScale.button} disabled={recordPayment.isPending}>
                {recordPayment.isPending
                  ? "Registrando..."
                  : "Registrar pago"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
