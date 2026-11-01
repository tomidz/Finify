"use client";

import * as React from "react";

import { type Crumb, PageCrumbs } from "@/components/page-crumbs";
import { cn } from "@/lib/utils";

export type PageHeaderCrumb = { label: string; href: string };

/**
 * A page's first row: what qualifies the page (badges, filters) on the left
 * and its actions on the right, at the toolbar's scale. The top bar's
 * breadcrumb names the page, so title and description are for screen readers
 * only, and a header with nothing else to show takes no room.
 */
function PageHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "flex min-h-7 flex-wrap items-center gap-2",
        "[&:not(:has([data-slot=page-header-actions],[data-slot=badge],[data-slot=skeleton]))]:sr-only",
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
      className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}
      {...props}
    />
  );
}

/**
 * The page's h1, for screen readers. `breadcrumb` lists the pages above it;
 * with it, the top bar shows "Cuentas › Banco X" instead of the section name.
 */
function PageHeaderTitle({
  className,
  breadcrumb,
  children,
  ...props
}: React.ComponentProps<"h1"> & { breadcrumb?: readonly PageHeaderCrumb[] }) {
  const crumbs: Crumb[] | null =
    breadcrumb?.length && typeof children === "string"
      ? [...breadcrumb, { label: children }]
      : null;
  return (
    <>
      <h1 data-slot="page-header-title" className={cn("sr-only", className)} {...props}>
        {children}
      </h1>
      {!crumbs ? null : <PageCrumbs crumbs={crumbs} />}
    </>
  );
}

function PageHeaderDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-header-description"
      className={cn("sr-only", className)}
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
      className={cn("ml-auto flex shrink-0 flex-wrap items-center gap-2", className)}
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
