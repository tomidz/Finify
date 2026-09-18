"use client";

import { Pencil, Trash2, CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { NumericCell } from "@/components/numeric-cell";
import { useCurrencyDecimals } from "@/hooks/useAccounts";
import { RowActions } from "@/components/row-actions";
import { TruncatedText } from "@/components/truncated-text";
import type { SavingsGoalWithRelations } from "@/types/savings-goals";

interface GoalCardProps {
  goal: SavingsGoalWithRelations;
  onEdit: (goal: SavingsGoalWithRelations) => void;
  onDelete: (goal: SavingsGoalWithRelations) => void;
}

export function GoalCard({ goal, onEdit, onDelete }: GoalCardProps) {
  const decimals = useCurrencyDecimals()(goal.currency);
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
  const details = [goal.account_name, deadlineStr ? `Límite: ${deadlineStr}` : null].filter(Boolean);

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="flex min-w-0 items-center gap-1.5 text-sm">
              <TruncatedText>{goal.name}</TruncatedText>
              {goal.is_completed && (
                <CheckCircle2 aria-label="Completada" className="size-3.5 shrink-0 text-muted-foreground" />
              )}
            </CardTitle>
            {details.length === 0 ? null : (
              <CardDescription className="text-xs">{details.join(" · ")}</CardDescription>
            )}
          </div>
          <RowActions
            actions={[
              { label: "Editar", icon: Pencil, onSelect: () => onEdit(goal) },
              { label: "Borrar", icon: Trash2, destructive: true, onSelect: () => onDelete(goal) },
            ]}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4">
        <div className="flex items-baseline justify-between gap-2">
          <NumericCell
            value={goal.current_amount}
            currency={goal.currency_symbol}
            decimals={decimals}
            className="text-left text-xl font-semibold"
          />
          <span className="flex items-baseline gap-1 text-xs text-muted-foreground">
            de
            <NumericCell value={goal.target_amount} currency={goal.currency_symbol} decimals={decimals} className="inline" />
          </span>
        </div>

        <Progress
          value={progressPct}
          indicatorColor={goal.color}
          aria-label={`${progressPct.toFixed(0)}% de ${goal.name}`}
        />
        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>{progressPct.toFixed(0)}%</span>
          {!goal.is_completed && goal.target_amount > goal.current_amount && (
            <span className="flex items-baseline gap-1">
              Faltan
              <NumericCell
                value={goal.target_amount - goal.current_amount}
                currency={goal.currency_symbol}
                decimals={decimals}
                className="inline"
              />
            </span>
          )}
        </div>

        {goal.is_completed && (
          <Badge variant="secondary" className="w-fit">
            Meta completada
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
