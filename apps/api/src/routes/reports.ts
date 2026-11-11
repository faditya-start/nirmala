import { Hono } from "hono";
import { reportExportQuerySchema, reportQuerySchema, type ReportQuery } from "@nirmala/shared";
import type { Database } from "../db/client.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { findCycle } from "../repositories/cycles.js";
import { findOrganizationUnit } from "../repositories/organizationUnits.js";
import { FORBIDDEN_ORG_MESSAGE, resolveCoverage } from "../services/coverage.js";
import { buildEngineValidation } from "../services/engineValidation.js";
import { buildReportCsv, buildReportSummary } from "../services/reportService.js";
import type { Context } from "hono";

/** Laporan S11 (docs/api-contract.md §6.2): semua peran, angka dan ekspor dibatasi scope. */
export function reportRoutes({ db }: Database) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireRole());

  /** Siklus + cakupan, atau respons galat (404/403). */
  async function resolve(context: Context<AppEnv>, query: ReportQuery) {
    const cycle = await findCycle(db, query.cycleId);
    if (!cycle) return { error: context.json({ error: "Siklus tidak ditemukan." }, 404) } as const;
    const coverage = resolveCoverage(context.get("orgScope"), query.organizationUnitId);
    if (coverage.forbidden) return { error: context.json({ error: FORBIDDEN_ORG_MESSAGE }, 403) } as const;
    const organizationUnit = query.organizationUnitId ? ((await findOrganizationUnit(db, query.organizationUnitId)) ?? null) : null;
    if (query.organizationUnitId && !organizationUnit) return { error: context.json({ error: "Eselon I tidak ditemukan." }, 404) } as const;
    return { cycle, orgIds: coverage.orgIds, organizationUnit } as const;
  }

  routes.get("/summary", async (context) => {
    const parsed = reportQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Parameter tidak valid." }, 400);
    const resolved = await resolve(context, parsed.data);
    if ("error" in resolved) return resolved.error;
    return context.json(await buildReportSummary(db, resolved.cycle, resolved.orgIds, resolved.organizationUnit));
  });

  routes.get("/engine-validation", async (context) => {
    const parsed = reportQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Parameter tidak valid." }, 400);
    const resolved = await resolve(context, parsed.data);
    if ("error" in resolved) return resolved.error;
    return context.json(await buildEngineValidation(db, resolved.cycle.id, resolved.orgIds));
  });

  routes.get("/export.csv", async (context) => {
    const parsed = reportExportQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Parameter tidak valid." }, 400);
    const resolved = await resolve(context, parsed.data);
    if ("error" in resolved) return resolved.error;
    const csv = await buildReportCsv(db, resolved.cycle, resolved.orgIds, parsed.data.dataset);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nirmala-${parsed.data.dataset}-${resolved.cycle.fiscalYear}-${resolved.cycle.stage}.csv"`,
        "Cache-Control": "no-store"
      }
    });
  });

  return routes;
}
