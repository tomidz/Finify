"use client";

import { format } from "date-fns";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
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
import { AccountCombobox } from "@/components/account-combobox";
import { CategoryCombobox } from "@/components/category-combobox";
import { useAccounts } from "@/hooks/useAccounts";
import { useBudgetCategories } from "@/hooks/useBudget";
import { useRecordDebtPayment } from "@/hooks/useNetWorth";
import { useBaseCurrency } from "@/hooks/useTransactions";
import { formatMoneyInput, parseMoneyInput, formatAmount } from "@/lib/format";
import { fetchExchangeRate } from "@/lib/frankfurter";
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
      date: format(new Date(), "yyyy-MM-dd"),
      amount: "",
      account_id: "",
      category_id: "",
      description: "",
    },
  });

  const { data: accounts } = useAccounts();
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

  useEffect(() => {
    if (!open) return;
    form.reset({
      date: format(new Date(), "yyyy-MM-dd"),
      amount: "",
      account_id: "",
      category_id: debtCategories.length === 1 ? debtCategories[0].id : "",
      description: debt ? `Pago de ${debt.name}` : "",
    });
  }, [open, debt, form, debtCategories]);

  const onSubmit = async (values: PaymentFormValues) => {
    if (!debt) return;

    const amount = parseMoneyInput(values.amount);
    if (!amount || amount <= 0) {
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
                  {debt.currency_symbol} {formatAmount(debt.currentAmount)}
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
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={recordPayment.isPending}
                        value={field.value}
                        onChange={(e) =>
                          form.setValue(
                            "amount",
                            formatMoneyInput(e.target.value)
                          )
                        }
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
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={recordPayment.isPending}>
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
