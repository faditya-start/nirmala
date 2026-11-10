import { Hono } from "hono";
import type { Database } from "../db/client.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { listAudit } from "../repositories/audit.js";

export function auditLogRoutes({ db }: Database) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireRole("admin"));

  routes.get("/", async (context) => {
    const page = Math.max(1, Number.parseInt(context.req.query("page") ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(context.req.query("pageSize") ?? "25", 10) || 25));
    const { logs, total } = await listAudit(db, { action: context.req.query("action") || undefined, page, pageSize });
    return context.json({ logs, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  });

  return routes;
}
