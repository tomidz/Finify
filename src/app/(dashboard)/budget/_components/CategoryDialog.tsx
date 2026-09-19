"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateCategory, useUpdateCategory } from "@/hooks/useBudget";
import { CreateCategorySchema } from "@/lib/validations/budget.schema";
import { BUDGET_CATEGORY_TYPES, BUDGET_CATEGORY_LABELS } from "@/types/budget";
import type { BudgetCategory } from "@/types/budget";
import { uiScale } from "@/lib/ui-scale";
import type { z } from "zod";

interface CategoryDialogProps {
  category: BudgetCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CategoryFormValues = z.infer<typeof CreateCategorySchema>;

export function CategoryDialog({
  category,
  open,
  onOpenChange,
}: CategoryDialogProps) {
  const isEditing = !!category;

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(CreateCategorySchema),
    defaultValues: {
      name: "",
      category_type: "essential_expenses",
      monthly_amount: 0,
    },
  });

  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const isPending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (category) {
      form.reset({
        name: category.name,
        category_type: category.category_type,
        monthly_amount: category.monthly_amount ?? 0,
      });
    } else {
      form.reset({
        name: "",
        category_type: "essential_expenses",
        monthly_amount: 0,
      });
    }
  }, [category, open, form]);

  const onSubmit = async (values: CategoryFormValues) => {
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: category.id, ...values });
      } else {
        await createMutation.mutateAsync(values);
      }
      onOpenChange(false);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar categoría" : "Nueva categoría"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modificá el nombre y tipo de movimiento."
              : "Agregá una categoría con su tipo de movimiento."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Alquiler, Supermercado, Sueldo..."
                      disabled={isPending}
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
              name="category_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de movimiento</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending}
                  >
                    <FormControl>
                      <SelectTrigger className={`w-full ${uiScale.trigger}`}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BUDGET_CATEGORY_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {BUDGET_CATEGORY_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button variant="outline" size="sm" className={uiScale.button} type="button" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className={uiScale.button} disabled={isPending}>
                {isPending
                  ? "Guardando..."
                  : isEditing
                    ? "Guardar"
                    : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
