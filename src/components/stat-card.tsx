import * as React from "react";
import { type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { amountTone, formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: React.ReactNode;
  /** null or undefined when unknown: renders "—", never 0. */
  value: number | null | undefined;
  /** Symbol before the amount, e.g. "$" or "US$". */
  currency?: string;
  /** Decimal places (the currency's `decimals`). Default 2. */
  decimals?: number;
  /** Defaults to `formatAmount` (es-AR, `decimals` places). */
  format?: (value: number) => string;
  /** Colors the value by its sign (`amountTone`): muted when it rounds to 0. */
  signTone?: boolean;
  /** Smaller text after the value, in its color, e.g. "(12,50%)". */
  suffix?: React.ReactNode;
  /** Muted line(s) under the value. */
  sub?: React.ReactNode;
  /** Tooltip on the label, which gets a dotted underline. */
  hint?: React.ReactNode;
  icon?: LucideIcon;
  /** Skeleton in place of the value (and of `sub`, when given). */
  loading?: boolean;
  className?: string;
}

/** The KPI card: label, amount, optional sub-line. */
export function StatCard({
  label,
  value,
  currency,
  decimals = 2,
  format = (n: number) => formatAmount(n, decimals),
  signTone = false,
  suffix,
  sub,
  hint,
  icon: Icon,
  loading = false,
  className,
}: StatCardProps) {
  const known = value != null && Number.isFinite(value);
  const tone = !known ? "text-muted-foreground" : signTone ? amountTone(value, decimals) : null;

  return (
    <Card data-slot="stat-card" className={cn("min-w-0 gap-1 px-4 py-3", className)}>
      <div className="flex items-center justify-between gap-2">
        {!hint ? (
          <span className="text-muted-foreground truncate text-xs">{label}</span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground w-fit cursor-default truncate text-xs underline decoration-dotted underline-offset-2">
                {label}
              </span>
            </TooltipTrigger>
            <TooltipContent className="animate-none!">{hint}</TooltipContent>
          </Tooltip>
        )}
        {!Icon ? null : <Icon className="text-muted-foreground size-3.5 shrink-0" />}
      </div>
      {loading ? (
        <Skeleton className="h-7 w-28 animate-none" />
      ) : (
        <p className={cn("flex flex-wrap items-baseline gap-x-1.5 text-base leading-7 font-semibold tabular-nums sm:text-xl", tone)}>
          {/* The symbol and the amount never split across lines. */}
          <span className="whitespace-nowrap">{!known ? "—" : `${currency ? `${currency}\u00a0` : ""}${format(value)}`}</span>
          {!known || suffix == null ? null : <span className="text-xs font-medium">{suffix}</span>}
        </p>
      )}
      {sub == null ? null : loading ? (
        <Skeleton className="h-4 w-20 animate-none" />
      ) : (
        <div className="text-muted-foreground flex flex-col text-[11px]">{sub}</div>
      )}
    </Card>
  );
}

const STAT_GRID_COLUMNS = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
  6: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
} as const;

export interface StatGridProps extends React.ComponentProps<"div"> {
  /** Columns on wide screens; phones show two (one for `2`). */
  columns?: keyof typeof STAT_GRID_COLUMNS;
}

/** Responsive grid for a row of StatCards. */
export function StatGrid({ columns = 4, className, ...props }: StatGridProps) {
  return <div data-slot="stat-grid" className={cn("grid gap-3", STAT_GRID_COLUMNS[columns], className)} {...props} />;
}
