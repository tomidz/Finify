"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { MonthGrid } from "@/components/month-grid";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { adjacentMonth, monthLabel, type MonthOption } from "@/lib/month-grid";
import { uiScale } from "@/lib/ui-scale";
import { cn } from "@/lib/utils";

export interface MonthSwitcherProps<T extends MonthOption> {
  /** The months the user can pick, any order (e.g. `Month` rows, or `calendarMonths`). */
  months: readonly T[];
  /** Selected month id; null while none is picked. */
  value: string | null;
  onChange: (monthId: string, month: T) => void;
  disabled?: boolean;
  /** Creates the month after the latest one; adds "Nuevo mes" under the grid. */
  onCreateNext?: () => void;
  /** Shows a spinner and locks the switcher while the new month is prepared. */
  creatingNext?: boolean;
  className?: string;
}

/** ‹ [Septiembre 2026] ›: arrows step to the adjacent existing month, the label opens the grid. */
export function MonthSwitcher<T extends MonthOption>({
  months,
  value,
  onChange,
  disabled = false,
  onCreateNext,
  creatingNext = false,
  className,
}: MonthSwitcherProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = months.find((m) => m.id === value) ?? null;
  const prev = adjacentMonth(months, value, -1);
  const next = adjacentMonth(months, value, 1);
  const locked = disabled || creatingNext;

  const pick = (month: T) => {
    setOpen(false);
    onChange(month.id, month);
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        variant="outline"
        size="icon-sm"
        className={cn(uiScale.iconButton, "transition-none")}
        aria-label="Mes anterior"
        disabled={locked || !prev}
        onClick={() => prev && onChange(prev.id, prev)}
      >
        <ChevronLeft />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(uiScale.button, "min-w-36 font-medium tabular-nums transition-none")}
            disabled={locked || months.length === 0}
          >
            {!creatingNext ? null : <Spinner />}
            {!selected ? "—" : monthLabel(selected)}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" collisionPadding={8} className="flex w-auto flex-col gap-2 p-2 animate-none!">
          <MonthGrid months={months} start={value} onSelect={pick} />
          {!onCreateNext ? null : (
            <div className="border-t pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-start text-xs transition-none"
                onClick={() => {
                  setOpen(false);
                  onCreateNext();
                }}
              >
                <Plus />
                Nuevo mes
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="icon-sm"
        className={cn(uiScale.iconButton, "transition-none")}
        aria-label="Mes siguiente"
        disabled={locked || !next}
        onClick={() => next && onChange(next.id, next)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
