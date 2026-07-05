"use client";

import { format } from "date-fns";
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
import { useAccounts, useCurrencies } from "@/hooks/useAccounts";
import { useBaseCurrency, useUsageCounts } from "@/hooks/useTransactions";
import { AccountCombobox } from "@/components/account-combobox";
import { useBudgetCategories } from "@/hooks/useBudget";
import { useCreateRecurring, useUpdateRecurring } from "@/hooks/useRecurring";
import { CategoryCombobox } from "@/components/category-combobox";
import { formatMoneyInput, formatMoneyDisplay, parseMoneyInput } from "@/lib/format";
import {
  RECURRENCE_LABELS,
  RECURRENCE_OPTIONS,
  type RecurringWithRelations,
} from "@/types/recurring";

interface RecurringDialogProps {
  recurring: RecurringWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type RecurringFormValues = {
  description: string;
  type: "income" | "expense";
  category_id: string;
  account_id: string;
  amount: string;
  currency: string;
  recurrence: string;
  day_of_month: string;
  start_date: string;
  end_date: string;
  notes: string;
};

export function RecurringDialog({
  recurring,
  open,
  onOpenChange,
}: RecurringDialogProps) {
  const isEditing = !!recurring;

  const form = useForm<RecurringFormValues>({
    defaultValues: {
      description: "",
      type: "expense",
      category_id: "",
      account_id: "",
      amount: "",
      currency: "EUR",
      recurrence: "monthly",
      day_of_month: "",
      start_date: format(new Date(), "yyyy-MM-dd"),
      end_date: "",
      notes: "",
    },
  });

  const { data: accounts } = useAccounts();
  const { data: currencies } = useCurrencies();
  const { data: baseCurrency } = useBaseCurrency();
  const { data: categories } = useBudgetCategories();
  const { data: usageCounts } = useUsageCounts();
  const sortedAccounts = [...(accounts ?? [])].sort(
    (a, b) =>
      (usageCounts?.accountCounts[b.id] ?? 0) -
        (usageCounts?.accountCounts[a.id] ?? 0) ||
      a.name.localeCompare(b.name)
  );
  const createMutation = useCreateRecurring();
  const updateMutation = useUpdateRecurring();

  const isPending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!open) return;
    if (recurring) {
      form.reset({
        description: recurring.description,
        type: recurring.type,
        category_id: recurring.category_id ?? "",
        account_id: recurring.account_id,
        amount: formatMoneyDisplay(String(recurring.amount).replace(".", ",")),
        currency: recurring.currency,
        recurrence: recurring.recurrence,
        day_of_month: recurring.day_of_month?.toString() ?? "",
        start_date: recurring.start_date.slice(0, 10),
        end_date: recurring.end_date?.slice(0, 10) ?? "",
        notes: recurring.notes ?? "",
      });
    } else {
      form.reset({
        description: "",
        type: "expense",
        category_id: "",
        account_id: accounts?.[0]?.id ?? "",
        amount: "",
        currency: baseCurrency ?? "EUR",
        recurrence: "monthly",
        day_of_month: "",
        start_date: format(new Date(), "yyyy-MM-dd"),
        end_date: "",
        notes: "",
      });
    }
  }, [recurring, open, form, accounts, baseCurrency]);

  const onSubmit = async (values: RecurringFormValues) => {
    let hasError = false;
    if (!values.description.trim()) {
      form.setError("description", { message: "La descripción es obligatoria" });
      hasError = true;
    }
    if (!values.account_id) {
      form.setError("account_id", { message: "Seleccioná una cuenta" });
      hasError = true;
    }
    if (!values.start_date) {
      form.setError("start_date", { message: "La fecha de inicio es obligatoria" });
      hasError = true;
    }
    const amount = parseMoneyInput(values.amount) ?? 0;
    if (amount <= 0) {
      form.setError("amount", { message: "El monto debe ser mayor a 0" });
      hasError = true;
    }
    if (hasError) return;

    const payload = {
      description: values.description.trim(),
      type: values.type as "income" | "expense",
      category_id: values.category_id || null,
      account_id: values.account_id,
      amount,
      currency: values.currency,
      recurrence: values.recurrence as "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly",
      day_of_month: values.day_of_month ? parseInt(values.day_of_month, 10) : null,
      day_of_week: null,
      start_date: values.start_date,
      end_date: values.end_date || null,
      notes: values.notes.trim() || null,
    };

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: recurring.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const fiatCurrencies = useMemo(
    () => currencies?.filter((c) => c.currency_type === "fiat") ?? [],
    [currencies]
  );
  const cryptoCurrencies = useMemo(
    () => currencies?.filter((c) => c.currency_type === "crypto") ?? [],
    [currencies]
  );

  const expenseCategories = (categories ?? []).filter(
    (c) =>
      c.category_type === "essential_expenses" ||
      c.category_type === "discretionary_expenses" ||
      c.category_type === "debt_payments"
  );
  const incomeCategories = (categories ?? []).filter(
    (c) => c.category_type === "income"
  );

  const watchType = useWatch({ control: form.control, name: "type" });
  const relevantCategories =
    watchType === "income" ? incomeCategories : expenseCategories;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar recurrente" : "Nueva recurrente"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modificá los datos de la transacción recurrente."
              : "Creá una transacción que se repite periódicamente."}
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Netflix, Alquiler, Sueldo..."
                      disabled={isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
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
                          <SelectItem value="expense">Gasto</SelectItem>
                          <SelectItem value="income">Ingreso</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="recurrence"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frecuencia</FormLabel>
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
                          {RECURRENCE_OPTIONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {RECURRENCE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                        disabled={isPending}
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

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moneda</FormLabel>
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
                          {fiatCurrencies.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>Fiat</SelectLabel>
                              {fiatCurrencies.map((c) => (
                                <SelectItem key={c.code} value={c.code}>
                                  {c.symbol} {c.code}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          {cryptoCurrencies.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>Crypto</SelectLabel>
                              {cryptoCurrencies.map((c) => (
                                <SelectItem key={c.code} value={c.code}>
                                  {c.symbol} {c.code}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                        </SelectContent>
                      </Select>
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
                  <FormLabel>Cuenta</FormLabel>
                  <FormControl>
                    <AccountCombobox
                      accounts={sortedAccounts}
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isPending}
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
                  <FormLabel>Categoría (opcional)</FormLabel>
                  <FormControl>
                    <CategoryCombobox
                      categories={relevantCategories}
                      value={field.value}
                      onValueChange={field.onChange}
                      allowEmpty
                      emptyLabel="Sin categoría"
                      disabled={isPending}
                      usageCounts={usageCounts?.categoryCounts}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="day_of_month"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Día del mes</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        placeholder="1-31"
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
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inicio</FormLabel>
                    <FormControl>
                      <Input type="date" disabled={isPending} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fin (opc.)</FormLabel>
                    <FormControl>
                      <Input type="date" disabled={isPending} {...field} />
                    </FormControl>
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
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Notas adicionales..."
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
                    : "Crear recurrente"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
