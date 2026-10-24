import { BarChart3, FolderKanban, Settings, TrendingUp, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/cartera", label: "Cartera", icon: Wallet },
  { href: "/proyectos", label: "Proyectos", icon: FolderKanban },
  { href: "/por-promover", label: "Por promover", icon: TrendingUp },
  { href: "/reporte-semanal", label: "Reporte semanal", icon: BarChart3 },
  { href: "/ajustes", label: "Ajustes y equipo", icon: Settings },
];

/** Returns the item whose route matches `pathname` (exactly or as a segment prefix). */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
