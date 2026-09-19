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
import {
  useAccounts,
  useCurrencies,
  useAccountCurrentBalance,
} from "@/hooks/useAccounts";
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
import { amountTone, formatAmount, parseMoney, toMoneyInput } from "@/lib/format";
import { errorMessage } from "@/lib/action-result";
import { fetchExchangeRate } from "@/lib/frankfurter";
import {
  TRANSACTION_TYPE_LABELS,
  type TransactionType,
  type TransactionWithRelations,
} from "@/types/transactions";
import { format } from "date-fns";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CategoryCombobox } from "@/components/category-combobox";
import { MoneyInput } from "@/components/money-input";
import { Spinner } from "@/components/ui/spinner";
import { uiScale } from "@/lib/ui-scale";

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
  target_balance: string;
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
      target_balance: "",
      notes: "",
    },
  });

  const { data: accounts } = useAccounts();
  const { data: currencies } = useCurrencies();
  const { data: categories } = useBudgetCategories();
  const { data: baseCurrency, error: baseCurrencyError } = useBaseCurrency();
  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();
  const matchRules = useMatchRules();
  const createRuleMutation = useCreateTransactionRule();

  // Toggle to save current transaction as an auto-categorization rule
  const createRuleRef = useRef(false);

  const isPending = createMutation.isPending || updateMutation.isPending;

  // The rule that set the category, and the category it set.
  const appliedRuleRef = useRef<string | null>(null);
  const ruleCategoryRef = useRef<string | null>(null);
  // What the user picked by hand: a rule matched later leaves it.
  const pickedByHandRef = useRef({ account: false, category: false });
  // The description a rule last wrote: changed after that, it is the user's.
  const ruleDescriptionRef = useRef<string | null>(null);

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
  const watchTargetBalance = useWatch({
    control: form.control,
    name: "target_balance",
  });
  const watchCategoryId = useWatch({
    control: form.control,
    name: "category_id",
  });

  const selectedAccount = activeAccounts.find((a) => a.id === watchAccountId);
  // An edited transaction's account can be inactive: its currency still sets the decimals.
  const accountCurrencyCode = accounts?.find((a) => a.id === watchAccountId)?.currency;
  const amountDecimals =
    currencies?.find((c) => c.code === accountCurrencyCode)?.decimals ?? 2;
  const baseDecimals =
    currencies?.find((c) => c.code === baseCurrency)?.decimals ?? 2;

  // Correction = balance adjustment: enter the account's actual current balance
  // and the delta vs. the recorded balance is computed automatically.
  const isCorrection = watchTransactionType === "correction";
  const isBalanceAdjustment = isCorrection && !isEditing;

  // A save refreshes balances in the background: until that lands the cached
  // balance predates it, and a correction computed from it would repeat it.
  const {
    data: currentBalance,
    isFetching: isBalanceLoading,
    error: balanceError,
  } = useAccountCurrentBalance(
    isBalanceAdjustment ? watchAccountId || undefined : undefined,
  );
  // A failed read is no balance, not 0 (the adjustment would be the whole
  // target) nor the cached one (it can predate a save).
  const recordedBalance = balanceError ? null : (currentBalance?.amount ?? null);
  const targetBalanceNum = parseMoney(watchTargetBalance);
  const adjustment =
    isBalanceAdjustment &&
    !isBalanceLoading &&
    recordedBalance != null &&
    targetBalanceNum != null
      ? // Rounded to the account's currency, not to cents: a crypto balance
        // has up to 8 decimals.
        Number((targetBalanceNum - recordedBalance).toFixed(amountDecimals))
      : null;

  const showCategory = watchTransactionType !== "transfer" && !isCorrection;

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

    // Without a quote the rate is entered by hand: a rate left from another
    // account would save the amount at it.
    const clearRate = () => {
      form.setValue("exchange_rate", "");
      if (!baseManuallyEdited.current) form.setValue("base_amount", "");
    };

    const accountCurrencyInfo = currencies.find(
      (c) => c.code === accountCurrency,
    );
    const baseCurrencyInfo = currencies.find((c) => c.code === baseCurrency);
    if (
      accountCurrencyInfo?.currency_type !== "fiat" ||
      baseCurrencyInfo?.currency_type !== "fiat"
    ) {
      clearRate();
      return;
    }

    let cancelled = false;
    fetchingRateRef.current = true;

    fetchExchangeRate(accountCurrency, baseCurrency, watchDate).then((rate) => {
      if (cancelled) return;
      fetchingRateRef.current = false;
      if (rate === null) {
        clearRate();
        return;
      }
      form.setValue("exchange_rate", toMoneyInput(rate, 8));
      baseManuallyEdited.current = false;
      const amt = parseMoney(amountRef.current);
      if (amt != null && amt > 0) {
        const base = Math.round(amt * rate * 100) / 100;
        form.setValue("base_amount", toMoneyInput(base));
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
        // Stored amounts load at full precision: a cosmetic edit keeps them.
        amount: toMoneyInput(Math.abs(line?.amount ?? 0), 8),
        exchange_rate: toMoneyInput(line?.exchange_rate ?? 1, 8),
        base_amount: toMoneyInput(Math.abs(line?.base_amount ?? 0), 8),
        target_balance: "",
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
        target_balance: "",
        notes: "",
      });
    }
    baseManuallyEdited.current = false;
    createRuleRef.current = false;
    appliedRuleRef.current = null;
    ruleCategoryRef.current = null;
    pickedByHandRef.current = { account: false, category: false };
    ruleDescriptionRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction, open, activeAccounts.length]);

  // The fields hand over the sanitized text (MoneyInput).
  const handleAmountChange = useCallback((val: string) => {
    form.setValue("amount", val);
    const amt = parseMoney(val);
    if (baseManuallyEdited.current) {
      const base = parseMoney(form.getValues("base_amount"));
      if (amt != null && amt > 0 && base != null && base > 0) {
        const newRate = Math.round((base / amt) * 100000000) / 100000000;
        form.setValue("exchange_rate", toMoneyInput(newRate, 8));
      }
    } else {
      const rate = parseMoney(form.getValues("exchange_rate"));
      if (amt != null && amt > 0 && rate != null && rate > 0) {
        const newBase = Math.round(amt * rate * 100) / 100;
        form.setValue("base_amount", toMoneyInput(newBase));
      }
    }
  }, [form]);

  const handleRateChange = useCallback((val: string) => {
    form.setValue("exchange_rate", val);
    baseManuallyEdited.current = false;
    const amt = parseMoney(form.getValues("amount"));
    const rate = parseMoney(val);
    if (amt != null && amt > 0 && rate != null && rate > 0) {
      const newBase = Math.round(amt * rate * 100) / 100;
      form.setValue("base_amount", toMoneyInput(newBase));
    }
  }, [form]);

  const handleBaseAmountChange = useCallback((val: string) => {
    baseManuallyEdited.current = true;
    form.setValue("base_amount", val);
    const amt = parseMoney(form.getValues("amount"));
    const base = parseMoney(val);
    if (amt != null && amt > 0 && base != null) {
      const newRate = Math.round((base / amt) * 100000000) / 100000000;
      form.setValue("exchange_rate", toMoneyInput(newRate, 8));
    }
  }, [form]);

  // Rules match on the description or the notes: both fields run them on blur.
  const handleRuleFieldBlur = useCallback(async () => {
    if (isEditing) return;
    const description = form.getValues("description").trim();
    const notes = form.getValues("notes").trim();
    if (!description && !notes) return;

    try {
      const match = await matchRules.mutateAsync({
        description,
        notes: notes || null,
      });
      if (!match) return;
      if (match.category_id && !pickedByHandRef.current.category) {
        form.setValue("category_id", match.category_id);
        ruleCategoryRef.current = match.category_id;
        appliedRuleRef.current = match.rule_name;
      }
      if (match.account_id && !pickedByHandRef.current.account) {
        form.setValue("account_id", match.account_id);
      }
      const renamedThenEdited =
        ruleDescriptionRef.current !== null &&
        form.getValues("description") !== ruleDescriptionRef.current;
      if (match.rename_to && !renamedThenEdited) {
        form.setValue("description", match.rename_to);
        ruleDescriptionRef.current = match.rename_to;
      }
    } catch {
      // Silently ignore rule matching errors
    }
  }, [isEditing, form, matchRules]);

  const onSubmit = async (values: TransactionFormValues) => {
    form.clearErrors();

    // Without the base currency no rate is required, and a foreign amount
    // would be saved 1:1.
    if (!baseCurrency) {
      form.setError("exchange_rate", {
        message: baseCurrencyError
          ? errorMessage(baseCurrencyError)
          : "Todavía se está cargando la moneda base.",
      });
      return;
    }

    const accountCurrency = accounts?.find((a) => a.id === values.account_id)?.currency;
    const needsRate = accountCurrency != null && baseCurrency != null && accountCurrency !== baseCurrency;
    const rateNum = parseMoney(values.exchange_rate);
    const enteredRate = rateNum != null && rateNum > 0 ? rateNum : null;
    const rateRequired = () =>
      form.setError("exchange_rate", { message: "Ingresá el tipo de cambio" });

    let amountNum: number;
    let baseNum: number;
    let safeRate: number;
    let description = values.description;

    if (isBalanceAdjustment) {
      if (isBalanceLoading) return;
      if (balanceError) {
        form.setError("target_balance", { message: errorMessage(balanceError) });
        return;
      }
      if (adjustment === null) {
        form.setError("target_balance", {
          message: "Ingresá el saldo actual de la cuenta",
        });
        return;
      }
      if (adjustment === 0) {
        form.setError("target_balance", {
          message: "El saldo ya coincide, no hay ajuste que registrar",
        });
        return;
      }
      const rate = needsRate ? enteredRate : 1;
      if (rate === null) {
        rateRequired();
        return;
      }
      safeRate = rate;
      amountNum = adjustment;
      // At the ledger's 8 decimals: a sub-cent crypto correction keeps a base.
      baseNum = Number((adjustment * safeRate).toFixed(8));
      description = values.description.trim() || "Ajuste de saldo";
    } else {
      const amount = parseMoney(values.amount);
      const base = parseMoney(values.base_amount);
      // Empty is missing, never 0.
      if (amount == null || base == null) {
        if (amount == null) form.setError("amount", { message: "Ingresá el monto" });
        if (base == null) form.setError("base_amount", { message: "Ingresá el monto base" });
        return;
      }
      amountNum = amount;
      baseNum = base;
      // A base amount typed without a rate implies the rate.
      const impliedRate =
        amountNum !== 0 && baseNum !== 0
          ? Math.abs(baseNum / amountNum)
          : null;
      const rate = needsRate ? (enteredRate ?? impliedRate) : 1;
      if (rate === null) {
        rateRequired();
        return;
      }
      safeRate = rate;
    }

    const formData = {
      date: values.date,
      transaction_type: values.transaction_type,
      category_id: showCategory ? values.category_id || null : null,
      description,
      amounts: [
        {
          account_id: values.account_id,
          amount: amountNum,
          exchange_rate: safeRate,
          base_amount: baseNum,
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
            // A correction only shows the target balance: its line's errors
            // go there, or nothing would say why saving failed.
            const key = isBalanceAdjustment && lineField !== "account_id" ? "target_balance" : map[lineField];
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
            if (transaction.transaction_type === "correction") {
              // The form loads |amount|, so a negative adjustment must keep
              // its original sign — a cosmetic edit used to flip −500 → +500.
              const originalSign =
                Math.sign(transaction.amounts[0]?.amount ?? 1) || 1;
              return {
                ...line,
                amount: originalSign * Math.abs(line.amount),
                base_amount: originalSign * Math.abs(line.base_amount),
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
            className="flex flex-col gap-4"
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
                    <Select
                      value={field.value}
                      onValueChange={(val) => {
                        field.onChange(val);
                        // Clear category when switching type (selected one may not belong to new type)
                        form.setValue("category_id", "");
                        pickedByHandRef.current.category = false;
                      }}
                      disabled={isPending || isEditing}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DIALOG_TRANSACTION_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {TRANSACTION_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                        handleRuleFieldBlur();
                      }
                    }}
                  />
                </FormControl>
                {appliedRuleRef.current && !isEditing && watchCategoryId === ruleCategoryRef.current && (
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
                      onValueChange={(value) => {
                        pickedByHandRef.current.account = true;
                        field.onChange(value);
                      }}
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
                        onValueChange={(value) => {
                          // Emptying the field leaves it to the rules again.
                          pickedByHandRef.current.category = value !== "";
                          field.onChange(value);
                        }}
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

          {/* Row 4: Monto + TC + Monto base — o ajuste de saldo para correcciones */}
          {isBalanceAdjustment ? (
            <div className="flex flex-col gap-3">
              <div
                className={`grid gap-4 ${
                  selectedAccount && selectedAccount.currency !== baseCurrency
                    ? "grid-cols-2"
                    : "grid-cols-1"
                }`}
              >
                <FormField
                  control={form.control}
                  name="target_balance"
                  render={({ field }) => (
                    <FormItem>
                      <FormFieldLabel>Saldo actual</FormFieldLabel>
                      <FormControl>
                        {/* A card or a debt can stand below zero. */}
                        <MoneyInput
                          currency={accountCurrencyCode}
                          decimals={amountDecimals}
                          allowNegative
                          disabled={isPending}
                          value={field.value}
                          onValueChange={(next) => form.setValue("target_balance", next)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {selectedAccount &&
                  selectedAccount.currency !== baseCurrency && (
                    <FormField
                      control={form.control}
                      name="exchange_rate"
                      render={({ field }) => (
                        <FormItem>
                          <RateLabel fetching={fetchingRateRef.current} />
                          <FormControl>
                            <MoneyInput
                              decimals={8}
                              placeholder="1"
                              disabled={isPending}
                              value={field.value}
                              onValueChange={handleRateChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
              </div>

              <div className="bg-muted/30 flex flex-col gap-1.5 rounded-md border px-3 py-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Saldo registrado</span>
                  <span className="font-medium tabular-nums">
                    {isBalanceLoading
                      ? "…"
                      : recordedBalance == null
                        ? "—"
                        : `${accountCurrencyCode ?? ""} ${formatAmount(recordedBalance, amountDecimals)}`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Ajuste</span>
                  <span
                    className={`font-semibold tabular-nums ${
                      adjustment == null ? "text-muted-foreground" : amountTone(adjustment)
                    }`}
                  >
                    {adjustment == null
                      ? "—"
                      : `${adjustment > 0 ? "+" : adjustment < 0 ? "−" : ""}${accountCurrencyCode ?? ""} ${formatAmount(Math.abs(adjustment), amountDecimals)}`}
                  </span>
                </div>
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormFieldLabel>Monto</FormFieldLabel>
                  <FormControl>
                    <MoneyInput
                      currency={accountCurrencyCode}
                      decimals={amountDecimals}
                      disabled={isPending}
                      value={field.value}
                      onValueChange={handleAmountChange}
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
                  <RateLabel fetching={fetchingRateRef.current} />
                  <FormControl>
                    <MoneyInput
                      decimals={8}
                      placeholder="1"
                      disabled={isPending}
                      value={field.value}
                      onValueChange={handleRateChange}
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
                  <FormFieldLabel>Monto base</FormFieldLabel>
                  <FormControl>
                    <MoneyInput
                      currency={baseCurrency ?? undefined}
                      decimals={baseDecimals}
                      disabled={isPending}
                      value={field.value}
                      onValueChange={handleBaseAmountChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          )}

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
                    onBlur={(e) => {
                      field.onBlur();
                      if (e.target.value.trim()) {
                        handleRuleFieldBlur();
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex items-center gap-2">
            <Checkbox
              id="create-rule"
              onCheckedChange={(checked) => {
                createRuleRef.current = checked === true;
              }}
            />
            <Label htmlFor="create-rule" className="cursor-pointer text-xs font-normal">
              Crear regla de auto-categorización
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={uiScale.button}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              className={uiScale.button}
              disabled={isPending || (isBalanceAdjustment && isBalanceLoading)}
            >
              {!isPending ? null : <Spinner className="size-3.5" />}
              {isEditing ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RateLabel({ fetching }: { fetching: boolean }) {
  return (
    <FormFieldLabel className="flex items-center gap-1">
      Tipo de cambio
      {!fetching ? null : <Spinner className="size-3" />}
    </FormFieldLabel>
  );
}
