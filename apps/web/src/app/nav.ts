import {
  BookOpen,
  Building2,
  CalendarRange,
  ChartColumn,
  Database,
  FileText,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  SlidersHorizontal,
  Table,
  Users,
  type LucideIcon
} from "lucide-react";
import type { NavCountsResponse } from "@nirmala/shared";
import type { Role } from "../lib/roles";

/**
 * Sidebar navigation (design: frame SksK5 / czg1z / bOLIA). One config, role filtered.
 * Visibility is not access: route access is decided by `roles` in app/routes.tsx.
 */
export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  roles: Role[];
  /** Sidebar count badge: which field of GET /nav-counts to show, and the screen-reader words after the number. */
  badge?: { key: keyof NavCountsResponse; note: string };
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Ringkasan",
    items: [{ label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, roles: ["reviewer", "uki", "leader", "admin"] }]
  },
  {
    label: "Reviu",
    items: [
      { label: "Siklus & Impor", to: "/siklus", icon: Database, roles: ["reviewer", "admin"] },
      { label: "Risk Triage", to: "/triage", icon: Table, roles: ["reviewer", "admin"], badge: { key: "triageUnreviewed", note: "belum ditinjau" } },
      { label: "CHR", to: "/chr", icon: FileText, roles: ["reviewer", "uki", "admin"] }
    ]
  },
  {
    label: "Tindak lanjut",
    items: [
      {
        label: "Smart Tracker",
        to: "/tracker",
        icon: ListChecks,
        roles: ["reviewer", "uki", "admin"],
        badge: { key: "trackerPending", note: "perlu verifikasi" }
      },
      { label: "Progres Satker", to: "/satker", icon: Building2, roles: ["reviewer", "uki", "admin"] }
    ]
  },
  {
    label: "Analisis",
    items: [{ label: "Laporan", to: "/laporan", icon: ChartColumn, roles: ["reviewer", "leader", "admin"] }]
  },
  {
    label: "Administrasi",
    items: [
      { label: "Katalog aturan", to: "/admin/aturan", icon: BookOpen, roles: ["admin"] },
      { label: "Bobot skor", to: "/admin/bobot", icon: SlidersHorizontal, roles: ["admin"] },
      { label: "Pengguna", to: "/admin/pengguna", icon: Users, roles: ["admin"] },
      { label: "Siklus", to: "/admin/siklus", icon: CalendarRange, roles: ["admin"] },
      { label: "Audit log", to: "/admin/audit", icon: ScrollText, roles: ["admin"] }
    ]
  }
];

/** Groups and items visible to a role; empty groups are dropped. */
export function navForRole(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(role)) })).filter((group) => group.items.length > 0);
}

/** Find the nav item (and its group) that owns a pathname, longest prefix wins. */
export function findNav(pathname: string): { group: NavGroup; item: NavItem } | null {
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        if (!best || item.to.length > best.item.to.length) best = { group, item };
      }
    }
  }
  return best;
}
