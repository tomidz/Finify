"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { ListFilter, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CategoryCombobox } from "@/components/category-combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { NumericCell } from "@/components/numeric-cell";
import { PageButton } from "@/components/page-button";
import { RowActions } from "@/components/row-actions";
import { Section } from "@/components/section";
import { StateCard } from "@/components/state-card";
import { TruncatedText } from "@/components/truncated-text";
import { useConfirm } from "@/hooks/use-confirm";
import {
  useTransactionRules,
  useCreateTransactionRule,
  useUpdateTransactionRule,
  useDeleteTransactionRule,
} from "@/hooks/useTransactionRules";
import { useBudgetCategories } from "@/hooks/useBudget";
import { useAccounts } from "@/hooks/useAccounts";
import { AccountCombobox } from "@/components/account-combobox";
import {
  MATCH_FIELD_LABELS,
  MATCH_TYPE_LABELS,
  MATCH_FIELDS,
  MATCH_TYPES,
  type TransactionRuleWithCategory,
} from "@/types/transaction-rules";

type RuleFormValues = {
  name: string;
  match_field: string;
  match_type: string;
  match_value: string;
  action_category_id: string;
  action_account_id: string;
  action_rename: string;
  priority: string;
};

function RuleDialog({
  rule,
  open,
  onOpenChange,
}: {
  rule: TransactionRuleWithCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEditing = !!rule;

  const form = useForm<RuleFormValues>({
    defaultValues: {
      name: "",
      match_field: "description",
      match_type: "contains",
      match_value: "",
      action_category_id: "",
      action_account_id: "",
      action_rename: "",
      priority: "0",
    },
  });

  const { data: categories } = useBudgetCategories();
  const { data: accounts } = useAccounts();
  const activeAccounts = accounts?.filter((a) => a.is_active) ?? [];
  const createMutation = useCreateTransactionRule();
  const updateMutation = useUpdateTransactionRule();

  const isPending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!open) return;
    if (rule) {
      form.reset({
        name: rule.name,
        match_field: rule.match_field,
        match_type: rule.match_type,
        match_value: rule.match_value,
        action_category_id: rule.action_category_id ?? "",
        action_account_id: rule.action_account_id ?? "",
        action_rename: rule.action_rename ?? "",
        priority: String(rule.priority),
      });
    } else {
      form.reset({
        name: "",
        match_field: "description",
        match_type: "contains",
        match_value: "",
        action_category_id: "",
        action_account_id: "",
        action_rename: "",
        priority: "0",
      });
    }
  }, [rule, open, form]);

  const onSubmit = async (values: RuleFormValues) => {
    let hasError = false;
    if (!values.name.trim()) {
      form.setError("name", { message: "El nombre es obligatorio" });
      hasError = true;
    }
    if (!values.match_value.trim()) {
      form.setError("match_value", { message: "El valor de búsqueda es obligatorio" });
      hasError = true;
    }
    if (hasError) return;

    const payload = {
      name: values.name.trim(),
      match_field: values.match_field as "description" | "notes",
      match_type: values.match_type as "contains" | "starts_with" | "exact",
      match_value: values.match_value.trim(),
      action_category_id: values.action_category_id || null,
      action_account_id: values.action_account_id || null,
      action_rename: values.action_rename.trim() || null,
      priority: parseInt(values.priority, 10) || 0,
      // Editing an inactive rule keeps it inactive.
      is_active: rule?.is_active ?? true,
    };

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: rule.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
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
            {isEditing ? "Editar regla" : "Nueva regla"}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? "Qué busca y qué aplica." : "Se aplica al cargar una transacción que coincide."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la regla</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Mercadolibre → Compras"
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
                name="match_field"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Campo a buscar</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MATCH_FIELDS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {MATCH_FIELD_LABELS[f]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="match_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de coincidencia</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isPending}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MATCH_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {MATCH_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="match_value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor a buscar</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: mercadolibre, netflix, uber..."
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
              name="action_category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asignar categoría</FormLabel>
                  <FormControl>
                    <CategoryCombobox
                      categories={categories ?? []}
                      value={field.value}
                      onValueChange={field.onChange}
                      allowEmpty
                      emptyLabel="Sin categoría"
                      grouped
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="action_account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asignar cuenta</FormLabel>
                  <FormControl>
                    <AccountCombobox
                      accounts={activeAccounts}
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
              name="action_rename"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Renombrar a (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nuevo nombre para la transacción..."
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
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridad (0 = más alta)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      disabled={isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? <Spinner className="size-3.5" /> : null}
                {isPending
                  ? "Guardando…"
                  : isEditing
                    ? "Guardar"
                    : "Crear regla"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function TransactionRulesSection() {
  const { data: rules, isLoading, isError, error, refetch } = useTransactionRules();
  const deleteMutation = useDeleteTransactionRule();
  const confirm = useConfirm();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] =
    useState<TransactionRuleWithCategory | null>(null);

  const handleCreate = () => {
    setEditingRule(null);
    setDialogOpen(true);
  };

  const handleEdit = (rule: TransactionRuleWithCategory) => {
    setEditingRule(rule);
    setDialogOpen(true);
  };

  const handleDelete = async (rule: TransactionRuleWithCategory) => {
    // Rules only suggest values while a transaction is entered; nothing
    // references them afterwards.
    const confirmed = await confirm({
      title: `¿Borrar la regla "${rule.name}"?`,
      description: "Las transacciones ya cargadas no cambian.",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(rule.id);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const renderContent = () => {
    if (isLoading) return <StateCard variant="loading" className="min-h-48" />;
    // A failed refresh keeps what is on screen (QueryProvider says it failed).
    if (isError && !rules) {
      return <StateCard variant="error" error={error} onRetry={() => refetch()} className="min-h-48" />;
    }
    if (!rules || rules.length === 0) {
      return (
        <StateCard
          variant="empty"
          icon={ListFilter}
          title="Sin reglas"
          description="Categorizan, asignan cuenta o renombran según la descripción o las notas."
          className="min-h-48"
        />
      );
    }
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Condición</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead>Renombrar</TableHead>
              <TableHead className="w-14 text-right">Prio</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">
                  <div className="flex max-w-56 items-center gap-2">
                    <TruncatedText>{rule.name}</TruncatedText>
                    {!rule.is_active && (
                      <Badge variant="outline" className="shrink-0">
                        Inactiva
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex max-w-72 items-center gap-1.5">
                    <span className="shrink-0 text-muted-foreground">
                      {MATCH_FIELD_LABELS[rule.match_field]}
                    </span>
                    <Badge variant="secondary" className="shrink-0">
                      {MATCH_TYPE_LABELS[rule.match_type]}
                    </Badge>
                    <TruncatedText className="font-mono text-xs">
                      &quot;{rule.match_value}&quot;
                    </TruncatedText>
                  </div>
                </TableCell>
                <TableCell>
                  {rule.category_name ? (
                    <TruncatedText className="max-w-40">{rule.category_name}</TruncatedText>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {rule.account_name ? (
                    <TruncatedText className="max-w-40">{rule.account_name}</TruncatedText>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <TruncatedText className="max-w-40">{rule.action_rename ?? "—"}</TruncatedText>
                </TableCell>
                <TableCell>
                  <NumericCell value={rule.priority} decimals={0} />
                </TableCell>
                <TableCell className="text-right">
                  <RowActions
                    actions={[
                      { label: "Editar", icon: Pencil, onSelect: () => handleEdit(rule) },
                      {
                        label: "Borrar",
                        icon: Trash2,
                        destructive: true,
                        onSelect: () => void handleDelete(rule),
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Section
      title="Reglas"
      description="Completan categoría, cuenta o nombre al cargar una transacción que coincide."
      actions={
        <PageButton variant="outline" icon={Plus} onClick={handleCreate}>
          Nueva regla
        </PageButton>
      }
    >
      {renderContent()}

      <RuleDialog
        rule={editingRule}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </Section>
  );
}
