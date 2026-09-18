import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type PageHeaderCrumb = { label: string; href: string };

function PageHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function PageHeaderTitleGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-title-group"
      className={cn("flex min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

/**
 * The page's h1. `breadcrumb` lists the pages above it, rendered on the same
 * line as links: "Cuentas / Banco X".
 */
function PageHeaderTitle({
  className,
  breadcrumb,
  ...props
}: React.ComponentProps<"h1"> & { breadcrumb?: readonly PageHeaderCrumb[] }) {
  const title = (
    <h1
      data-slot="page-header-title"
      className={cn(
        "text-lg font-semibold tracking-tight text-foreground",
        className,
      )}
      {...props}
    />
  );
  if (!breadcrumb?.length) return title;

  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      <nav aria-label="Ruta" className="flex items-baseline gap-x-1.5">
        {breadcrumb.map((crumb) => (
          <React.Fragment key={crumb.href}>
            <Link
              href={crumb.href}
              className="text-lg font-semibold tracking-tight text-muted-foreground hover:text-foreground"
            >
              {crumb.label}
            </Link>
            <span aria-hidden className="text-lg text-muted-foreground/60">
              /
            </span>
          </React.Fragment>
        ))}
      </nav>
      {title}
    </div>
  );
}

function PageHeaderDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-header-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function PageHeaderActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-actions"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

export {
  PageHeader,
  PageHeaderTitleGroup,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
};
