"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronsUpDown, LogOut, Moon, Settings, Sun, Wallet } from "lucide-react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { NAV_SECTIONS, navItemForPath, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

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

const PRIMARY_BUTTON =
  "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground data-[active=true]:bg-primary/90 data-[active=true]:text-primary-foreground";

const PRIMARY_ITEMS = NAV_SECTIONS.flatMap((section) => section.items.filter((item) => item.primary));

function NavLinks({ items }: { items: readonly NavItem[] }) {
  const activeHref = navItemForPath(usePathname())?.href;
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.href === activeHref;
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              size="sm"
              isActive={active}
              className={cn("text-xs", item.primary && PRIMARY_BUTTON)}
            >
              <HoverPrefetchLink
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpenMobile(false)}
              >
                <Icon />
                <span className={active ? "font-bold" : undefined}>{item.label}</span>
              </HoverPrefetchLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

const THEMES = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
];

// Mounted only while the menu is open, so the stored theme is never read
// during server rendering or hydration.
function ThemeOptions() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
      {THEMES.map(({ value, label }) => (
        <DropdownMenuRadioItem key={value} value={value} className="text-xs">
          {label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

function UserSummary({ email }: { email: string }) {
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-xs font-medium uppercase">
        {email.slice(0, 1) || "?"}
      </span>
      <span className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate text-xs text-muted-foreground">{email}</span>
      </span>
    </>
  );
}

function NavUser({ email }: { email: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <UserSummary email={email} />
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="flex items-center gap-2 font-normal">
              <UserSummary email={email} />
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="text-xs">
              <Link href="/settings" onClick={() => setOpenMobile(false)}>
                <Settings />
                Configuración
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="text-xs">
              <a href="/auth/logout">
                <LogOut />
                Cerrar sesión
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar({ userEmail }: { userEmail: string }) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader>
        <Link href="/" className="flex h-8 items-center gap-2 px-2" onClick={() => setOpenMobile(false)}>
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Wallet className="size-3.5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Finify</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Principal">
          <SidebarGroup>
            <NavLinks items={PRIMARY_ITEMS} />
          </SidebarGroup>
          {NAV_SECTIONS.map((section) => (
            <SidebarGroup key={section.label}>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <NavLinks items={section.items.filter((item) => !item.primary)} />
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton size="sm" className="text-xs">
                      <Sun className="dark:hidden" />
                      <Moon className="hidden dark:block" />
                      <span>Tema</span>
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start">
                    <ThemeOptions />
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser email={userEmail} />
      </SidebarFooter>
    </Sidebar>
  );
}
