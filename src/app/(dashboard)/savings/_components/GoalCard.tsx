"use client";

import { Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatAmount } from "@/lib/format";
import type { SavingsGoalWithRelations } from "@/types/savings-goals";

interface GoalCardProps {
  goal: SavingsGoalWithRelations;
  onEdit: (goal: SavingsGoalWithRelations) => void;
  onDelete: (goal: SavingsGoalWithRelations) => void;
}

export function GoalCard({ goal, onEdit, onDelete }: GoalCardProps) {
  const progressPct = Math.min(100, goal.progress_pct);
  const deadlineStr = goal.deadline
    ? // Parse as local midnight: bare date strings parse as UTC and render
      // one day early west of Greenwich.
      new Date(`${goal.deadline}T00:00:00`).toLocaleDateString("es-AR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <Card className="relative overflow-hidden">
      {/* Color accent bar */}
      <div
        className="absolute top-0 left-0 h-1 w-full"
        style={{ backgroundColor: goal.color }}
      />
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              {goal.name}
              {goal.is_completed && (
                <CheckCircle2 className="size-4 text-green-600" />
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              {goal.account_name && (
                <span className="mr-2">{goal.account_name}</span>
              )}
              {deadlineStr && <span>Límite: {deadlineStr}</span>}
            </CardDescription>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" aria-label="Editar meta" onClick={() => onEdit(goal)}>
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Eliminar meta" onClick={() => onDelete(goal)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold">
            {goal.currency_symbol} {formatAmount(goal.current_amount)}
          </span>
          <span className="text-muted-foreground text-sm">
            de {goal.currency_symbol} {formatAmount(goal.target_amount)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                backgroundColor: goal.color,
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progressPct.toFixed(0)}% completado</span>
            {!goal.is_completed && goal.target_amount > goal.current_amount && (
              <span>
                Faltan {goal.currency_symbol}{" "}
                {formatAmount(goal.target_amount - goal.current_amount)}
              </span>
            )}
          </div>
        </div>

        {goal.is_completed && (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Meta completada
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
