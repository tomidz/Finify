"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { CommandPalette } from "@/components/command-palette";
import { usePageCrumbs } from "@/components/page-crumbs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { navItemForPath } from "@/lib/nav";

/** The canvas card's sticky top bar: sidebar toggle, the page's breadcrumb, search. */
export function AppHeader() {
  const label = navItemForPath(usePathname())?.label;
  const crumbs = usePageCrumbs();
  const trail = crumbs ?? (label ? [{ label }] : []);

  return (
    <header className="sticky top-0 z-20 shrink-0 border-b-[0.5px] border-canvas-border bg-canvas p-4">
      <div className="flex h-7 w-full items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          {trail.length === 0 ? null : (
            <Breadcrumb>
              <BreadcrumbList className="flex-nowrap text-xs">
                {trail.map((crumb, index) => (
                  <Fragment key={`${index}-${crumb.label}`}>
                    {/* Only the page's own crumb shows on a phone. */}
                    {index === 0 ? null : <BreadcrumbSeparator className="hidden md:block" />}
                    <BreadcrumbItem className={index < trail.length - 1 ? "hidden md:inline-flex" : "min-w-0"}>
                      {crumb.href && index < trail.length - 1 ? (
                        <BreadcrumbLink asChild>
                          <Link href={crumb.href}>{crumb.label}</Link>
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage className="max-w-48 truncate">{crumb.label}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          )}
        </div>
        <CommandPalette />
      </div>
    </header>
  );
}
