import { Hono } from "hono";
import { createCycleBodySchema, updateCycleBodySchema } from "@nirmala/shared";
import type { Database } from "../db/client.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { recordAudit } from "../repositories/audit.js";
import { countCycleSnapshots, createCycle, deleteCycle, findCycle, findCycleByYearStage, listCycles, updateCycle } from "../repositories/cycles.js";

const stageLabel = { pagu: "Pagu", alokasi: "Alokasi" } as const;

/** CRUD siklus. Snapshot dan impor ada di `snapshots.ts` (dipasang pada prefiks yang sama). */
export function cycleRoutes(database: Database) {
  const { db } = database;
  const routes = new Hono<AppEnv>();

  routes.get("/", requireRole(), async (context) => context.json({ cycles: await listCycles(db) }));

  routes.post("/", requireRole("admin"), async (context) => {
    const actor = context.get("user")!;
    const parsed = createCycleBodySchema.safeParse(await context.req.json().catch(() => null));
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
    const parsed = updateCycleBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data siklus tidak valid." }, 400);
    const before = await findCycle(db, context.req.param("id"));
    if (!before) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    if (parsed.data.dipaIssuedAt != null) return context.json({ error: 'Gunakan "Tandai DIPA terbit" agar agregat publik ikut dibuat.' }, 400);
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

  return routes;
}
