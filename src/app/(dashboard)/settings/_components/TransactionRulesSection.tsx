"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CategoryCombobox } from "@/components/category-combobox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
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
            {isEditing
              ? "Modificá los datos de la regla de auto-categorización."
              : "Creá una regla para categorizar transacciones automáticamente."}
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
                          {MATCH_FIELDS.map((f) => (
                            <SelectItem key={f} value={f}>
                              {MATCH_FIELD_LABELS[f]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
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
                          {MATCH_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {MATCH_TYPE_LABELS[t]}
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
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "Guardando..."
                  : isEditing
                    ? "Guardar cambios"
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
  const { data: rules, isLoading, isError } = useTransactionRules();
  const deleteMutation = useDeleteTransactionRule();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] =
    useState<TransactionRuleWithCategory | null>(null);
  const [deletingRule, setDeletingRule] =
    useState<TransactionRuleWithCategory | null>(null);

  const handleCreate = () => {
    setEditingRule(null);
    setDialogOpen(true);
  };

  const handleEdit = (rule: TransactionRuleWithCategory) => {
    setEditingRule(rule);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingRule) return;
    try {
      await deleteMutation.mutateAsync(deletingRule.id);
      setDeletingRule(null);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  // A failed refresh keeps what is on screen (QueryProvider says it failed).
  if (isError && !rules) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground text-sm">
            Error al cargar las reglas. Intentá recargar la página.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Reglas de auto-categorización</CardTitle>
              <CardDescription>
                Definí reglas para categorizar transacciones automáticamente
                según su descripción o notas.
              </CardDescription>
            </div>
            <Button onClick={handleCreate} size="sm">
              <Plus className="mr-1 size-4" />
              Nueva regla
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!rules || rules.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              No hay reglas definidas. Creá una para empezar a categorizar
              automáticamente.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Condición</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Renombrar</TableHead>
                    <TableHead className="w-16 text-center">Prio</TableHead>
                    <TableHead className="w-24 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">
                        {rule.name}
                        {!rule.is_active && (
                          <Badge variant="outline" className="ml-2">
                            Inactiva
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground">
                          {MATCH_FIELD_LABELS[rule.match_field]}{" "}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {MATCH_TYPE_LABELS[rule.match_type]}
                        </Badge>{" "}
                        <span className="font-mono text-xs">
                          &quot;{rule.match_value}&quot;
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {rule.category_name ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {rule.account_name ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {rule.action_rename ?? "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {rule.priority}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Editar regla"
                            onClick={() => handleEdit(rule)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Eliminar regla"
                            onClick={() => setDeletingRule(rule)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RuleDialog
        rule={editingRule}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <Dialog
        open={!!deletingRule}
        onOpenChange={(open) => !open && setDeletingRule(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar regla</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que querés eliminar la regla{" "}
              <span className="font-semibold">{deletingRule?.name}</span>?
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeletingRule(null)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
