import * as React from "react";

import { RenderErrorBoundary } from "@/components/render-error-boundary";
import { StateCard } from "@/components/state-card";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ChartCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Header controls, top right. */
  actions?: React.ReactNode;
  /** Body height in px, the same in every state. Default 250. */
  height?: number;
  /** No data yet. */
  loading?: boolean;
  /** Shown instead of the chart; pass it only when there is nothing else to show. */
  error?: unknown;
  onRetry?: () => void;
  /** Loaded, but nothing to plot. */
  empty?: boolean;
  /** Defaults to "Sin datos". */
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  /** Names the chart in the crash log. */
  name?: string;
  /** Clears a render crash when any entry changes, e.g. the data. */
  resetKeys?: readonly unknown[];
  className?: string;
  /** The chart, sized to the body: `<ResponsiveContainer width="100%" height="100%">`. */
  children: React.ReactNode;
}

// State cards fill the body instead of drawing a box inside the card.
const STATE_FILL = "h-full min-h-0 border-0";

/** A chart in a card with a fixed-height body, its own loading/empty/error states and crash boundary. */
export function ChartCard({
  title,
  description,
  actions,
  height = 250,
  loading = false,
  error,
  onRetry,
  empty = false,
  emptyTitle = "Sin datos",
  emptyDescription,
  name,
  resetKeys,
  className,
  children,
}: ChartCardProps) {
  const body = loading ? (
    <StateCard variant="loading" className={STATE_FILL} />
  ) : error != null ? (
    <StateCard variant="error" error={error} onRetry={onRetry} className={STATE_FILL} />
  ) : empty ? (
    <StateCard variant="empty" title={emptyTitle} description={emptyDescription} className={STATE_FILL} />
  ) : (
    <RenderErrorBoundary name={name} resetKeys={resetKeys} className={STATE_FILL}>
      {children}
    </RenderErrorBoundary>
  );

  return (
    <Card data-slot="chart-card" className={cn("min-w-0 gap-3 py-4", className)}>
      <div className="flex items-start justify-between gap-2 px-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {!description ? null : <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
        {!actions ? null : <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      <div className="px-4" style={{ height }}>
        {body}
      </div>
    </Card>
  );
}
