import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { CYCLE_STAGES, CYCLE_STATUSES } from "@nirmala/shared";
import type { Database } from "../db/client.js";
import { ingestSnapshot, IngestError, type IngestHooks } from "../ingest/ingestService.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { canAccessOrganization } from "../middleware/scope.js";
import { recordAudit } from "../repositories/audit.js";
import { countCycleSnapshots, createCycle, deleteCycle, findCycle, findCycleByYearStage, listCycles, updateCycle } from "../repositories/cycles.js";
import { findSnapshot, listSnapshots } from "../repositories/snapshots.js";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/** Tanggal sebagai epoch ms, string ISO (YYYY-MM-DD), atau null. */
const dateInput = z.union([z.number().int(), z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Tanggal tidak valid.").transform((value) => Date.parse(value))]).nullable();

const createSchema = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
  stage: z.enum(CYCLE_STAGES),
  name: z.string().trim().min(3).max(150).optional(),
  adkDeadline: dateInput.optional(),
  dipaIssuedAt: dateInput.optional()
});
const updateSchema = z.object({
  name: z.string().trim().min(3).max(150).optional(),
  adkDeadline: dateInput.optional(),
  dipaIssuedAt: dateInput.optional(),
  status: z.enum(CYCLE_STATUSES).optional()
});

const stageLabel = { pagu: "Pagu", alokasi: "Alokasi" } as const;

export function cycleRoutes(database: Database, hooks: IngestHooks = {}) {
  const { db } = database;
  const routes = new Hono<AppEnv>();

  routes.get("/", requireRole(), async (context) => context.json({ cycles: await listCycles(db) }));

  routes.post("/", requireRole("admin"), async (context) => {
    const actor = context.get("user")!;
    const parsed = createSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data siklus tidak valid." }, 400);
    const { fiscalYear, stage } = parsed.data;
    if (await findCycleByYearStage(db, fiscalYear, stage)) return context.json({ error: `Siklus TA ${fiscalYear} tahap ${stageLabel[stage]} sudah ada.` }, 409);
    const id = await createCycle(db, {
      fiscalYear, stage, name: parsed.data.name ?? `TA ${fiscalYear} · ${stageLabel[stage]}`,
      adkDeadline: parsed.data.adkDeadline ?? null, dipaIssuedAt: parsed.data.dipaIssuedAt ?? null, createdBy: actor.id
    });
    const cycle = (await findCycle(db, id))!;
    await recordAudit(db, { actorId: actor.id, action: "cycle.created", entityType: "review_cycle", entityId: id, detail: `Siklus ${cycle.name} dibuat.`, after: cycle });
    return context.json({ cycle }, 201);
  });

  routes.put("/:id", requireRole("admin"), async (context) => {
    const actor = context.get("user")!;
    const parsed = updateSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data siklus tidak valid." }, 400);
    const before = await findCycle(db, context.req.param("id"));
    if (!before) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    const patch = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
    await updateCycle(db, before.id, patch);
    const cycle = (await findCycle(db, before.id))!;
    await recordAudit(db, { actorId: actor.id, action: "cycle.updated", entityType: "review_cycle", entityId: before.id, detail: `Siklus ${cycle.name} diperbarui.`, before, after: cycle });
    return context.json({ cycle });
  });

  routes.delete("/:id", requireRole("admin"), async (context) => {
    const actor = context.get("user")!;
    const cycle = await findCycle(db, context.req.param("id"));
    if (!cycle) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    if ((await countCycleSnapshots(db, cycle.id)) > 0) return context.json({ error: "Siklus yang sudah memiliki snapshot tidak dapat dihapus." }, 409);
    await deleteCycle(db, cycle.id);
    await recordAudit(db, { actorId: actor.id, action: "cycle.deleted", entityType: "review_cycle", entityId: cycle.id, detail: `Siklus ${cycle.name} dihapus.`, before: cycle });
    return context.body(null, 204);
  });

  routes.get("/:id/snapshots", requireRole(), async (context) => {
    if (!(await findCycle(db, context.req.param("id")))) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    return context.json({ snapshots: await listSnapshots(db, context.req.param("id"), context.get("orgScope")) });
  });

  routes.get("/:id/snapshots/:snapshotId", requireRole(), async (context) => {
    const snapshot = await findSnapshot(db, context.req.param("snapshotId"));
    if (!snapshot || snapshot.cycleId !== context.req.param("id")) return context.json({ error: "Snapshot tidak ditemukan." }, 404);
    if (!canAccessOrganization(context.get("orgScope"), snapshot.organizationUnitId)) return context.json({ error: "Anda tidak memiliki akses ke eselon I ini." }, 403);
    return context.json({ snapshot });
  });

  routes.post("/:id/snapshots", requireRole("reviewer", "admin"), bodyLimit({ maxSize: MAX_UPLOAD_BYTES, onError: (context) => context.json({ error: "Berkas terlalu besar (maks. 500 MB)." }, 413) }), async (context) => {
    const user = context.get("user")!;
    const form = await context.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return context.json({ error: "Unggah berkas CSV pada field `file`." }, 400);

    const directory = await mkdtemp(join(tmpdir(), "nirmala-import-"));
    const filePath = join(directory, "upload.csv");
    try {
      await pipeline(Readable.fromWeb(file.stream() as never), createWriteStream(filePath));
      const result = await ingestSnapshot(database, { cycleId: context.req.param("id"), filePath, fileName: file.name, importedBy: user.id, allowedOrganizationUnitIds: context.get("orgScope") }, hooks);
      return context.json(result, result.alreadyImported ? 200 : 201);
    } catch (error) {
      if (error instanceof IngestError) return context.json({ error: error.message }, error.status);
      throw error;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  return routes;
}
