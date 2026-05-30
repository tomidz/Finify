"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Form,
  FormField,
  FormItem,
  FormLabel as FormFieldLabel,
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
import { useBudgetCategories } from "@/hooks/useBudget";
import {
  useCreateTransaction,
  useUpdateTransaction,
  useBaseCurrency,
  useUsageCounts,
} from "@/hooks/useTransactions";
import { AccountCombobox } from "@/components/account-combobox";
import { useMatchRules, useCreateTransactionRule } from "@/hooks/useTransactionRules";
import { Checkbox } from "@/components/ui/checkbox";
import { CreateTransactionSchema } from "@/lib/validations/transaction.schema";
import { formatNumberInput, parseNumberInput } from "@/lib/utils";
import { fetchExchangeRate } from "@/lib/frankfurter";
import {
  TRANSACTION_TYPE_LABELS,
  type TransactionType,
  type TransactionWithRelations,
} from "@/types/transactions";
import { format } from "date-fns";
import { Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CategoryCombobox } from "@/components/category-combobox";

interface TransactionDialogProps {
  transaction: TransactionWithRelations | null;
  monthId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DIALOG_TRANSACTION_TYPES: TransactionType[] = [
  "expense",
  "income",
  "correction",
];

type TransactionFormValues = {
  date: string;
  transaction_type: TransactionType;
  account_id: string;
  category_id: string;
  description: string;
  amount: string;
  exchange_rate: string;
  base_amount: string;
  notes: string;
};

export function TransactionDialog({
  transaction,
  open,
  onOpenChange,
}: TransactionDialogProps) {
  const isEditing = !!transaction;

  const form = useForm<TransactionFormValues>({
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      transaction_type: "expense",
      account_id: "",
      category_id: "",
      description: "",
      amount: "",
      exchange_rate: "1",
      base_amount: "",
      notes: "",
    },
  });

  const { data: accounts } = useAccounts();
  const { data: currencies } = useCurrencies();
  const { data: categories } = useBudgetCategories();
  const { data: baseCurrency } = useBaseCurrency();
  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();
  const matchRules = useMatchRules();
  const createRuleMutation = useCreateTransactionRule();

  // Toggle to save current transaction as an auto-categorization rule
  const createRuleRef = useRef(false);

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Track which rule auto-categorized
  const appliedRuleRef = useRef<string | null>(null);

  const fetchingRateRef = useRef(false);

  const { data: usageCounts } = useUsageCounts();
  const activeAccounts = useMemo(
    () => accounts?.filter((a) => a.is_active) ?? [],
    [accounts]
  );
  const sortedAccounts = useMemo(
    () =>
      [...activeAccounts].sort(
        (a, b) =>
          (usageCounts?.accountCounts[b.id] ?? 0) -
            (usageCounts?.accountCounts[a.id] ?? 0) ||
          a.name.localeCompare(b.name),
      ),
    [activeAccounts, usageCounts?.accountCounts],
  );

  const watchTransactionType = useWatch({
    control: form.control,
    name: "transaction_type",
  });
  const watchAccountId = useWatch({
    control: form.control,
    name: "account_id",
  });
  const watchDate = useWatch({
    control: form.control,
    name: "date",
  });
  const watchAmount = useWatch({
    control: form.control,
    name: "amount",
  });

  const selectedAccount = activeAccounts.find((a) => a.id === watchAccountId);

  const showCategory = watchTransactionType !== "transfer";

  // Filter categories by transaction type
  const filteredCategories = useMemo(() => {
    const all = categories ?? [];
    if (watchTransactionType === "income") {
      return all.filter((c) => c.category_type === "income");
    }
    if (watchTransactionType === "expense") {
      return all.filter((c) => c.category_type !== "income");
    }
    return all;
  }, [categories, watchTransactionType]);

  // Track whether the user manually edited base_amount
  const baseManuallyEdited = useRef(false);
  // Keep a ref to amount for async FX callback
  const amountRef = useRef(form.getValues("amount"));
  amountRef.current = watchAmount;

