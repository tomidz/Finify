import * as React from "react";

import { cn } from "@/lib/utils";

export type SectionProps = Omit<React.ComponentProps<"section">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Controls on the right of the title, e.g. PageButtons. */
  actions?: React.ReactNode;
};

/** A titled block inside a page, under the PageHeader. */
export function Section({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      data-slot="section"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {!description ? null : (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {!actions ? null : (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </section>
  );
}
