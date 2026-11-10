/**
 * THE route table. Every screen in design/SCREENS.md maps to a lazy feature module
 * `features/<fitur>/index.tsx`. Feature agents edit only their own folder; they never edit this file.
 * To add a route: add one entry here (foundation owner), export the component from the feature index.
 */
import { lazy, type ComponentType } from "react";
import type { Role } from "../lib/roles";

export type ShellKind = "app" | "public" | "none";

export interface AppRoute {
  path: string;
  /** Lazy feature component. */
  component: ComponentType;
  /** app = sidebar + header (login required); public = public header/footer; none = bare (login, print, dev). */
  shell: ShellKind;
  /** Screen name: breadcrumb tail, document title and the "Akses ditolak" message. */
  title: string;
  /** Allowed roles. Omitted = any signed-in user (app shell) or anyone (public/none). */
  roles?: Role[];
  /** Force or waive the login requirement. Defaults: required for shell "app" or when `roles` is set. */
  auth?: boolean;
  /** Only registered in `import.meta.env.DEV`. */
  devOnly?: boolean;
}

/* Typed lazy loader: lazyFeature(() => import("../features/triage"), "RiskTriagePage") */
function lazyFeature<M extends Record<string, unknown>, K extends keyof M>(load: () => Promise<M>, name: K): ComponentType {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}

const ALL: Role[] = ["reviewer", "uki", "leader", "admin"];
const ADMIN: Role[] = ["admin"];

export const ROUTES: AppRoute[] = [
  // Publik
  { path: "/", component: lazyFeature(() => import("../features/publik"), "HomePage"), shell: "public", title: "Beranda" },
  { path: "/transparansi", component: lazyFeature(() => import("../features/publik"), "TransparencyPage"), shell: "public", title: "Transparansi" },

  // Masuk
  { path: "/login", component: lazyFeature(() => import("../features/login"), "LoginPage"), shell: "none", title: "Masuk" },

  // S2
  { path: "/dashboard", component: lazyFeature(() => import("../features/dashboard"), "DashboardPage"), shell: "app", title: "Dashboard", roles: ALL },
  // S3
  { path: "/siklus", component: lazyFeature(() => import("../features/impor"), "CycleImportPage"), shell: "app", title: "Siklus & Impor Data", roles: ALL },
  // S4 / S5
  { path: "/triage", component: lazyFeature(() => import("../features/triage"), "RiskTriagePage"), shell: "app", title: "Risk Triage", roles: ALL },
  { path: "/triage/:itemId", component: lazyFeature(() => import("../features/triage"), "ItemDetailPage"), shell: "app", title: "Detail item", roles: ALL },
  // S6 / S7 (/chr is the nav target: list or redirect to the current eselon I CHR)
  { path: "/chr", component: lazyFeature(() => import("../features/chr"), "ChrIndexPage"), shell: "app", title: "CHR", roles: ALL },
  { path: "/chr/:chrId", component: lazyFeature(() => import("../features/chr"), "ChrEditorPage"), shell: "app", title: "CHR", roles: ALL },
  { path: "/chr/:chrId/cetak", component: lazyFeature(() => import("../features/chr"), "ChrPrintPage"), shell: "none", title: "Cetak CHR", roles: ALL },
  // S8 / S9
  { path: "/tracker", component: lazyFeature(() => import("../features/tracker"), "TrackerPage"), shell: "app", title: "Smart Tracker", roles: ALL },
  { path: "/tracker/:noteId", component: lazyFeature(() => import("../features/tracker"), "NoteDetailPage"), shell: "app", title: "Detail catatan", roles: ALL },
  // S10
  { path: "/satker", component: lazyFeature(() => import("../features/satker"), "SatkerProgressPage"), shell: "app", title: "Progres Satker", roles: ALL },
  // S11
  { path: "/laporan", component: lazyFeature(() => import("../features/laporan"), "ReportsPage"), shell: "app", title: "Laporan", roles: ALL },
  // S12 (admin only)
  { path: "/admin/aturan", component: lazyFeature(() => import("../features/admin"), "RuleCatalogPage"), shell: "app", title: "Katalog aturan", roles: ADMIN },
  { path: "/admin/bobot", component: lazyFeature(() => import("../features/admin"), "ScoreWeightsPage"), shell: "app", title: "Bobot skor", roles: ADMIN },
  { path: "/admin/pengguna", component: lazyFeature(() => import("../features/admin"), "UsersPage"), shell: "app", title: "Pengguna", roles: ADMIN },
  { path: "/admin/siklus", component: lazyFeature(() => import("../features/admin"), "CyclesAdminPage"), shell: "app", title: "Siklus", roles: ADMIN },
  { path: "/admin/audit", component: lazyFeature(() => import("../features/admin"), "AuditLogPage"), shell: "app", title: "Audit log", roles: ADMIN },

  // Dev only: component catalogue
  ...(import.meta.env.DEV
    ? ([{ path: "/dev/komponen", component: lazyFeature(() => import("../dev/ComponentCatalogue"), "ComponentCatalogue"), shell: "none", title: "Katalog komponen", devOnly: true }] satisfies AppRoute[])
    : [])
];

/** Whether the route requires a signed-in user. */
export function routeNeedsAuth(route: AppRoute): boolean {
  if (route.auth !== undefined) return route.auth;
  return route.shell === "app" || Boolean(route.roles);
}
