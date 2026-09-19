"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Wallet } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NAV_SECTIONS, type NavItem } from "@/lib/nav";

/**
 * The sidebar is on every page, and default prefetching fetched every dynamic
 * route (each one re-running the auth-checking layout) on each load, in
 * parallel with the page's own data. Prefetch only on hover instead.
 */
function HoverPrefetchLink({
  onMouseEnter,
  ...props
}: React.ComponentProps<typeof Link>) {
  const [active, setActive] = useState(false);
  return (
    <Link
      {...props}
      prefetch={active ? null : false}
      onMouseEnter={(event) => {
        setActive(true);
        onMouseEnter?.(event);
      }}
    />
  );
}

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavSection({
  label,
  items,
  pathname,
}: {
  label: string;
  items: readonly NavItem[];
  pathname: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(pathname, item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.label}
                >
                  <HoverPrefetchLink href={item.href}>
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </HoverPrefetchLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      {/* Same height as the page header, so both bottom borders are one line. */}
      <SidebarHeader className="h-16 shrink-0 justify-center border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              tooltip="Finify"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <HoverPrefetchLink href="/">
                <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Wallet className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Finify</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Finanzas personales
                  </span>
                </div>
              </HoverPrefetchLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_SECTIONS.map((section) => (
          <NavSection
            key={section.label}
            label={section.label}
            items={section.items}
            pathname={pathname}
          />
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t">
        {userEmail ? (
          <div className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            <span className="block truncate" title={userEmail}>
              {userEmail}
            </span>
          </div>
        ) : null}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Cerrar sesión"
              className="text-muted-foreground hover:text-foreground"
            >
              <a href="/auth/logout">
                <LogOut className="size-4" />
                <span>Cerrar sesión</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
