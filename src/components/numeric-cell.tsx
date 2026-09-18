import * as React from "react";

import { amountTone, formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface NumericCellProps extends Omit<React.ComponentProps<"span">, "children"> {
  /** null, undefined or non-finite: renders "—", never 0. */
  value: number | null | undefined;
  /** Symbol or code before the amount ("US$", "$"). */
  currency?: string;
  /** Color by sign; muted when it shows as zero. */
  tone?: boolean;
  /** Decimal places (the currency's `decimals`). Default 2. */
  decimals?: number;
  /** "+" before a positive amount, for movements shown with their direction. */
  showPlus?: boolean;
}

/** A right-aligned, tabular-nums amount for table cells. */
export function NumericCell({
  value,
  currency,
  tone = false,
  decimals = 2,
  showPlus = false,
  className,
  ...props
}: NumericCellProps) {
  const known = value != null && Number.isFinite(value);
  const text = !known ? "" : formatAmount(value, decimals);
  const plus = showPlus && known && !text.startsWith("-") && /[1-9]/.test(text) ? "+" : "";
  return (
    <span
      data-slot="numeric-cell"
      className={cn(
        "block text-right whitespace-nowrap tabular-nums",
        !known ? "text-muted-foreground" : tone && amountTone(value, decimals),
        className,
      )}
      {...props}
    >
      {!known ? "—" : `${currency ? `${currency} ` : ""}${plus}${text}`}
    </span>
  );
}