  // Auto-fetch exchange rate from Frankfurter when account or date changes
  useEffect(() => {
    if (isEditing || !selectedAccount || !baseCurrency || !currencies) return;

    const accountCurrency = selectedAccount.currency;
    if (accountCurrency === baseCurrency) {
      form.setValue("exchange_rate", "1");
      return;
    }

    const accountCurrencyInfo = currencies.find(
      (c) => c.code === accountCurrency,
    );
    const baseCurrencyInfo = currencies.find((c) => c.code === baseCurrency);
    if (
      accountCurrencyInfo?.currency_type !== "fiat" ||
      baseCurrencyInfo?.currency_type !== "fiat"
    ) {
      return;
    }

    let cancelled = false;
    fetchingRateRef.current = true;

    fetchExchangeRate(accountCurrency, baseCurrency, watchDate).then((rate) => {
      if (cancelled) return;
      fetchingRateRef.current = false;
      if (rate !== null) {
        const formattedRate = formatNumberInput(
          String(rate).replace(".", ","),
        );
        form.setValue("exchange_rate", formattedRate);
        baseManuallyEdited.current = false;
        const amt = parseNumberInput(amountRef.current);
        if (!isNaN(amt) && amt > 0) {
          const base = Math.round(amt * rate * 100) / 100;
          form.setValue(
            "base_amount",
            formatNumberInput(String(base).replace(".", ",")),
          );
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isEditing, selectedAccount, baseCurrency, currencies, watchDate, form]);

  // Sync form when transaction changes
  useEffect(() => {
    if (transaction) {
      const line = transaction.amounts[0];
      form.reset({
        date: transaction.date,
        transaction_type: transaction.transaction_type,
        account_id: line?.account_id ?? "",
        category_id: transaction.category_id ?? "",
        description: transaction.description,
        amount: formatNumberInput(
          String(Math.abs(line?.amount ?? 0)).replace(".", ","),
        ),
        exchange_rate: formatNumberInput(
          String(line?.exchange_rate ?? 1).replace(".", ","),
        ),
        base_amount: formatNumberInput(
          String(Math.abs(line?.base_amount ?? 0)).replace(".", ","),
        ),
        notes: transaction.notes ?? "",
      });
    } else {
      form.reset({
        date: format(new Date(), "yyyy-MM-dd"),
        transaction_type: "expense",
        account_id: activeAccounts[0]?.id ?? "",
        category_id: "",
        description: "",
        amount: "",
        exchange_rate: "1",
        base_amount: "",
        notes: "",
      });
    }
    baseManuallyEdited.current = false;
    createRuleRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction, open, activeAccounts.length]);

  const handleAmountChange = useCallback((val: string) => {
    const formatted = formatNumberInput(val);
    form.setValue("amount", formatted);
    const amt = parseNumberInput(formatted);
    if (baseManuallyEdited.current) {
      const base = parseNumberInput(form.getValues("base_amount"));
      if (!isNaN(amt) && amt > 0 && !isNaN(base) && base > 0) {
        const newRate = Math.round((base / amt) * 100000000) / 100000000;
        form.setValue(
          "exchange_rate",
          formatNumberInput(String(newRate).replace(".", ",")),
        );
      }
    } else {
      const rate = parseNumberInput(form.getValues("exchange_rate"));
      if (!isNaN(amt) && amt > 0 && !isNaN(rate) && rate > 0) {
        const newBase = Math.round(amt * rate * 100) / 100;
        form.setValue(
          "base_amount",
          formatNumberInput(String(newBase).replace(".", ",")),
        );
      }
    }
  }, [form]);

  const handleRateChange = useCallback((val: string) => {
    const formatted = formatNumberInput(val);
    form.setValue("exchange_rate", formatted);
    baseManuallyEdited.current = false;
    const amt = parseNumberInput(form.getValues("amount"));
    const rate = parseNumberInput(formatted);
    if (!isNaN(amt) && amt > 0 && !isNaN(rate) && rate > 0) {
      const newBase = Math.round(amt * rate * 100) / 100;
      form.setValue(
        "base_amount",
        formatNumberInput(String(newBase).replace(".", ",")),
      );
    }
  }, [form]);

  const handleBaseAmountChange = useCallback((val: string) => {
    baseManuallyEdited.current = true;
    const formatted = formatNumberInput(val);
    form.setValue("base_amount", formatted);
    const amt = parseNumberInput(form.getValues("amount"));
    const base = parseNumberInput(formatted);
    if (!isNaN(amt) && amt > 0 && !isNaN(base)) {
      const newRate = Math.round((base / amt) * 100000000) / 100000000;
      form.setValue(
        "exchange_rate",
        formatNumberInput(String(newRate).replace(".", ",")),
      );
    }
  }, [form]);

  const handleDescriptionBlur = useCallback(async () => {
    if (isEditing) return;
    const description = form.getValues("description").trim();
    const notes = form.getValues("notes").trim();
    if (!description) return;

    try {
      const match = await matchRules.mutateAsync({
        description,
        notes: notes || null,
      });
      if (match) {
        if (match.category_id) {
          form.setValue("category_id", match.category_id);
        }
        if (match.account_id) {
          form.setValue("account_id", match.account_id);
        }
        if (match.rename_to) {
          form.setValue("description", match.rename_to);
        }
        appliedRuleRef.current = match.rule_name;
      } else {
        appliedRuleRef.current = null;
      }
    } catch {
      // Silently ignore rule matching errors
    }
  }, [isEditing, form, matchRules]);

  const onSubmit = async (values: TransactionFormValues) => {
    form.clearErrors();

    const amountNum = parseNumberInput(values.amount);
    const rateNum = parseNumberInput(values.exchange_rate);
    const baseNum = parseNumberInput(values.base_amount);

    const formData = {
      date: values.date,
      transaction_type: values.transaction_type,
      category_id: showCategory ? values.category_id || null : null,
      description: values.description,
      amounts: [
        {
          account_id: values.account_id,
          amount: isNaN(amountNum) ? 0 : amountNum,
          exchange_rate: isNaN(rateNum) ? 1 : rateNum,
          base_amount: isNaN(baseNum) ? 0 : baseNum,
        },
      ],
      notes: values.notes,
    };

    const parsed = CreateTransactionSchema.safeParse(formData);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const first = issue.path[0];
        if (first === "amounts") {
          const lineField = issue.path[2];
          if (typeof lineField === "string") {
            const map: Record<string, keyof TransactionFormValues> = {
              account_id: "account_id",
              amount: "amount",
              exchange_rate: "exchange_rate",
              base_amount: "base_amount",
            };
            const key = map[lineField];
            if (key) {
              form.setError(key, { message: issue.message });
            }
          }
          continue;
        }
        if (first && typeof first === "string") {
          const mapRoot: Record<string, keyof TransactionFormValues> = {
            date: "date",
            transaction_type: "transaction_type",
            category_id: "category_id",
            description: "description",
            notes: "notes",
          };
          const key = mapRoot[first];
          if (key) {
            form.setError(key, { message: issue.message });
          }
        }
      }
      return;
    }

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: transaction.id,
          date: parsed.data.date,
          category_id: parsed.data.category_id,
          description: parsed.data.description,
          notes: parsed.data.notes,
          amounts: parsed.data.amounts.map((line) => {
            if (transaction.transaction_type === "income") return line;
            if (transaction.transaction_type === "expense") {
              return {
                ...line,
                amount: -Math.abs(line.amount),
                base_amount: -Math.abs(line.base_amount),
              };
            }
            return line;
          }),
        });
      } else {
        await createMutation.mutateAsync(parsed.data);
      }

