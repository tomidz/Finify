"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";

import { MonthGrid } from "@/components/month-grid";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { currentYearMonth } from "@/lib/dates";
import { orderRange, rangeLabel, rangePresets, type MonthOption } from "@/lib/month-grid";
import { uiScale } from "@/lib/ui-scale";
import { cn } from "@/lib/utils";

export interface MonthRangePickerProps<T extends MonthOption> {
  /** The months the user can pick, any order. */
  months: readonly T[];
  startId: string | null;
  endId: string | null;
  /** Always called with start on or before end. */
  onChange: (startId: string, endId: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * One trigger ("Ene – Sep 2026") opening shortcuts and a grid: the first click
 * picks the start, the second the end (an earlier end swaps, the same month
 * collapses to one month).
 */
export function MonthRangePicker<T extends MonthOption>({
  months,
  startId,
  endId,
  onChange,
  disabled = false,
  className,
}: MonthRangePickerProps<T>) {
  const [open, setOpen] = useState(false);
  // The first month clicked, while the second is pending.
  const [anchor, setAnchor] = useState<T | null>(null);
  const [hovered, setHovered] = useState<T | null>(null);

  const start = months.find((m) => m.id === startId);
  const end = months.find((m) => m.id === endId) ?? start;
  const presets = !open ? [] : rangePresets(months, currentYearMonth());

  const openChange = (next: boolean) => {
    setOpen(next);
    setAnchor(null);
    setHovered(null);
  };

  const commit = (from: string, to: string) => {
    openChange(false);
    onChange(...orderRange(months, from, to));
  };

  const select = (month: T) => {
    if (!anchor) setAnchor(month);
    else commit(anchor.id, month.id);
  };

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(uiScale.button, "min-w-36 font-medium tabular-nums transition-none", className)}
          disabled={disabled || months.length === 0}
        >
          <CalendarRange />
          {!start || !end ? "—" : rangeLabel(start, end)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={8} className="flex w-auto flex-col gap-2 p-2 sm:flex-row animate-none!">
        {presets.length === 0 ? null : (
          <div className="flex flex-wrap gap-1 border-b pb-2 sm:w-28 sm:flex-col sm:border-r sm:border-b-0 sm:pr-2 sm:pb-0">
            {presets.map((preset) => {
              const active = preset.start.id === start?.id && preset.end.id === end?.id;
              return (
                <Button
                  key={preset.key}
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 justify-start text-xs transition-none"
                  onClick={() => commit(preset.start.id, preset.end.id)}
                >
                  {preset.label}
                </Button>
              );
            })}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <MonthGrid
            months={months}
            start={anchor ? anchor.id : startId}
            end={anchor ? (hovered ?? anchor).id : endId}
            onSelect={select}
            onHover={setHovered}
          />
          <p className="text-muted-foreground h-4 text-[11px]">{!anchor ? "Elegí el inicio" : "Elegí el fin"}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
