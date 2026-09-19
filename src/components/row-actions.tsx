"use client";

import * as React from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface RowAction {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  /** Red, after a separator. */
  destructive?: boolean;
  disabled?: boolean;
  /** Left out, for rows it does not apply to. */
  hidden?: boolean;
}

/**
 * The "…" menu at the end of a table row. Destructive actions go last, after a
 * separator. Clicks stay inside, so a clickable row does not also toggle.
 */
export function RowActions({ actions, className }: { actions: readonly RowAction[]; className?: string }) {
  const visible = actions.filter((action) => !action.hidden);
  if (visible.length === 0) return null;
  const ordered = [...visible.filter((action) => !action.destructive), ...visible.filter((action) => action.destructive)];
  const firstDestructive = ordered.findIndex((action) => action.destructive);
  const stop = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Acciones"
          onClick={stop}
          className={cn("text-muted-foreground data-[state=open]:bg-accent size-7", className)}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40" onClick={stop}>
        {ordered.map((action, index) => (
          <React.Fragment key={`${index}-${action.label}`}>
            {index > 0 && index === firstDestructive ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant={action.destructive ? "destructive" : "default"}
              disabled={action.disabled}
              onSelect={action.onSelect}
              className="text-xs [&_svg:not([class*='size-'])]:size-3.5"
            >
              {!action.icon ? null : <action.icon />}
              {action.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
