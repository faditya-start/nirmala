/** Progres per Satker (docs/api-contract.md §5 `GET /api/satker/progress`). */
import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { satkerProgressQuerySchema } from "@nirmala/shared";
import type { Database } from "../db/client.js";
import { organizationUnits } from "../db/schema.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { canAccessOrganization } from "../middleware/scope.js";
import { findCycle } from "../repositories/cycles.js";
import { buildSatkerProgress } from "../services/satkerProgress.js";

const FORBIDDEN_ORG = "Anda tidak memiliki akses ke eselon I ini.";

export function satkerRoutes({ db }: Database) {
  const routes = new Hono<AppEnv>();

  routes.get("/progress", requireRole(), async (context) => {
    const parsed = satkerProgressQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Parameter tidak valid." }, 400);
    const query = parsed.data;
    const scope = context.get("orgScope");
    if (!(await findCycle(db, query.cycleId))) return context.json({ error: "Siklus tidak ditemukan." }, 404);

    let organizationUnitId = query.organizationUnitId;
    if (organizationUnitId) {
      if (!canAccessOrganization(scope, organizationUnitId)) return context.json({ error: FORBIDDEN_ORG }, 403);
      const [found] = await db.select({ id: organizationUnits.id }).from(organizationUnits).where(eq(organizationUnits.id, organizationUnitId)).limit(1);
      if (!found) return context.json({ error: "Eselon I tidak ditemukan." }, 404);
    } else {
      if (scope !== null && scope.length === 0) return context.json({ error: FORBIDDEN_ORG }, 403);
      const candidates = await db.select({ id: organizationUnits.id }).from(organizationUnits).where(scope === null ? undefined : inArray(organizationUnits.id, scope));
      if (candidates.length !== 1) return context.json({ error: "Pilih eselon I." }, 400);
      organizationUnitId = candidates[0].id;
    }
    return context.json(await buildSatkerProgress(db, query.cycleId, organizationUnitId, query.sort));
  });

  return routes;
}
