"use client";

import * as React from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Says why a control is disabled, on hover or keyboard focus. The tooltip
 * hangs on a wrapper: a disabled button gets no pointer events and no focus.
 * With no `hint`, renders the control alone.
 */
export function DisabledHintTooltip({
  hint,
  side = "top",
  className,
  children,
}: {
  hint: string | null | undefined;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  children: React.ReactNode;
}) {
  if (!hint) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-slot="disabled-hint"
          tabIndex={0}
          className={cn("inline-flex w-fit rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", className)}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-56">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
