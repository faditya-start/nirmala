import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { AuthResponse, HealthResponse, SessionUser } from "@nirmala/shared";
import { db, id, seedDatabase, verifyPassword } from "./db/store.js";

const port = Number(process.env.API_PORT ?? 8787);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const sessionSecret = process.env.SESSION_SECRET ?? "development-only-change-this-secret";
const sessionCookie = "nirmala_session";
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const app = new Hono();
await seedDatabase();
app.use("*", cors({ origin: webOrigin, credentials: true }));

function sign(value: string) { return createHmac("sha256", sessionSecret).update(value).digest("base64url"); }
function encodeSession(sessionId: string) { return `${sessionId}.${sign(sessionId)}`; }
function verifiedSessionId(value?: string) { if (!value) return null; const [sessionId, signature] = value.split("."); if (!sessionId || !signature) return null; const expected = sign(sessionId); return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? sessionId : null; }
function currentUser(context: { req: { header(name: string): string | undefined } }) {
  const rawCookie = context.req.header("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
  const sessionId = verifiedSessionId(rawCookie); if (!sessionId) return null;
  const record = db().prepare("SELECT u.id, u.display_name, u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>? ").get(sessionId, Date.now());
  if (!record) return null;
  return { id: String(record.id), name: String(record.display_name), role: record.role as SessionUser["role"] };
}
function requireRole(context: Parameters<typeof currentUser>[0], roles: SessionUser["role"][]) { const user = currentUser(context); return user && roles.includes(user.role) ? user : null; }
function audit(actorId: string, action: string, entityType: string, entityId: string, detail: string) { db().prepare("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?, ?)").run(id("audit"), actorId, action, entityType, entityId, detail, Date.now()); }

app.get("/api/health", (context) => context.json({ status: "ok", service: "nirmala-api", timestamp: new Date().toISOString() } satisfies HealthResponse));
app.get("/api/auth/me", (context) => context.json({ user: currentUser(context) }));
const loginSchema = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) });
app.post("/api/auth/login", async (context) => {
  const parsed = loginSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "Username dan password wajib diisi." }, 400);
  const record = db().prepare("SELECT id, username, display_name, role, password_hash FROM users WHERE username=?").get(parsed.data.username);
  if (!record || !(await verifyPassword(parsed.data.password, String(record.password_hash)))) return context.json({ error: "Username atau password tidak valid." }, 401);
  const sessionId = id("session"); const now = Date.now();
  db().prepare("INSERT INTO sessions VALUES (?, ?, ?, ?)").run(sessionId, record.id, now + sessionLifetimeMs, now);
  const user: SessionUser = { id: String(record.id), name: String(record.display_name), role: record.role as SessionUser["role"] };
  setCookie(context, sessionCookie, encodeSession(sessionId), { httpOnly: true, sameSite: "Lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: sessionLifetimeMs / 1000 });
  audit(user.id, "auth.login", "user", user.id, "Login berhasil.");
  return context.json({ user } satisfies AuthResponse);
});
app.post("/api/auth/logout", (context) => { const sessionId = verifiedSessionId(getCookie(context, sessionCookie)); if (sessionId) db().prepare("DELETE FROM sessions WHERE id=?").run(sessionId); deleteCookie(context, sessionCookie, { path: "/" }); return context.body(null, 204); });
app.get("/api/users", (context) => { if (!requireRole(context, ["admin"])) return context.json({ error: "Akses admin diperlukan." }, 403); const users = db().prepare("SELECT id, username, display_name AS displayName, role, created_at AS createdAt FROM users ORDER BY display_name").all(); return context.json({ users }); });
app.get("/api/dashboard/bootstrap", (context) => { const user = requireRole(context, ["reviewer", "leader", "admin"]); if (!user) return context.json({ error: "Silakan masuk untuk melanjutkan." }, 401); const items = db().prepare("SELECT COUNT(*) AS count FROM rka_items").get()!.count; const highRisk = db().prepare("SELECT COUNT(*) AS count FROM risk_assessments WHERE category='high'").get()!.count; return context.json({ user, metrics: { totalItems: items, highRisk } }); });
app.notFound((context) => context.json({ error: "Endpoint tidak ditemukan." }, 404));
serve({ fetch: app.fetch, port });
console.log(`NIRMALA API listening on http://localhost:${port}`);
