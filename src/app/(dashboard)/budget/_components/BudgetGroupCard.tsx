"use client";

import { BUDGET_STATUS_COLORS } from "@/components/charts/palette";
import { NumericCell } from "@/components/numeric-cell";
import { TruncatedText } from "@/components/truncated-text";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { budgetExecution, type BudgetExecution, type BudgetGroup } from "@/lib/finance/budget-status";
import type { BudgetCategory } from "@/types/budget";
import { PlanAmountCell } from "./PlanAmountCell";

/** "95%", "sin plan", or "—" while the actual amount is unknown. */
export function StatusPercent({ execution, known = true }: { execution: BudgetExecution; known?: boolean }) {
  if (!known) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums" style={{ color: BUDGET_STATUS_COLORS[execution.status] }}>
      {execution.percent != null ? `${execution.percent.toFixed(0)}%` : "sin plan"}
    </span>
  );
}

export interface BudgetGroupRow {
  category: BudgetCategory;
  planned: number;
  actual: number;
}

interface BudgetGroupCardProps {
  label: string;
  group: BudgetGroup;
  rows: readonly BudgetGroupRow[];
  plannedTotal: number;
  /** The group's executed amount; null while unknown. */
  actualTotal: number | null;
  decimals: number;
  onOpenCategory: (category: BudgetCategory) => void;
  onSavePlan: (category: BudgetCategory, amount: number) => Promise<boolean>;
}

/** One category type: its categories' plan (editable) and execution, and the total. */
export function BudgetGroupCard({
  label,
  group,
  rows,
  plannedTotal,
  actualTotal,
  decimals,
  onOpenCategory,
  onSavePlan,
}: BudgetGroupCardProps) {
  const totalExecution = budgetExecution(group, plannedTotal, actualTotal ?? 0);

  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-foreground">{label}</TableHead>
            <TableHead className="w-28 pr-4 text-right">Plan</TableHead>
            <TableHead className="w-24 text-right">Ejecutado</TableHead>
            <TableHead className="w-14 text-right">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ category, planned, actual }) => (
            <TableRow key={category.id} className="cursor-pointer" onClick={() => onOpenCategory(category)}>
              <TableCell className="w-full max-w-0">
                <button
                  type="button"
                  className="block max-w-full text-left outline-none hover:underline focus-visible:underline"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenCategory(category);
                  }}
                >
                  <TruncatedText>{category.name}</TruncatedText>
                </button>
              </TableCell>
              <TableCell className="py-1">
                <PlanAmountCell
                  value={planned}
                  decimals={decimals}
                  label={`Plan de ${category.name}`}
                  onSave={(amount) => onSavePlan(category, amount)}
                />
              </TableCell>
              <TableCell>
                <NumericCell
                  value={actual}
                  decimals={decimals}
                  className={actual === 0 ? "text-muted-foreground" : undefined}
                />
              </TableCell>
              <TableCell className="text-right">
                {actual === 0 ? null : <StatusPercent execution={budgetExecution(group, planned, actual)} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell>Total</TableCell>
            <TableCell className="pr-4">
              <NumericCell value={plannedTotal} decimals={decimals} />
            </TableCell>
            <TableCell>
              <NumericCell value={actualTotal} decimals={decimals} />
            </TableCell>
            <TableCell className="text-right">
              <StatusPercent execution={totalExecution} known={actualTotal !== null} />
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </section>
  );
}
