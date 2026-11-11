import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import type { AuthResponse, MeResponse, SessionUser } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { clearSessionCookie, SESSION_COOKIE, SESSION_LIFETIME_MS, setSessionCookie, type AppEnv, type SessionSigner } from "../middleware/auth.js";
import { verifyPassword } from "../lib/security.js";
import { recordAudit } from "../repositories/audit.js";
import { listOrganizationUnits } from "../repositories/organizationUnits.js";
import { createSession, deleteSession, findUserById, findUserByUsername } from "../repositories/users.js";

const loginSchema = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) });

export function authRoutes(db: Db, signer: SessionSigner, secureCookies: boolean) {
  const routes = new Hono<AppEnv>();

  routes.get("/me", async (context) => {
    const sessionUser = context.get("user");
    if (!sessionUser) return context.json({ user: null, organizationUnits: [] } satisfies MeResponse);
    const record = await findUserById(db, sessionUser.id);
    const scope = context.get("orgScope");
    const organizationUnits = await listOrganizationUnits(db, scope);
    // Footer sidebar: `unit_label`; PIC UKI tanpa label memakai nama eselon I miliknya.
    const unitLabel = record?.unitLabel ?? (sessionUser.role === "uki" && organizationUnits.length ? organizationUnits.map((unit) => unit.shortName).join(", ") : null);
    return context.json({ user: { ...sessionUser, username: record?.username ?? "", unitLabel, scopeOrganizationUnitIds: scope }, organizationUnits } satisfies MeResponse);
  });

  routes.post("/login", async (context) => {
    const parsed = loginSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: "Username dan password wajib diisi." }, 400);
    const record = await findUserByUsername(db, parsed.data.username);
    // Pengguna nonaktif ditolak dengan pesan yang sama (tidak membedakan) dan dicatat sebagai login gagal.
    if (!record || !record.active || !(await verifyPassword(parsed.data.password, record.passwordHash))) {
      if (record) await recordAudit(db, { actorId: record.id, action: "auth.login_failed", entityType: "user", entityId: record.id, detail: "Percobaan login gagal." });
      return context.json({ error: "Username atau password tidak valid." }, 401);
    }
    const sessionId = await createSession(db, record.id, SESSION_LIFETIME_MS);
    const user: SessionUser = { id: record.id, name: record.displayName, role: record.role };
    setSessionCookie(context, signer.encode(sessionId), secureCookies);
    await recordAudit(db, { actorId: user.id, action: "auth.login", entityType: "user", entityId: user.id, detail: "Login berhasil." });
    return context.json({ user } satisfies AuthResponse);
  });

  routes.post("/logout", async (context) => {
    const sessionId = signer.verify(getCookie(context, SESSION_COOKIE));
    if (sessionId) await deleteSession(db, sessionId);
    clearSessionCookie(context);
    return context.body(null, 204);
  });

  return routes;
}
