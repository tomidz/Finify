"use client";

import { useState } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { PageButton } from "@/components/page-button";
import { RowActions } from "@/components/row-actions";
import { StateCard } from "@/components/state-card";
import { TruncatedText } from "@/components/truncated-text";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/hooks/use-confirm";
import { useBudgetCategories, useDeleteCategory } from "@/hooks/useBudget";
import { useUsageCounts } from "@/hooks/useTransactions";
import { useShortcut } from "@/lib/keyboard";
import { BUDGET_CATEGORY_LABELS } from "@/types/budget";
import type { BudgetCategory } from "@/types/budget";
import { CategoryDialog } from "../_components/CategoryDialog";

/**
 * What deleting a category takes with it (FKs in 0006, 0004 and 0011): its
 * budget lines and every month's plan are deleted; transactions, recurring
 * templates and rules keep existing without a category.
 */
function deleteCategoryDescription(transactionCount: number | undefined) {
  const uncategorized =
    transactionCount === undefined
      ? "sus transacciones, recurrentes y reglas quedan"
      : transactionCount === 0
        ? "sus recurrentes y reglas quedan"
        : `sus ${transactionCount} ${transactionCount === 1 ? "transacción" : "transacciones"}, recurrentes y reglas quedan`;
  return `Se borra su plan de todos los meses; ${uncategorized} sin categoría.`;
}

export default function BudgetCategoriesPage() {
  const { data: categories, isLoading, isError, error, refetch } = useBudgetCategories();
  const { data: usageCounts } = useUsageCounts();
  const deleteMutation = useDeleteCategory();
  const confirm = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetCategory | null>(null);

  const handleCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  useShortcut("n", handleCreate);

  const handleEdit = (cat: BudgetCategory) => {
    setEditing(cat);
    setDialogOpen(true);
  };

  const handleDelete = async (cat: BudgetCategory) => {
    const confirmed = await confirm({
      title: `¿Borrar "${cat.name}"?`,
      description: deleteCategoryDescription(
        !usageCounts ? undefined : (usageCounts.categoryCounts[cat.id] ?? 0),
      ),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(cat.id);
    } catch {
      // toast in hook
    }
  };

  const content = (() => {
    if (isLoading) {
      return (
        <StateCard variant="loading">
          <Skeleton className="h-64 w-full rounded-md" />
        </StateCard>
      );
    }

    // A failed refresh keeps what is on screen (QueryProvider says it failed).
    if (isError && error && !categories) {
      return (
        <StateCard
          variant="error"
          title="No se pudieron cargar las categorías"
          error={error}
          onRetry={() => void refetch()}
        />
      );
    }

    if (!categories || categories.length === 0) {
      return (
        <StateCard
          variant="empty"
          icon={Tags}
          title="Sin categorías"
          action={
            <PageButton variant="outline" icon={Plus} onClick={handleCreate}>
              Nueva categoría
            </PageButton>
          }
        />
      );
    }

    return (
      <div className="rounded-md border">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo de movimiento</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((cat) => (
              <TableRow key={cat.id}>
                <TableCell className="w-1/2 max-w-0 font-medium">
                  <TruncatedText>{cat.name}</TruncatedText>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {BUDGET_CATEGORY_LABELS[cat.category_type]}
                </TableCell>
                <TableCell className="py-1 text-right">
                  <RowActions
                    actions={[
                      { label: "Editar", icon: Pencil, onSelect: () => handleEdit(cat) },
                      {
                        label: "Borrar",
                        icon: Trash2,
                        destructive: true,
                        disabled: deleteMutation.isPending,
                        onSelect: () => void handleDelete(cat),
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
  })();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderTitleGroup>
          <PageHeaderTitle breadcrumb={[{ label: "Presupuesto", href: "/budget" }]}>
            Categorías
          </PageHeaderTitle>
          <PageHeaderDescription>Cada categoría tiene un tipo de movimiento.</PageHeaderDescription>
        </PageHeaderTitleGroup>
        <PageHeaderActions>
          <PageButton icon={Plus} kbd="N" onClick={handleCreate}>
            Nueva categoría
          </PageButton>
        </PageHeaderActions>
      </PageHeader>

      {content}

      <CategoryDialog
        category={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
