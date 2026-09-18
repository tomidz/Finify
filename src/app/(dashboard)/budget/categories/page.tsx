"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useBudgetCategories, useDeleteCategory } from "@/hooks/useBudget";
import { BUDGET_CATEGORY_LABELS } from "@/types/budget";
import type { BudgetCategory } from "@/types/budget";
import { errorMessage } from "@/lib/action-result";
import { CategoryDialog } from "../_components/CategoryDialog";

export default function BudgetCategoriesPage() {
  const { data: categories, isLoading, isError, error } = useBudgetCategories();
  const deleteMutation = useDeleteCategory();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetCategory | null>(null);

  const handleCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (cat: BudgetCategory) => {
    setEditing(cat);
    setDialogOpen(true);
  };

  const handleDelete = async (cat: BudgetCategory) => {
    if (!confirm(`¿Eliminar la categoría "${cat.name}"?`)) return;
    try {
      await deleteMutation.mutateAsync(cat.id);
    } catch {
      // toast in hook
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // A failed refresh keeps what is on screen (QueryProvider says it failed).
  if (isError && error && !categories) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
        <p className="text-destructive font-medium">Error al cargar categorías</p>
        <p className="text-muted-foreground mt-1 text-sm">{errorMessage(error)}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
          <p className="text-muted-foreground text-sm">
            Creá categorías y asignales un tipo de movimiento.
          </p>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="mr-1 size-4" />
          Nueva categoría
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo de movimiento</TableHead>
              <TableHead className="w-24 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!categories || categories.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="h-32 text-center text-muted-foreground"
                >
                  No hay categorías. Creá la primera.
                </TableCell>
              </TableRow>
            ) : (
              categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell>
                    {BUDGET_CATEGORY_LABELS[cat.category_type]}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(cat)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(cat)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CategoryDialog
        category={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
