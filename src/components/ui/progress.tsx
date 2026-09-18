"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/** `value` as a 0–100 share of `max`. Out-of-range values are clamped: Radix treats them as indeterminate. */
export function progressPercent(value: number | null | undefined, max = 100): number {
  if (value == null || !Number.isFinite(value) || !(max > 0)) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

function Progress({
  className,
  value,
  max = 100,
  indicatorClassName,
  indicatorColor,
  ...props
}: Omit<React.ComponentProps<typeof ProgressPrimitive.Root>, "max"> & {
  max?: number;
  /** E.g. `bg-destructive` for an overspent budget. */
  indicatorClassName?: string;
  /** A CSS color, for bars colored by user data (a savings goal's color). */
  indicatorColor?: string;
}) {
  const percent = progressPercent(value, max);
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/15", className)}
      value={percent}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("h-full w-full bg-primary", indicatorClassName)}
        style={{
          transform: `translateX(-${100 - percent}%)`,
          backgroundColor: indicatorColor,
        }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
