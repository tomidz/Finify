import * as React from "react";
import { Info, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export type CalloutProps = Omit<React.ComponentProps<"div">, "title"> & {
  variant?: "info" | "warning";
  /** Bold first line. */
  title?: React.ReactNode;
};

/** A short inline notice. A warning draws a stronger border, not a color. */
export function Callout({
  variant = "info",
  title,
  className,
  children,
  ...props
}: CalloutProps) {
  const Icon = variant === "warning" ? TriangleAlert : Info;
  return (
    <div
      data-slot="callout"
      data-variant={variant}
      role={variant === "warning" ? "alert" : "note"}
      className={cn(
        "flex gap-2 rounded-md border px-3 py-2 text-xs",
        variant === "warning" ? "border-foreground/40" : "bg-muted/40",
        className,
      )}
      {...props}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-px size-3.5 shrink-0",
          variant === "warning" ? "text-foreground" : "text-muted-foreground",
        )}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        {!title ? null : <p className="font-medium">{title}</p>}
        {!children ? null : (
          <div className="text-muted-foreground">{children}</div>
        )}
      </div>
    </div>
  );
}
