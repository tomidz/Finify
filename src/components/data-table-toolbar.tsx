import * as React from "react";

import { cn } from "@/lib/utils";

export interface DataTableToolbarProps extends React.ComponentProps<"div"> {
  /** Usually a `SearchInput`: full width on phones, fixed on wider screens. */
  search?: React.ReactNode;
  /** `FilterDropdown`s, next to the search. */
  filters?: React.ReactNode;
  /** Buttons pushed to the right. */
  actions?: React.ReactNode;
}

/** The row above a table: search, filters, actions; `children` go on a second row (e.g. a `FilterChipBar`). */
export function DataTableToolbar({ search, filters, actions, children, className, ...props }: DataTableToolbarProps) {
  return (
    <div data-slot="data-table-toolbar" className={cn("flex flex-col gap-2", className)} {...props}>
      <div className="flex flex-wrap items-center gap-2">
        {!search ? null : <div className="w-full sm:w-64">{search}</div>}
        {!filters ? null : <div className="flex flex-wrap items-center gap-2">{filters}</div>}
        {!actions ? null : <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
