"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { currentYearMonth } from "@/lib/dates";
import {
  MONTH_SHORT_NAMES,
  adjacentYear,
  initialGridYear,
  monthGridCells,
  monthLabel,
  monthYears,
  type MonthOption,
  type YearMonth,
} from "@/lib/month-grid";
import { cn } from "@/lib/utils";

export interface MonthGridProps<T extends MonthOption> {
  /** The user's months, any order. Calendar months not in the list are disabled. */
  months: readonly T[];
  /** Selected month id; with `end`, the start of a range (either order). */
  start?: string | null;
  end?: string | null;
  onSelect: (month: T) => void;
  /** Hovered month, null when the pointer leaves the grid. */
  onHover?: (month: T | null) => void;
  /** Year shown first; defaults to the selection's year. */
  defaultYear?: number;
  /** Marked as today; defaults to the current month in the app's timezone. */
  current?: YearMonth;
  className?: string;
}

/** One year of months with ‹ › between the years that have months. */
export function MonthGrid<T extends MonthOption>({
  months,
  start,
  end,
  onSelect,
  onHover,
  defaultYear,
  current,
  className,
}: MonthGridProps<T>) {
  const today = current ?? currentYearMonth();
  const [year, setYear] = useState(() => defaultYear ?? initialGridYear(months, start, today));
  const years = monthYears(months);
  const prevYear = adjacentYear(years, year, -1);
  const nextYear = adjacentYear(years, year, 1);
  const cells = monthGridCells(months, year, { start, end, current: today });

  return (
    <div className={cn("flex w-56 flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon-xs"
          className="transition-none"
          aria-label="Año anterior"
          disabled={prevYear === null}
          onClick={() => prevYear !== null && setYear(prevYear)}
        >
          <ChevronLeft />
        </Button>
        <span className="text-xs font-medium tabular-nums">{year}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="transition-none"
          aria-label="Año siguiente"
          disabled={nextYear === null}
          onClick={() => nextYear !== null && setYear(nextYear)}
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1" onMouseLeave={() => onHover?.(null)}>
        {cells.map((cell) => (
          <button
            key={cell.month}
            type="button"
            disabled={!cell.option}
            aria-pressed={cell.isEndpoint}
            aria-current={cell.isCurrent ? "date" : undefined}
            aria-label={monthLabel({ year, month: cell.month })}
            onClick={() => cell.option && onSelect(cell.option)}
            onMouseEnter={() => cell.option && onHover?.(cell.option)}
            className={cn(
              "relative h-7 rounded-md text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              "disabled:cursor-default disabled:text-muted-foreground/50",
              cell.isInRange && "bg-accent text-accent-foreground",
              cell.isEndpoint
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "enabled:hover:bg-accent enabled:hover:text-accent-foreground",
            )}
          >
            {MONTH_SHORT_NAMES[cell.month - 1]}
            {!cell.isCurrent ? null : (
              <span className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
