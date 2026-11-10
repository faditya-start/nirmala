import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import type { AuthResponse, SessionUser } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { clearSessionCookie, SESSION_COOKIE, SESSION_LIFETIME_MS, setSessionCookie, type AppEnv, type SessionSigner } from "../middleware/auth.js";
import { verifyPassword } from "../lib/security.js";
import { recordAudit } from "../repositories/audit.js";
import { createSession, deleteSession, findUserByUsername } from "../repositories/users.js";

const loginSchema = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) });

export function authRoutes(db: Db, signer: SessionSigner, secureCookies: boolean) {
  const routes = new Hono<AppEnv>();

  routes.get("/me", (context) => context.json({ user: context.get("user") }));

  routes.post("/login", async (context) => {
    const parsed = loginSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: "Username dan password wajib diisi." }, 400);
    const record = await findUserByUsername(db, parsed.data.username);
    if (!record || !(await verifyPassword(parsed.data.password, record.passwordHash))) {
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
