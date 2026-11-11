import { Hono } from "hono";
import { auditLogQuerySchema, type AuditLogListResponse } from "@nirmala/shared";
import type { Database } from "../db/client.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { auditFacets, listAudit } from "../repositories/audit.js";

/** Audit log (S12e, docs/api-contract.md §6.6). Hanya admin; baca saja. */
export function auditLogRoutes({ db }: Database) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireRole("admin"));

  routes.get("/", async (context) => {
    // Query kosong dianggap tidak ada; `from`/`to` berupa angka (epoch ms) tiba sebagai string, jadi diubah ke angka.
    const query = Object.fromEntries(Object.entries(context.req.query()).filter(([, value]) => value !== "").map(([key, value]) => [key, (key === "from" || key === "to") && /^\d{9,}$/.test(value) ? Number(value) : value]));
    const parsed = auditLogQuerySchema.safeParse(query);
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Filter tidak valid." }, 400);
    const { page, pageSize, ...filter } = parsed.data;
    const { logs, total } = await listAudit(db, { ...filter, page, pageSize });
    return context.json({ logs, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } } satisfies AuditLogListResponse);
  });

  routes.get("/facets", async (context) => context.json(await auditFacets(db)));

  return routes;
}
