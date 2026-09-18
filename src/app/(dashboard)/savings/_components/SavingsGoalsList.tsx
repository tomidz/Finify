"use client";

import { useState } from "react";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useSavingsGoals, useDeleteSavingsGoal } from "@/hooks/useSavingsGoals";
import type { SavingsGoalWithRelations } from "@/types/savings-goals";
import { errorMessage } from "@/lib/action-result";
import { GoalCard } from "./GoalCard";
import { GoalDialog } from "./GoalDialog";

export function SavingsGoalsList() {
  const { data: goals, isLoading, isError, error, refetch } = useSavingsGoals();
  const deleteMutation = useDeleteSavingsGoal();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoalWithRelations | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<SavingsGoalWithRelations | null>(null);

  const handleCreate = () => {
    setEditingGoal(null);
    setDialogOpen(true);
  };

  const handleEdit = (goal: SavingsGoalWithRelations) => {
    setEditingGoal(goal);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingGoal) return;
    try {
      await deleteMutation.mutateAsync(deletingGoal.id);
      setDeletingGoal(null);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-40" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // A failed refresh keeps what is on screen (QueryProvider says it failed).
  if (isError && error && !goals) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
        <p className="text-destructive font-medium">
          Error al cargar las metas de ahorro
        </p>
        <p className="text-muted-foreground mt-1 text-sm">{errorMessage(error)}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={handleCreate} size="sm">
          <Plus className="mr-1 size-4" />
          Nueva meta
        </Button>
      </div>

      {!goals || goals.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <Target className="size-12 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">
              No hay metas de ahorro. Creá una para empezar a trackear tu
              progreso.
            </p>
          </div>
          <Button onClick={handleCreate} variant="outline" size="sm">
            <Plus className="mr-1 size-4" />
            Crear meta
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={handleEdit}
              onDelete={setDeletingGoal}
            />
          ))}
        </div>
      )}

      <GoalDialog
        goal={editingGoal}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <Dialog
        open={!!deletingGoal}
        onOpenChange={(open) => !open && setDeletingGoal(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar meta de ahorro</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que querés eliminar la meta{" "}
              <span className="font-semibold">{deletingGoal?.name}</span>?
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeletingGoal(null)}
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
