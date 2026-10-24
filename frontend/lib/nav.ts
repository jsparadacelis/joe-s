import { BarChart3, FolderKanban, Settings, TrendingUp, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/portfolio", label: "Cartera", icon: Wallet },
  { href: "/projects", label: "Proyectos", icon: FolderKanban },
  { href: "/to-promote", label: "Por promover", icon: TrendingUp },
  { href: "/weekly-report", label: "Reporte semanal", icon: BarChart3 },
  { href: "/settings", label: "Ajustes y equipo", icon: Settings },
];

/** Returns the item whose route matches `pathname` (exactly or as a segment prefix). */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
