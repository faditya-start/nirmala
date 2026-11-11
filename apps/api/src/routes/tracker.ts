/** Endpoint Smart Tracker (docs/api-contract.md §5). Aksi mengubah status lewat `canTransition`; sistem tidak pernah menutup catatan. */
import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import {
  acceptJustificationBodySchema, approveNoteBodySchema, bulkApproveBodySchema, justifyNoteBodySchema, returnNoteBodySchema, trackerListQuerySchema
} from "@nirmala/shared";
import type { Database } from "../db/client.js";
import { workUnits } from "../db/schema.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { canAccessOrganization } from "../middleware/scope.js";
import { findCycle } from "../repositories/cycles.js";
import {
  FORBIDDEN_ORG, TrackerError, acceptJustification, approveNote, buildNoteDetail, bulkApprove, justifyNote, returnNote, type TrackerActor
} from "../services/trackerService.js";
import { listTrackerNotes } from "../services/trackerList.js";

export function trackerRoutes(database: Database) {
  const { db } = database;
  const routes = new Hono<AppEnv>();

  const guarded = async (context: Context<AppEnv>, fn: () => Promise<Response>) => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof TrackerError) return context.json({ error: error.message }, error.status);
      throw error;
    }
  };

  /** Body JSON opsional (aksi tanpa isian wajib): kosong dianggap `{}`. */
  const parseBody = async <T>(context: Context<AppEnv>, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, fallback: string, optional = false): Promise<T> => {
    const raw = await context.req.json().catch(() => (optional ? {} : null));
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new TrackerError(400, parsed.error.issues[0]?.message ?? fallback);
    return parsed.data;
  };
  const actorOf = (context: Context<AppEnv>): TrackerActor => {
    const user = context.get("user")!;
    return { id: user.id, role: user.role };
  };

  routes.get("/notes", requireRole(), (context) => guarded(context, async () => {
    const parsed = trackerListQuerySchema.safeParse(context.req.query());
    if (!parsed.success) throw new TrackerError(400, parsed.error.issues[0]?.message ?? "Filter tidak valid.");
    const query = parsed.data;
    const scope = context.get("orgScope");
    if (!(await findCycle(db, query.cycleId))) throw new TrackerError(404, "Siklus tidak ditemukan.");
    if (query.organizationUnitId && !canAccessOrganization(scope, query.organizationUnitId)) throw new TrackerError(403, FORBIDDEN_ORG);
    if (query.workUnitId) {
      const [workUnit] = await db.select({ organizationUnitId: workUnits.organizationUnitId }).from(workUnits).where(eq(workUnits.id, query.workUnitId)).limit(1);
      if (!workUnit) throw new TrackerError(404, "Satker tidak ditemukan.");
      if (query.organizationUnitId && workUnit.organizationUnitId !== query.organizationUnitId) throw new TrackerError(400, "Satker bukan bagian dari eselon I yang dipilih.");
      if (!canAccessOrganization(scope, workUnit.organizationUnitId)) throw new TrackerError(403, FORBIDDEN_ORG);
    }
    return context.json(await listTrackerNotes(db, query, scope));
  }));

  routes.post("/notes/bulk-approve", requireRole("reviewer", "admin"), (context) => guarded(context, async () => {
    const body = await parseBody(context, bulkApproveBodySchema, "Daftar catatan tidak valid.");
    const scope = context.get("orgScope");
    const actor = actorOf(context);
    return context.json(await database.transaction(() => bulkApprove(db, body.noteIds, scope, actor, body.note)));
  }));

  routes.get("/notes/:id", requireRole(), (context) => guarded(context, async () =>
    context.json(await buildNoteDetail(db, context.req.param("id") ?? "", context.get("orgScope"), context.get("user")!.role))));

  routes.post("/notes/:id/approve", requireRole("reviewer", "admin"), (context) => guarded(context, async () => {
    const body = await parseBody(context, approveNoteBodySchema, "Data tidak valid.", true);
    const noteId = context.req.param("id") ?? "";
    const scope = context.get("orgScope");
    const actor = actorOf(context);
    return context.json(await database.transaction(() => approveNote(db, noteId, scope, actor, body.note)));
  }));

  routes.post("/notes/:id/return", requireRole("reviewer", "admin"), (context) => guarded(context, async () => {
    const body = await parseBody(context, returnNoteBodySchema, "Alasan pengembalian minimal 5 karakter.");
    const noteId = context.req.param("id") ?? "";
    const scope = context.get("orgScope");
    const actor = actorOf(context);
    return context.json(await database.transaction(() => returnNote(db, noteId, scope, actor, body.reason)));
  }));

  routes.post("/notes/:id/justify", requireRole("uki", "admin"), (context) => guarded(context, async () => {
    const body = await parseBody(context, justifyNoteBodySchema, "Alasan Satker minimal 10 karakter.");
    const noteId = context.req.param("id") ?? "";
    const scope = context.get("orgScope");
    const actor = actorOf(context);
    return context.json(await database.transaction(() => justifyNote(db, noteId, scope, actor, body.justification)));
  }));

  routes.post("/notes/:id/accept-justification", requireRole("reviewer", "admin"), (context) => guarded(context, async () => {
    const body = await parseBody(context, acceptJustificationBodySchema, "Data tidak valid.", true);
    const noteId = context.req.param("id") ?? "";
    const scope = context.get("orgScope");
    const actor = actorOf(context);
    return context.json(await database.transaction(() => acceptJustification(db, noteId, scope, actor, body.note)));
  }));

  return routes;
}