      // Create auto-categorization rule if checkbox was checked
      if (createRuleRef.current && parsed.data.description) {
        try {
          const categoryName = (categories ?? []).find(
            (c) => c.id === parsed.data.category_id
          )?.name;
          const ruleName = categoryName
            ? `${parsed.data.description} -> ${categoryName}`
            : parsed.data.description;
          await createRuleMutation.mutateAsync({
            name: ruleName,
            match_field: "description" as const,
            match_type: "contains" as const,
            match_value: parsed.data.description,
            action_category_id: parsed.data.category_id ?? null,
            action_account_id: parsed.data.amounts[0]?.account_id ?? null,
            action_rename: null,
            priority: 0,
            is_active: true,
          });
        } catch {
          // Silently ignore rule creation errors
        }
      }
      createRuleRef.current = false;
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
            {isEditing ? "Editar transacción" : "Nueva transacción"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modificá los datos de la transacción."
              : "Registrá un ingreso, gasto o corrección."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
          {/* Row 1: Fecha + Tipo */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormFieldLabel>Fecha</FormFieldLabel>
                    <FormControl>
                      <Input type="date" disabled={isPending} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="transaction_type"
                render={({ field }) => (
                  <FormItem>
                    <FormFieldLabel>Tipo</FormFieldLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={(val) => {
                          field.onChange(val);
                          // Clear category when switching type (selected one may not belong to new type)
                          form.setValue("category_id", "");
                        }}
                        disabled={isPending || isEditing}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DIALOG_TRANSACTION_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {TRANSACTION_TYPE_LABELS[type]}
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

          {/* Row 2: Descripción */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormFieldLabel>Descripción</FormFieldLabel>
                <FormControl>
                  <Input
                    placeholder="Ej: Supermercado, Sueldo, etc."
                    disabled={isPending}
                    {...field}
                    onBlur={(e) => {
                      field.onBlur();
                      if (e.target.value.trim()) {
                        handleDescriptionBlur();
                      }
                    }}
                  />
                </FormControl>
                {appliedRuleRef.current && !isEditing && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Sparkles className="size-3" />
                    Auto-categorizado: {appliedRuleRef.current}
                  </Badge>
                )}
                <FormMessage />
              </FormItem>
              )}
            />

          {/* Row 3: Cuenta + Categoría */}
          <div
            className={`grid gap-4 ${showCategory ? "grid-cols-2" : "grid-cols-1"}`}
          >
            <FormField
              control={form.control}
              name="account_id"
              render={({ field }) => (
                <FormItem>
                  <FormFieldLabel>Cuenta</FormFieldLabel>
                  <FormControl>
                    <AccountCombobox
                      accounts={sortedAccounts}
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isPending || isEditing}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {showCategory && (
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormFieldLabel>Categoría</FormFieldLabel>
                    <FormControl>
                      <CategoryCombobox
                        categories={filteredCategories}
                        value={field.value}
                        onValueChange={field.onChange}
                        grouped
                        disabled={isPending}
                        usageCounts={usageCounts?.categoryCounts}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>

          {/* Row 4: Monto + TC + Monto base */}
          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormFieldLabel>
                    Monto
                    {selectedAccount ? ` (${selectedAccount.currency})` : ""}
                  </FormFieldLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      disabled={isPending}
                      value={field.value}
                      onChange={(e) => handleAmountChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="exchange_rate"
              render={({ field }) => (
                <FormItem>
                  <FormFieldLabel>
                    Tipo de cambio
                    {fetchingRateRef.current && (
                      <Loader2 className="ml-1 inline size-3 animate-spin" />
                    )}
                  </FormFieldLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="1"
                      disabled={isPending}
                      value={field.value}
                      onChange={(e) => handleRateChange(e.target.value)}
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
                  <FormFieldLabel>
                    Monto base{baseCurrency ? ` (${baseCurrency})` : ""}
                  </FormFieldLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      disabled={isPending}
                      value={field.value}
                      onChange={(e) =>
                        handleBaseAmountChange(e.target.value)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Row 5: Notas */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormFieldLabel>Notas (opcional)</FormFieldLabel>
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

          <div className="flex items-center space-x-2">
            <Checkbox
              id="create-rule"
              onCheckedChange={(checked) => {
                createRuleRef.current = checked === true;
              }}
            />
            <Label htmlFor="create-rule" className="text-sm font-normal cursor-pointer">
              Crear regla de auto-categorización con esta transacción
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Guardando..."
                : isEditing
                  ? "Guardar cambios"
                  : "Crear transacción"}
            </Button>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
