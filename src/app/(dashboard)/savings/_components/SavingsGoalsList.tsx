"use client";

import { useState } from "react";
import { Plus, Target } from "lucide-react";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderTitle,
  PageHeaderTitleGroup,
} from "@/components/ui/page-header";
import { PageButton } from "@/components/page-button";
import { StateCard } from "@/components/state-card";
import { useConfirm } from "@/hooks/use-confirm";
import { useSavingsGoals, useDeleteSavingsGoal } from "@/hooks/useSavingsGoals";
import { useShortcut } from "@/lib/keyboard";
import type { SavingsGoalWithRelations } from "@/types/savings-goals";
import { GoalCard } from "./GoalCard";
import { GoalDialog } from "./GoalDialog";

export function SavingsGoalsList() {
  const { data: goals, isLoading, isError, error, refetch } = useSavingsGoals();
  const deleteMutation = useDeleteSavingsGoal();
  const confirm = useConfirm();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoalWithRelations | null>(null);

  const handleCreate = () => {
    setEditingGoal(null);
    setDialogOpen(true);
  };
  useShortcut("n", handleCreate);

  const handleEdit = (goal: SavingsGoalWithRelations) => {
    setEditingGoal(goal);
    setDialogOpen(true);
  };

  const handleDelete = async (goal: SavingsGoalWithRelations) => {
    // Nothing references a goal: its account and transactions stay as they are.
    const confirmed = await confirm({
      title: `¿Borrar la meta "${goal.name}"?`,
      description: "Solo se borra la meta; cuentas y movimientos no cambian.",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(goal.id);
    } catch {
      // Error handled by mutation onError (toast)
    }
  };

  const renderContent = () => {
    if (isLoading) return <StateCard variant="loading" className="min-h-48" />;
    // A failed refresh keeps what is on screen (QueryProvider says it failed).
    if (isError && error && !goals) {
      return <StateCard variant="error" error={error} onRetry={() => refetch()} className="min-h-48" />;
    }
    if (!goals || goals.length === 0) {
      return (
        <StateCard
          variant="empty"
          icon={Target}
          title="Sin metas"
          description="Creá una para seguir tu ahorro."
          action={
            <PageButton variant="outline" icon={Plus} onClick={handleCreate}>
              Nueva meta
            </PageButton>
          }
          className="min-h-48"
        />
      );
    }
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onEdit={handleEdit}
            onDelete={(target) => void handleDelete(target)}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <PageHeader>
        <PageHeaderTitleGroup>
          <PageHeaderTitle>Metas de ahorro</PageHeaderTitle>
          <PageHeaderDescription>Un monto objetivo y, si querés, una fecha límite.</PageHeaderDescription>
        </PageHeaderTitleGroup>
        <PageHeaderActions>
          <PageButton icon={Plus} kbd="N" onClick={handleCreate}>
            Nueva meta
          </PageButton>
        </PageHeaderActions>
      </PageHeader>

      {renderContent()}

      <GoalDialog
        goal={editingGoal}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
