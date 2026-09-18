import * as React from "react";
import { CircleAlert, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/action-result";
import { uiScale } from "@/lib/ui-scale";
import { cn } from "@/lib/utils";

export type StateCardProps = {
  className?: string;
  /** "compact": no minimum height and less padding, for a line inside a card. */
  size?: "default" | "compact";
} & (
  | {
      variant: "loading";
      /** Defaults to "Cargando…". */
      label?: string;
      /** A skeleton to show instead of the spinner. */
      children?: React.ReactNode;
    }
  | {
      variant: "empty";
      icon?: LucideIcon;
      title: React.ReactNode;
      description?: React.ReactNode;
      action?: React.ReactNode;
    }
  | {
      variant: "error";
      error: unknown;
      /** Defaults to "No se pudo cargar". */
      title?: React.ReactNode;
      onRetry?: () => void;
    }
);

// The same minimum height in every state, so a block does not jump as it
// loads, fails or turns out empty. Size it to the loaded block with className.
const FRAME = "min-h-40 rounded-lg border border-dashed";
const CENTERED = "flex flex-col items-center justify-center gap-1 p-6 text-center";
const COMPACT = "rounded-lg border border-dashed flex flex-col items-center justify-center gap-1 p-3 text-center";

/** A block's loading, empty or error state. */
export function StateCard(props: StateCardProps) {
  const frame = props.size === "compact" ? COMPACT : cn(FRAME, CENTERED);
  if (props.variant === "loading") {
    if (props.children) {
      return (
        <div data-slot="state-card" data-variant="loading" aria-busy className={cn("min-h-40", props.className)}>
          {props.children}
        </div>
      );
    }
    return (
      <div data-slot="state-card" data-variant="loading" aria-busy className={cn(frame, props.className)}>
        <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner aria-hidden className="size-3.5" />
          {props.label ?? "Cargando…"}
        </div>
      </div>
    );
  }

  if (props.variant === "empty") {
    const Icon = props.icon;
    return (
      <div data-slot="state-card" data-variant="empty" className={cn(frame, props.className)}>
        {!Icon ? null : <Icon aria-hidden className="mb-1 size-5 text-muted-foreground" />}
        <p className="text-sm font-medium">{props.title}</p>
        {!props.description ? null : (
          <p className="max-w-sm text-xs text-muted-foreground">{props.description}</p>
        )}
        {!props.action ? null : <div className="mt-2">{props.action}</div>}
      </div>
    );
  }

  return (
    <div data-slot="state-card" data-variant="error" role="alert" className={cn(frame, props.className)}>
      <CircleAlert aria-hidden className="mb-1 size-5 text-destructive" />
      <p className="text-sm font-medium">{props.title ?? "No se pudo cargar"}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{errorMessage(props.error)}</p>
      {!props.onRetry ? null : (
        <Button variant="outline" size="sm" className={cn("mt-2", uiScale.button)} onClick={props.onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
