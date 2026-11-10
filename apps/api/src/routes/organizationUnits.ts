import { Hono } from "hono";
import type { Database } from "../db/client.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { canAccessOrganization } from "../middleware/scope.js";
import { findOrganizationUnit, listOrganizationUnits } from "../repositories/organizationUnits.js";

/** Eselon I yang boleh dilihat pengguna (dibatasi `user_scopes` untuk Reviewer dan UKI). */
export function organizationUnitRoutes({ db }: Database) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireRole());

  routes.get("/", async (context) => context.json({ organizationUnits: await listOrganizationUnits(db, context.get("orgScope")) }));

  routes.get("/:id", async (context) => {
    const id = context.req.param("id");
    if (!canAccessOrganization(context.get("orgScope"), id)) return context.json({ error: "Anda tidak memiliki akses ke eselon I ini." }, 403);
    const unit = await findOrganizationUnit(db, id);
    return unit ? context.json({ organizationUnit: unit }) : context.json({ error: "Eselon I tidak ditemukan." }, 404);
  });

  return routes;
}
