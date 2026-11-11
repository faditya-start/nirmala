import { Hono } from "hono";
import { dashboardQuerySchema } from "@nirmala/shared";
import type { Database } from "../db/client.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { findCycle } from "../repositories/cycles.js";
import { findOrganizationUnit } from "../repositories/organizationUnits.js";
import { FORBIDDEN_ORG_MESSAGE, resolveCoverage } from "../services/coverage.js";
import { buildDashboard } from "../services/dashboard.js";

/** `GET /api/dashboard` (docs/api-contract.md §6.1): reviewer/UKI melihat eselon I miliknya, pimpinan/admin semua. */
export function dashboardRoutes({ db }: Database) {
  const routes = new Hono<AppEnv>();

  routes.get("/", requireRole(), async (context) => {
    const parsed = dashboardQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Parameter tidak valid." }, 400);
    const scope = context.get("orgScope");
    const cycle = await findCycle(db, parsed.data.cycleId);
    if (!cycle) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    const coverage = resolveCoverage(scope, parsed.data.organizationUnitId);
    if (coverage.forbidden) return context.json({ error: FORBIDDEN_ORG_MESSAGE }, 403);
    if (parsed.data.organizationUnitId && !(await findOrganizationUnit(db, parsed.data.organizationUnitId))) return context.json({ error: "Eselon I tidak ditemukan." }, 404);
    return context.json(await buildDashboard(db, cycle, context.get("user")!.role, scope, coverage.orgIds));
  });

  return routes;
}
