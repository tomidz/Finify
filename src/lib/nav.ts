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
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
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
      { href: "/aicfo", icon: Sparkles, label: "AI CFO" },
      { href: "/transactions", icon: ArrowLeftRight, label: "Transacciones" },
      { href: "/budget", icon: CalendarDays, label: "Presupuesto" },
      { href: "/recurring", icon: Repeat, label: "Recurrentes" },
    ],
  },
  {
    label: "Patrimonio",
    items: [
      { href: "/accounts", icon: Landmark, label: "Cuentas" },
      { href: "/investments", icon: TrendingUp, label: "Inversiones" },
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
