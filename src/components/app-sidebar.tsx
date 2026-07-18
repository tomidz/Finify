"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Landmark,
  Settings,
  LogOut,
  type LucideIcon,
  BarChart3,
  CalendarDays,
  Wallet,
  Layers,
  ArrowLeftRight,
  CreditCard,
  TrendingUp,
  Repeat,
  Sparkles,
  Target,
} from "lucide-react";

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

type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
};

const PRIMARY_NAV: NavItem[] = [
  { href: "/", icon: Home, label: "Dashboard" },
  { href: "/aicfo", icon: Sparkles, label: "AI CFO" },
  { href: "/transactions", icon: ArrowLeftRight, label: "Transacciones" },
  { href: "/budget", icon: CalendarDays, label: "Presupuesto" },
  { href: "/recurring", icon: Repeat, label: "Recurrentes" },
];

const ASSETS_NAV: NavItem[] = [
  { href: "/accounts", icon: Landmark, label: "Cuentas" },
  { href: "/investments", icon: TrendingUp, label: "Inversiones" },
  { href: "/debts", icon: CreditCard, label: "Deudas" },
  { href: "/savings", icon: Target, label: "Metas de Ahorro" },
  { href: "/net-worth", icon: BarChart3, label: "Patrimonio" },
];

const CONFIG_NAV: NavItem[] = [
  { href: "/budget/categories", icon: Layers, label: "Categorías" },
  { href: "/settings", icon: Settings, label: "Configuración" },
];

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
  items: NavItem[];
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
                  <Link href={item.href}>
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
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
      <SidebarHeader className="border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              tooltip="Finify"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Link href="/">
                <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Wallet className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Finify</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Finanzas personales
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavSection label="General" items={PRIMARY_NAV} pathname={pathname} />
        <NavSection label="Patrimonio" items={ASSETS_NAV} pathname={pathname} />
        <NavSection label="Ajustes" items={CONFIG_NAV} pathname={pathname} />
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
