"use client";

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
import { useBaseCurrency } from "@/hooks/useTransactions";
import {
  useCreateSavingsGoal,
  useUpdateSavingsGoal,
} from "@/hooks/useSavingsGoals";
import { formatMoneyInput, formatMoneyDisplay, parseMoneyInput } from "@/lib/format";
import type { SavingsGoalWithRelations } from "@/types/savings-goals";

interface GoalDialogProps {
  goal: SavingsGoalWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type GoalFormValues = {
  name: string;
  target_amount: string;
  current_amount: string;
  currency: string;
  deadline: string;
  account_id: string;
  color: string;
};

const COLOR_OPTIONS = [
  { label: "Azul", value: "#60a5fa" },
  { label: "Verde", value: "#34d399" },
  { label: "Violeta", value: "#818cf8" },
  { label: "Rosa", value: "#fb7185" },
  { label: "Naranja", value: "#fb923c" },
  { label: "Cyan", value: "#22d3ee" },
];

export function GoalDialog({ goal, open, onOpenChange }: GoalDialogProps) {
  const isEditing = !!goal;

  const form = useForm<GoalFormValues>({
    defaultValues: {
      name: "",
      target_amount: "",
      current_amount: "",
      currency: "EUR",
      deadline: "",
      account_id: "",
      color: "#60a5fa",
    },
  });

  const { data: accounts } = useAccounts();
  const { data: currencies } = useCurrencies();
  const { data: baseCurrency } = useBaseCurrency();
  const createMutation = useCreateSavingsGoal();
  const updateMutation = useUpdateSavingsGoal();

  const isPending = createMutation.isPending || updateMutation.isPending;

  const selectedAccountId = form.watch("account_id");
  const linkedAccount = useMemo(
    () => (accounts ?? []).find((a) => a.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );

  useEffect(() => {
    if (!open) return;
    if (goal) {
      form.reset({
        name: goal.name,
        target_amount: formatMoneyDisplay(
          String(goal.target_amount).replace(".", ",")
        ),
        current_amount: goal.account_id
          ? ""
          : formatMoneyDisplay(String(goal.current_amount).replace(".", ",")),
        currency: goal.currency,
        deadline: goal.deadline?.slice(0, 10) ?? "",
        account_id: goal.account_id ?? "",
        color: goal.color,
      });
    } else {
      form.reset({
        name: "",
        target_amount: "",
        current_amount: "",
        currency: baseCurrency ?? "EUR",
        deadline: "",
        account_id: "",
        color: "#60a5fa",
      });
    }
  }, [goal, open, form, baseCurrency]);

  const onSubmit = async (values: GoalFormValues) => {
    let hasError = false;
    if (!values.name.trim()) {
      form.setError("name", { message: "El nombre es obligatorio" });
      hasError = true;
    }
    const targetAmount = parseMoneyInput(values.target_amount) ?? 0;
    if (targetAmount <= 0) {
      form.setError("target_amount", {
        message: "El monto objetivo debe ser mayor a 0",
      });
      hasError = true;
    }
    if (hasError) return;

    // Account-linked goals derive progress from the account balance, so any
    // manually-typed current amount is ignored.
    const currentAmount = values.account_id
      ? 0
      : parseMoneyInput(values.current_amount) ?? 0;

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: goal.id,
          name: values.name.trim(),
          target_amount: targetAmount,
          current_amount: currentAmount,
          currency: values.currency,
          deadline: values.deadline || null,
          account_id: values.account_id || null,
          color: values.color,
        });
      } else {
        await createMutation.mutateAsync({
          name: values.name.trim(),
          target_amount: targetAmount,
          current_amount: currentAmount,
          currency: values.currency,
          deadline: values.deadline || null,
          account_id: values.account_id || null,
          color: values.color,
        });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar meta" : "Nueva meta de ahorro"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modificá los datos de tu meta de ahorro."
              : "Creá una meta para motivar y trackear tu ahorro."}
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Vacaciones Europa, Fondo de emergencia..."
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
                name="target_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto objetivo</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={isPending}
                        value={field.value}
                        onChange={(e) =>
                          form.setValue(
                            "target_amount",
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
                        disabled={isPending || !!linkedAccount}
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

            {!linkedAccount && (
              <FormField
                control={form.control}
                name="current_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto actual ahorrado (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={isPending}
                        value={field.value}
                        onChange={(e) =>
                          form.setValue(
                            "current_amount",
                            formatMoneyInput(e.target.value)
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="deadline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha límite (opcional)</FormLabel>
                  <FormControl>
                    <Input type="date" disabled={isPending} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta asociada (opcional)</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value || "none"}
                      onValueChange={(val) => {
                        const accountId = val === "none" ? "" : val;
                        field.onChange(accountId);
                        const account = (accounts ?? []).find(
                          (a) => a.id === accountId
                        );
                        if (account) {
                          form.setValue("currency", account.currency);
                        }
                      }}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Sin cuenta específica" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin cuenta específica</SelectItem>
                        {(accounts ?? []).map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <p className="text-muted-foreground text-xs">
                    {linkedAccount
                      ? "El progreso se calcula automáticamente desde el saldo de esta cuenta."
                      : "Asociá una cuenta para trackear el progreso automáticamente desde su saldo."}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      {COLOR_OPTIONS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          className={`size-8 rounded-full border-2 transition-all ${
                            field.value === c.value
                              ? "border-foreground scale-110"
                              : "border-transparent"
                          }`}
                          style={{ backgroundColor: c.value }}
                          onClick={() => form.setValue("color", c.value)}
                          disabled={isPending}
                          title={c.label}
                        />
                      ))}
                    </div>
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
                    : "Crear meta"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
