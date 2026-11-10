/**
 * Default mocks so the shell works with `VITE_MOCK=1`: auth, cycles, needs-action, nav-counts.
 * Shapes follow docs/api-contract.md 3.1 (MeResponse, NeedsActionResponse, NavCountsResponse).
 * All data is synthetic. Features add their own in features/<fitur>/mock.ts.
 *
 * Demo logins (any password): reviewer, uki, pimpinan, admin.
 * Switch role without logging in: open the app with `?as=admin` (mock mode only).
 */
import type { MeResponse, NavCountsResponse, OrganizationUnitDto } from "@nirmala/shared";
import { ApiError } from "./api-error";
import { registerMock, respond } from "./mock";
import { isRole, type AuthUser, type Role } from "./roles";
import { readSession, writeSession } from "./storage";
import type { Cycle, NeedsActionResponse } from "./types";

const SESSION_KEY = "nirmala.mock.user";

/** Synthetic eselon I. Features that need more can register their own `/auth/me` or reference these ids. */
const ORG_UNITS: OrganizationUnitDto[] = [
  { id: "o-ditjen-a", code: "01", shortName: "Ditjen Contoh A", name: "Direktorat Jenderal Contoh A" },
  { id: "o-ditjen-b", code: "02", shortName: "Ditjen Contoh B", name: "Direktorat Jenderal Contoh B" },
  { id: "o-biro-c", code: "03", shortName: "Biro Contoh C", name: "Biro Contoh C" }
];

const USERS: Record<Role, AuthUser> = {
  reviewer: { id: "u-reviewer", name: "Reviewer 01", role: "reviewer", username: "reviewer", unitLabel: "Itjen", scopeOrganizationUnitIds: ["o-ditjen-a", "o-ditjen-b"] },
  uki: { id: "u-uki", name: "PIC UKI 01", role: "uki", username: "uki", unitLabel: "Ditjen Contoh A", scopeOrganizationUnitIds: ["o-ditjen-a"] },
  leader: { id: "u-leader", name: "Pimpinan 01", role: "leader", username: "pimpinan", unitLabel: "Itjen", scopeOrganizationUnitIds: null },
  admin: { id: "u-admin", name: "Admin 01", role: "admin", username: "admin", unitLabel: null, scopeOrganizationUnitIds: null }
};

/** Eselon I visible to a user, already filtered by scope like the real endpoint. */
function visibleUnits(user: AuthUser | null): OrganizationUnitDto[] {
  if (!user) return [];
  const scope = user.scopeOrganizationUnitIds;
  return scope ? ORG_UNITS.filter((unit) => scope.includes(unit.id)) : ORG_UNITS;
}

const USERNAME_TO_ROLE: Record<string, Role> = {
  reviewer: "reviewer",
  "reviewer.demo": "reviewer",
  uki: "uki",
  pimpinan: "leader",
  leader: "leader",
  admin: "admin"
};

/** First visit: signed in as reviewer. After logout the "none" marker keeps the logged-out state across reloads. */
function loadUser(): AuthUser | null | undefined {
  const raw = readSession(SESSION_KEY);
  if (raw === null) return undefined;
  if (raw === "none") return null;
  try {
    const parsed = JSON.parse(raw) as AuthUser;
    return isRole(parsed.role) ? parsed : null;
  } catch {
    return null;
  }
}

const stored = loadUser();
let currentUser: AuthUser | null = stored === undefined ? USERS.reviewer : stored;

function setUser(user: AuthUser | null): void {
  currentUser = user;
  writeSession(SESSION_KEY, user ? JSON.stringify(user) : "none");
}

function dayOffset(days: number): number {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

function buildCycles(): Cycle[] {
  const year = new Date().getFullYear();
  return [
    {
      id: "c-alokasi",
      fiscalYear: year,
      stage: "alokasi",
      name: `Reviu RKA TA ${year} tahap alokasi`,
      adkDeadline: dayOffset(3),
      dipaIssuedAt: null,
      status: "aktif"
    },
    {
      id: "c-pagu",
      fiscalYear: year,
      stage: "pagu",
      name: `Reviu RKA TA ${year} tahap pagu`,
      adkDeadline: dayOffset(-60),
      dipaIssuedAt: dayOffset(-45),
      status: "selesai"
    }
  ];
}

export function registerDefaultMocks(): void {
  if (typeof window !== "undefined") {
    const as = new URLSearchParams(window.location.search).get("as");
    if (as && isRole(as)) setUser(USERS[as]);
  }

  registerMock("GET", "/auth/me", (): MeResponse => ({ user: currentUser as MeResponse["user"], organizationUnits: visibleUnits(currentUser) }));

  registerMock("POST", "/auth/login", ({ body }) => {
    const { username, password } = (body ?? {}) as { username?: string; password?: string };
    const role = username ? USERNAME_TO_ROLE[username.trim().toLowerCase()] : undefined;
    if (!role || !password) throw new ApiError(401, "Nama pengguna atau kata sandi salah.");
    setUser(USERS[role]);
    // Like the real login: the short SessionUser only (AuthResponse). The client re-reads /auth/me for the rest.
    const { id, name } = USERS[role];
    return { user: { id, name, role } };
  });

  registerMock("POST", "/auth/logout", () => {
    setUser(null);
    return respond(204);
  });

  registerMock("GET", "/cycles", () => {
    if (!currentUser) throw new ApiError(401, "Sesi berakhir. Silakan masuk kembali.");
    return { cycles: buildCycles() };
  });

  registerMock("GET", "/needs-action", (): NeedsActionResponse => {
    if (!currentUser) throw new ApiError(401, "Sesi berakhir. Silakan masuk kembali.");
    // Items, hrefs and ordering follow docs/api-contract.md 2.9; count is the sum of item counts.
    let items: NeedsActionResponse["items"] = [];
    if (currentUser.role === "reviewer" || currentUser.role === "admin") {
      items = [
        { label: "Catatan perlu verifikasi", href: "/tracker?status=perlu_verifikasi", count: 3 },
        { label: "CHR draf yang siap diterbitkan", href: "/chr", count: 2 },
        { label: "Item kena aturan belum ditinjau", href: "/triage?onlyFlagged=true&decision=belum_ditinjau", count: 83 }
      ];
    } else if (currentUser.role === "uki") {
      items = [
        { label: "Catatan menunggu revisi", href: "/tracker?status=menunggu_revisi", count: 5 },
        { label: "Catatan dapat dijustifikasi", href: "/tracker?status=perlu_verifikasi", count: 2 }
      ];
    }
    return { count: items.reduce((sum, item) => sum + item.count, 0), items };
  });

  registerMock("GET", "/nav-counts", (): NavCountsResponse => {
    if (!currentUser) throw new ApiError(401, "Sesi berakhir. Silakan masuk kembali.");
    // triageUnreviewed: reviewer/admin only. trackerPending: everyone except leader. 0 hides the badge.
    const role = currentUser.role;
    return {
      triageUnreviewed: role === "reviewer" || role === "admin" ? 83 : 0,
      trackerPending: role === "leader" ? 0 : 3
    };
  });
}
