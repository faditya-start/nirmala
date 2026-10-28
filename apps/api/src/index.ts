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
app.get("/api/risk-items", (context) => {
  if (!requireRole(context, ["reviewer", "leader", "admin"])) return context.json({ error: "Silakan masuk untuk melanjutkan." }, 401);
  const search = (context.req.query("q") ?? "").trim().slice(0, 100);
  const category = context.req.query("category");
  const page = Math.max(1, Number.parseInt(context.req.query("page") ?? "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(context.req.query("pageSize") ?? "10", 10) || 10));
  const where: string[] = []; const values: unknown[] = [];
  if (search) { where.push("(i.description LIKE ? OR i.bas_code LIKE ? OR i.program LIKE ?)"); values.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (["low", "medium", "high"].includes(category ?? "")) { where.push("a.category=?"); values.push(category); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const select = "SELECT i.id, i.bas_code AS basCode, i.program, i.activity, i.description, i.total_amount AS totalAmount, i.evaluation_status AS evaluationStatus, d.fiscal_year AS fiscalYear, o.name AS organizationUnit, w.name AS workUnit, a.score, a.category, a.data_completeness AS dataCompleteness, i.updated_at AS updatedAt FROM rka_items i JOIN rka_documents d ON d.id=i.document_id JOIN organization_units o ON o.id=d.organization_unit_id JOIN work_units w ON w.id=d.work_unit_id JOIN risk_assessments a ON a.rka_item_id=i.id";
  const total = db().prepare(`SELECT COUNT(*) AS count FROM (${select} ${clause})`).get(...values)!.count;
  const items = db().prepare(`${select} ${clause} ORDER BY a.score DESC, i.updated_at DESC LIMIT ? OFFSET ?`).all(...values, pageSize, (page - 1) * pageSize);
  return context.json({ items, pagination: { page, pageSize, total, totalPages: Math.ceil(Number(total) / pageSize) } });
});
app.get("/api/risk-items/:id", (context) => {
  if (!requireRole(context, ["reviewer", "leader", "admin"])) return context.json({ error: "Silakan masuk untuk melanjutkan." }, 401);
  const item = db().prepare("SELECT i.id, i.bas_code AS basCode, i.program, i.activity, i.description, i.quantity, i.unit, i.unit_price AS unitPrice, i.total_amount AS totalAmount, i.evaluation_status AS evaluationStatus, d.fiscal_year AS fiscalYear, o.name AS organizationUnit, w.name AS workUnit, a.score, a.category, a.engine_version AS engineVersion, a.data_completeness AS dataCompleteness, a.assessed_at AS assessedAt FROM rka_items i JOIN rka_documents d ON d.id=i.document_id JOIN organization_units o ON o.id=d.organization_unit_id JOIN work_units w ON w.id=d.work_unit_id JOIN risk_assessments a ON a.rka_item_id=i.id WHERE i.id=?").get(context.req.param("id"));
  if (!item) return context.json({ error: "Item RKA tidak ditemukan." }, 404);
  const reference = db().prepare("SELECT item_name AS itemName, unit, reference_price AS referencePrice, source_name AS sourceName, is_synthetic AS isSynthetic FROM price_references WHERE fiscal_year=? AND unit=? ORDER BY created_at DESC LIMIT 1").get(item.fiscalYear, item.unit);
  const unitPrice = Number(item.unitPrice); const referencePrice = Number(reference?.referencePrice ?? 0);
  const variancePercent = referencePrice ? Math.round(((unitPrice - referencePrice) / referencePrice) * 1000) / 10 : null;
  const factors = [
    { code: "price_variance", label: "Deviasi harga satuan", value: variancePercent === null ? "Tidak tersedia" : `${variancePercent}% di atas referensi`, contribution: variancePercent !== null && variancePercent > 15 ? "high" : "low", explanation: referencePrice ? "Perbandingan dilakukan terhadap referensi harga sintetis, bukan harga resmi pemerintah." : "Belum ada referensi harga yang sepadan." },
    { code: "data_completeness", label: "Kelengkapan data", value: String(item.dataCompleteness), contribution: item.dataCompleteness === "sufficient" ? "low" : "medium", explanation: "Kelengkapan data memengaruhi tingkat keyakinan sinyal, bukan kesimpulan pelanggaran." }
  ];
  const decision = db().prepare("SELECT d.decision, d.reason, d.created_at AS createdAt, u.display_name AS reviewerName FROM reviewer_decisions d JOIN users u ON u.id=d.reviewer_user_id WHERE d.rka_item_id=?").get(context.req.param("id"));
  return context.json({ item, reference: reference ?? null, decision: decision ?? null, factors, limitations: ["Skor adalah prioritas pemeriksaan berbasis aturan deterministik.", "Dataset dan referensi harga pada demo ini bersifat sintetis.", "Keputusan akhir tetap berada pada reviewer setelah memeriksa bukti."] });
});
const decisionSchema = z.object({ reason: z.string().trim().min(10, "Alasan minimal 10 karakter.").max(1000) });
function saveDecision(context: Parameters<typeof currentUser>[0] & { req: { param(name: string): string; json(): Promise<unknown> } }, decision: "confirmed" | "false_positive") {
  return async () => {
    const user = requireRole(context, ["reviewer", "admin"]);
    if (!user) return { status: 403 as const, body: { error: "Hanya reviewer atau admin yang dapat menyimpan keputusan." } };
    const parsed = decisionSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return { status: 400 as const, body: { error: parsed.error.issues[0]?.message ?? "Alasan tidak valid." } };
    const itemId = context.req.param("id"); const item = db().prepare("SELECT id, evaluation_status AS evaluationStatus FROM rka_items WHERE id=?").get(itemId);
    if (!item) return { status: 404 as const, body: { error: "Item RKA tidak ditemukan." } };
    if (item.evaluationStatus !== "pending") return { status: 409 as const, body: { error: "Item ini sudah memiliki keputusan dan tidak dapat diubah tanpa proses otorisasi baru." } };
    const now = Date.now(); db().prepare("INSERT INTO reviewer_decisions VALUES (?, ?, ?, ?, ?, ?)").run(id("decision"), itemId, user.id, decision, parsed.data.reason, now);
    db().prepare("UPDATE rka_items SET evaluation_status=?, updated_at=? WHERE id=?").run(decision, now, itemId);
    audit(user.id, `risk_item.${decision}`, "rka_item", itemId, parsed.data.reason);
    return { status: 201 as const, body: { decision, evaluationStatus: decision, reason: parsed.data.reason } };
  };
}
app.post("/api/risk-items/:id/confirm", async (context) => { const result = await saveDecision(context, "confirmed")(); return context.json(result.body, result.status); });
app.post("/api/risk-items/:id/dismiss", async (context) => { const result = await saveDecision(context, "false_positive")(); return context.json(result.body, result.status); });
const chrSchema = z.object({ title: z.string().trim().min(5).max(200), findings: z.string().trim().min(10).max(4000), recommendation: z.string().trim().min(10).max(4000) });
const chrCreateSchema = chrSchema.extend({ rkaItemId: z.string().min(1) });
function chrRecord(chrId: string) { return db().prepare("SELECT c.id, c.rka_item_id AS rkaItemId, c.document_number AS documentNumber, c.title, c.findings, c.recommendation, c.status, c.created_at AS createdAt, c.updated_at AS updatedAt, c.issued_at AS issuedAt, i.description AS itemDescription, i.bas_code AS basCode, u.display_name AS createdBy FROM chr_documents c JOIN rka_items i ON i.id=c.rka_item_id JOIN users u ON u.id=c.created_by_user_id WHERE c.id=?").get(chrId); }
app.get("/api/chr", (context) => { if (!requireRole(context, ["reviewer", "leader", "admin"])) return context.json({ error: "Silakan masuk untuk melanjutkan." }, 401); const chr = db().prepare("SELECT c.id, c.document_number AS documentNumber, c.title, c.status, c.updated_at AS updatedAt, i.description AS itemDescription FROM chr_documents c JOIN rka_items i ON i.id=c.rka_item_id ORDER BY c.updated_at DESC").all(); return context.json({ chr }); });
app.post("/api/chr", async (context) => {
  const user = requireRole(context, ["reviewer", "admin"]); if (!user) return context.json({ error: "Hanya reviewer atau admin yang dapat membuat CHR." }, 403);
  const parsed = chrCreateSchema.safeParse(await context.req.json().catch(() => null)); if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data CHR tidak valid." }, 400);
  const item = db().prepare("SELECT id, description, evaluation_status AS evaluationStatus FROM rka_items WHERE id=?").get(parsed.data.rkaItemId); if (!item) return context.json({ error: "Item RKA tidak ditemukan." }, 404);
  if (item.evaluationStatus !== "confirmed") return context.json({ error: "CHR hanya dapat dibuat dari flag yang telah dikonfirmasi." }, 409);
  const existing = db().prepare("SELECT id FROM chr_documents WHERE rka_item_id=?").get(item.id); if (existing) return context.json({ error: "CHR untuk item ini sudah ada.", chrId: existing.id }, 409);
  const now = Date.now(); const chrId = id("chr");
  db().prepare("INSERT INTO chr_documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(chrId, item.id, null, parsed.data.title, parsed.data.findings, parsed.data.recommendation, "draft", user.id, now, now, null);
  db().prepare("INSERT INTO chr_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id("chrver"), chrId, 1, parsed.data.title, parsed.data.findings, parsed.data.recommendation, user.id, now);
  audit(user.id, "chr.created", "chr", chrId, `Draft CHR dibuat untuk ${item.description}.`);
  return context.json({ chr: chrRecord(chrId) }, 201);
});
app.get("/api/chr/:id", (context) => { if (!requireRole(context, ["reviewer", "leader", "admin"])) return context.json({ error: "Silakan masuk untuk melanjutkan." }, 401); const chr = chrRecord(context.req.param("id")); if (!chr) return context.json({ error: "CHR tidak ditemukan." }, 404); return context.json({ chr }); });
app.put("/api/chr/:id", async (context) => {
  const user = requireRole(context, ["reviewer", "admin"]); if (!user) return context.json({ error: "Hanya reviewer atau admin yang dapat mengubah CHR." }, 403);
  const parsed = chrSchema.safeParse(await context.req.json().catch(() => null)); if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data CHR tidak valid." }, 400);
  const current = chrRecord(context.req.param("id")); if (!current) return context.json({ error: "CHR tidak ditemukan." }, 404); if (current.status !== "draft") return context.json({ error: "CHR yang telah diterbitkan tidak dapat diubah diam-diam." }, 409);
  const now = Date.now(); const version = db().prepare("SELECT MAX(version_number) AS version FROM chr_versions WHERE chr_id=?").get(context.req.param("id"))!.version as number | null;
  db().prepare("UPDATE chr_documents SET title=?, findings=?, recommendation=?, updated_at=? WHERE id=?").run(parsed.data.title, parsed.data.findings, parsed.data.recommendation, now, context.req.param("id"));
  db().prepare("INSERT INTO chr_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id("chrver"), context.req.param("id"), Number(version ?? 0) + 1, parsed.data.title, parsed.data.findings, parsed.data.recommendation, user.id, now);
  audit(user.id, "chr.updated", "chr", context.req.param("id"), "Draft CHR diperbarui."); return context.json({ chr: chrRecord(context.req.param("id")) });
});
app.post("/api/chr/:id/issue", (context) => {
  const user = requireRole(context, ["reviewer", "admin"]); if (!user) return context.json({ error: "Hanya reviewer atau admin yang dapat menerbitkan CHR." }, 403);
  const current = chrRecord(context.req.param("id")); if (!current) return context.json({ error: "CHR tidak ditemukan." }, 404); if (current.status !== "draft") return context.json({ error: "CHR sudah diterbitkan." }, 409);
  const now = Date.now(); const documentNumber = `CHR/DEMO/${new Date(now).getFullYear()}/${String(now).slice(-6)}`; db().prepare("UPDATE chr_documents SET status='issued', document_number=?, issued_at=?, updated_at=? WHERE id=?").run(documentNumber, now, now, context.req.param("id")); audit(user.id, "chr.issued", "chr", context.req.param("id"), `CHR diterbitkan sebagai ${documentNumber}.`); return context.json({ chr: chrRecord(context.req.param("id")) });
});
app.get("/api/chr/:id/versions", (context) => { if (!requireRole(context, ["reviewer", "leader", "admin"])) return context.json({ error: "Silakan masuk untuk melanjutkan." }, 401); const versions = db().prepare("SELECT version_number AS versionNumber, title, findings, recommendation, created_at AS createdAt FROM chr_versions WHERE chr_id=? ORDER BY version_number DESC").all(context.req.param("id")); return context.json({ versions }); });
app.notFound((context) => context.json({ error: "Endpoint tidak ditemukan." }, 404));
serve({ fetch: app.fetch, port });
console.log(`NIRMALA API listening on http://localhost:${port}`);
