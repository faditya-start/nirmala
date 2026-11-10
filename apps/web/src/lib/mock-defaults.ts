/**
 * Default mocks so the shell works with `VITE_MOCK=1`: auth, cycles, needs-action.
 * All data is synthetic. Features add their own in features/<fitur>/mock.ts.
 *
 * Demo logins (any password): reviewer, uki, pimpinan, admin.
 * Switch role without logging in: open the app with `?as=admin` (mock mode only).
 */
import { ApiError } from "./api-error";
import { registerMock, respond } from "./mock";
import { isRole, type AuthUser, type Role } from "./roles";
import { readSession, writeSession } from "./storage";
import type { Cycle, NeedsActionResponse } from "./types";

const SESSION_KEY = "nirmala.mock.user";

const USERS: Record<Role, AuthUser> = {
  reviewer: { id: "u-reviewer", name: "Reviewer 01", role: "reviewer", unit: "Itjen" },
  uki: { id: "u-uki", name: "PIC UKI 01", role: "uki", unit: "Ditjen Contoh A" },
  leader: { id: "u-leader", name: "Pimpinan 01", role: "leader", unit: "Itjen" },
  admin: { id: "u-admin", name: "Admin 01", role: "admin", unit: null }
};

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

function dayOffset(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
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
      status: "active"
    },
    {
      id: "c-pagu",
      fiscalYear: year,
      stage: "pagu",
      name: `Reviu RKA TA ${year} tahap pagu`,
      adkDeadline: dayOffset(-60),
      dipaIssuedAt: dayOffset(-45),
      status: "closed"
    }
  ];
}

export function registerDefaultMocks(): void {
  if (typeof window !== "undefined") {
    const as = new URLSearchParams(window.location.search).get("as");
    if (as && isRole(as)) setUser(USERS[as]);
  }

  registerMock("GET", "/auth/me", () => ({ user: currentUser }));

  registerMock("POST", "/auth/login", ({ body }) => {
    const { username, password } = (body ?? {}) as { username?: string; password?: string };
    const role = username ? USERNAME_TO_ROLE[username.trim().toLowerCase()] : undefined;
    if (!role || !password) throw new ApiError(401, "Nama pengguna atau kata sandi salah.");
    setUser(USERS[role]);
    return { user: USERS[role] };
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
    if (currentUser.role === "reviewer") {
      return {
        count: 5,
        items: [
          { label: "Catatan Perlu Verifikasi", href: "/tracker", count: 3 },
          { label: "Item kena aturan belum ditinjau", href: "/triage", count: 83 },
          { label: "CHR draf", href: "/chr", count: 2 }
        ]
      };
    }
    if (currentUser.role === "uki") {
      return { count: 2, items: [{ label: "Catatan menunggu justifikasi", href: "/tracker", count: 2 }] };
    }
    return { count: 0, items: [] };
  });
}
