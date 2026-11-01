import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  CreditCard,
  Home,
  Landmark,
  Layers,
  Repeat,
  Settings,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  /** The sidebar's one highlighted item, above the sections. */
  primary?: boolean;
};

export type NavSection = {
  label: string;
  items: readonly NavItem[];
};

/** Every page, as the sidebar groups them. The command palette lists the same. */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    label: "General",
    items: [
      { href: "/", icon: Home, label: "Dashboard" },
      { href: "/aicfo", icon: Sparkles, label: "AI CFO", primary: true },
      { href: "/transactions", icon: ArrowLeftRight, label: "Transacciones" },
      { href: "/budget", icon: CalendarDays, label: "Presupuesto" },
      { href: "/recurring", icon: Repeat, label: "Recurrentes" },
    ],
  },
  {
    label: "Patrimonio",
    items: [
      { href: "/accounts", icon: Landmark, label: "Cuentas" },
      { href: "/debts", icon: CreditCard, label: "Deudas" },
      { href: "/savings", icon: Target, label: "Metas de Ahorro" },
      { href: "/net-worth", icon: BarChart3, label: "Patrimonio" },
    ],
  },
  {
    label: "Ajustes",
    items: [
      { href: "/budget/categories", icon: Layers, label: "Categorías" },
      { href: "/settings", icon: Settings, label: "Configuración" },
    ],
  },
];

const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

export function isUnderHref(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The page a path belongs to: the deepest item it sits under ("/budget/categories" over "/budget"). */
export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter((item) => isUnderHref(item.href, pathname)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}
