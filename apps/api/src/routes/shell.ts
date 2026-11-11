/** Endpoint shell dan referensi (docs/api-contract.md §3.1): "Perlu tindakan", badge nav, Satker, alasan dismiss, akun. */
import { and, asc, eq, inArray, like, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { accountListQuerySchema, navCountsQuerySchema, needsActionQuerySchema, workUnitListQuerySchema, type AccountDto, type NavCountsResponse, type WorkUnitDto } from "@nirmala/shared";
import type { Database } from "../db/client.js";
import { accounts, dismissReasons, workUnits } from "../db/schema.js";
import { DISMISS_REASON_SEEDS } from "../db/seeds/reference.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { canAccessOrganization } from "../middleware/scope.js";
import { findCycle, latestActiveCycle } from "../repositories/cycles.js";
import { countNotes, needsAction } from "../repositories/queues.js";
import { countUnreviewedFlagged } from "../repositories/triage.js";

export function shellRoutes({ db }: Database) {
  const routes = new Hono<AppEnv>();

  /** Siklus dari query, atau siklus `aktif` terbaru. `undefined` = tidak ada siklus aktif; `null` = id tidak ada (404). */
  const resolveCycle = async (cycleId: string | undefined) => (cycleId ? ((await findCycle(db, cycleId)) ?? null) : await latestActiveCycle(db));

  routes.get("/needs-action", requireRole(), async (context) => {
    const parsed = needsActionQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Parameter tidak valid." }, 400);
    const cycle = await resolveCycle(parsed.data.cycleId);
    if (cycle === null) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    if (!cycle) return context.json({ count: 0, items: [] });
    return context.json(await needsAction(db, context.get("user")!.role, context.get("orgScope"), cycle.id));
  });

  routes.get("/nav-counts", requireRole(), async (context) => {
    const parsed = navCountsQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Parameter tidak valid." }, 400);
    const cycle = await resolveCycle(parsed.data.cycleId);
    if (cycle === null) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    const { role } = context.get("user")!;
    const scope = context.get("orgScope");
    const body: NavCountsResponse = {
      triageUnreviewed: cycle && (role === "reviewer" || role === "admin") ? await countUnreviewedFlagged(db, cycle.id, scope) : 0,
      trackerPending: cycle && role !== "leader" ? await countNotes(db, cycle.id, scope, "perlu_verifikasi") : 0
    };
    return context.json(body);
  });

  routes.get("/work-units", requireRole(), async (context) => {
    const parsed = workUnitListQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Parameter tidak valid." }, 400);
    const scope = context.get("orgScope");
    const { organizationUnitId } = parsed.data;
    if (organizationUnitId && !canAccessOrganization(scope, organizationUnitId)) return context.json({ error: "Anda tidak memiliki akses ke eselon I ini." }, 403);
    if (!organizationUnitId && scope !== null && scope.length === 0) return context.json({ workUnits: [] });
    const where = organizationUnitId ? eq(workUnits.organizationUnitId, organizationUnitId) : scope ? inArray(workUnits.organizationUnitId, scope) : undefined;
    const rows = await db.select({ id: workUnits.id, code: workUnits.code, name: workUnits.name, organizationUnitId: workUnits.organizationUnitId }).from(workUnits).where(where).orderBy(asc(workUnits.code));
    return context.json({ workUnits: rows satisfies WorkUnitDto[] });
  });

  routes.get("/references/dismiss-reasons", requireRole(), async (context) => {
    const rows = await db.select({ code: dismissReasons.code, label: dismissReasons.label }).from(dismissReasons).where(eq(dismissReasons.active, true));
    const order = DISMISS_REASON_SEEDS.map((reason) => reason.code as string);
    const rank = (code: string) => (order.includes(code) ? order.indexOf(code) : order.length);
    return context.json({ reasons: rows.sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code)) });
  });

  routes.get("/references/accounts", requireRole(), async (context) => {
    const parsed = accountListQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Parameter tidak valid." }, 400);
    const { q, limit } = parsed.data;
    const where = q ? or(like(accounts.code, `${q.replace(/[%_]/g, "")}%`), sql`instr(lower(${accounts.name}), ${q.toLowerCase()}) > 0`) : undefined;
    const rows: AccountDto[] = await db.select({ code: accounts.code, name: accounts.name }).from(accounts).where(and(where)).orderBy(asc(accounts.code)).limit(limit);
    return context.json({ accounts: rows });
  });

  return routes;
}
