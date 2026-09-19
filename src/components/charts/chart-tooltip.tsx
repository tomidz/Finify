"use client";

import * as React from "react";
import type { TooltipContentProps, TooltipPayloadEntry } from "recharts";

import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

type InjectedProps = Partial<Pick<TooltipContentProps, "active" | "payload" | "label">>;

export interface ChartTooltipProps extends InjectedProps {
  /** Symbol before each amount, e.g. "$". */
  currency?: string;
  /** Header above the rows; defaults to the hovered label (hidden when empty). */
  labelFormatter?: (label: string | number | undefined) => React.ReactNode;
  /** Row name; defaults to the series name. */
  nameFormatter?: (entry: TooltipPayloadEntry) => React.ReactNode;
  /** Swatch color; defaults to the series color, else the data item's `fill`. */
  colorOf?: (entry: TooltipPayloadEntry) => string | undefined;
  hideLabel?: boolean;
  className?: string;
}

/**
 * Tooltip body for any recharts chart:
 * `<Tooltip isAnimationActive={false} content={<ChartTooltip currency="$" />} />`.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  currency,
  labelFormatter,
  nameFormatter,
  colorOf,
  hideLabel = false,
  className,
}: ChartTooltipProps) {
  const rows = (payload ?? []).filter((entry) => !entry.hide && entry.type !== "none");
  if (!active || rows.length === 0) return null;

  const header = hideLabel ? null : labelFormatter ? labelFormatter(label) : label;

  return (
    <div
      className={cn(
        "bg-popover text-popover-foreground flex min-w-32 flex-col gap-1 rounded-md border px-2.5 py-1.5 text-xs shadow-md",
        className,
      )}
    >
      {header == null || header === "" ? null : <p className="font-medium">{header}</p>}
      {rows.map((entry, index) => {
        const value = typeof entry.value === "number" ? entry.value : Number(entry.value);
        const color = colorOf ? colorOf(entry) : (entry.color ?? entry.payload?.fill);
        return (
          <div key={`${String(entry.dataKey ?? entry.name)}-${index}`} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
            <span className="text-muted-foreground">{nameFormatter ? nameFormatter(entry) : entry.name}</span>
            <span className="ml-auto pl-3 font-medium tabular-nums">
              {!Number.isFinite(value) ? "—" : `${currency ? `${currency} ` : ""}${formatAmount(value)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
