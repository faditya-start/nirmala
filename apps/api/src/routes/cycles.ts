import { Hono } from "hono";
import { createCycleBodySchema, markDipaIssuedBodySchema, updateCycleBodySchema, type MarkDipaIssuedResponse } from "@nirmala/shared";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { publicMetrics } from "../db/schema.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { recordAudit } from "../repositories/audit.js";
import { generatePublicMetrics } from "../services/publicMetrics.js";
import { countCycleSnapshots, createCycle, deleteCycle, findCycle, findCycleByYearStage, listCycles, updateCycle } from "../repositories/cycles.js";

const stageLabel = { pagu: "Pagu", alokasi: "Alokasi" } as const;

/** CRUD siklus. Snapshot dan impor ada di `snapshots.ts` (dipasang pada prefiks yang sama). */
export function cycleRoutes(database: Database, options: { minNotes: number }) {
  const { db } = database;
  const routes = new Hono<AppEnv>();

  routes.get("/", requireRole(), async (context) => context.json({ cycles: await listCycles(db) }));

  routes.post("/", requireRole("admin"), async (context) => {
    const actor = context.get("user")!;
    const parsed = createCycleBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data siklus tidak valid." }, 400);
    const { fiscalYear, stage } = parsed.data;
    if (await findCycleByYearStage(db, fiscalYear, stage)) return context.json({ error: `Siklus TA ${fiscalYear} tahap ${stageLabel[stage]} sudah ada.` }, 409);
    const cycle = await database.transaction(async () => {
      const id = await createCycle(db, {
        fiscalYear, stage, name: parsed.data.name ?? `TA ${fiscalYear} · ${stageLabel[stage]}`,
        adkDeadline: parsed.data.adkDeadline ?? null, dipaIssuedAt: parsed.data.dipaIssuedAt ?? null, createdBy: actor.id
      });
      const created = (await findCycle(db, id))!;
      await recordAudit(db, { actorId: actor.id, action: "cycle.created", entityType: "review_cycle", entityId: id, detail: `Siklus ${created.name} dibuat.`, after: created });
      return created;
    });
    return context.json({ cycle }, 201);
  });

  routes.put("/:id", requireRole("admin"), async (context) => {
    const actor = context.get("user")!;
    const parsed = updateCycleBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data siklus tidak valid." }, 400);
    const before = await findCycle(db, context.req.param("id"));
    if (!before) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    if (parsed.data.dipaIssuedAt != null) return context.json({ error: 'Gunakan "Tandai DIPA terbit" agar agregat publik ikut dibuat.' }, 400);
    if (parsed.data.dipaIssuedAt === null && before.dipaIssuedAt !== null) return context.json({ error: "Gunakan penarikan DIPA terbit agar agregat publik ikut dihapus." }, 400);
    const patch = Object.fromEntries(Object.entries(parsed.data).filter(([key, value]) => value !== undefined && key !== "dipaIssuedAt"));
    const cycle = await database.transaction(async () => {
      await updateCycle(db, before.id, patch);
      const updated = (await findCycle(db, before.id))!;
      await recordAudit(db, { actorId: actor.id, action: "cycle.updated", entityType: "review_cycle", entityId: before.id, detail: `Siklus ${updated.name} diperbarui.`, before, after: updated });
      return updated;
    });
    return context.json({ cycle });
  });

  routes.delete("/:id", requireRole("admin"), async (context) => {
    const actor = context.get("user")!;
    const cycle = await findCycle(db, context.req.param("id"));
    if (!cycle) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    if ((await countCycleSnapshots(db, cycle.id)) > 0) return context.json({ error: "Siklus yang sudah memiliki snapshot tidak dapat dihapus." }, 409);
    if (cycle.dipaIssuedAt !== null) return context.json({ error: "DIPA siklus ini sudah ditandai terbit. Tarik kembali penandaan sebelum menghapus siklus." }, 409);
    await database.transaction(async () => {
      await deleteCycle(db, cycle.id);
      await recordAudit(db, { actorId: actor.id, action: "cycle.deleted", entityType: "review_cycle", entityId: cycle.id, detail: `Siklus ${cycle.name} dihapus.`, before: cycle });
    });
    return context.body(null, 204);
  });

  /** Tandai DIPA terbit: mengisi `dipa_issued_at` dan `public_metrics` dalam satu transaksi (§2.8, §6.5). */
  routes.post("/:id/dipa-issued", requireRole("admin"), async (context) => {
    const actor = context.get("user")!;
    const parsed = markDipaIssuedBodySchema.safeParse(await context.req.json().catch(() => ({})));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid." }, 400);
    const result = await database.transaction(async (): Promise<MarkDipaIssuedResponse | "tidak_ada" | "sudah"> => {
      const before = await findCycle(db, context.req.param("id"));
      if (!before) return "tidak_ada";
      if (before.dipaIssuedAt !== null) return "sudah";
      const issuedAt = parsed.data.issuedAt ?? Date.now();
      await updateCycle(db, before.id, { dipaIssuedAt: issuedAt });
      const publicMetricRows = await generatePublicMetrics(db, before.id, before.adkDeadline, options.minNotes);
      const cycle = (await findCycle(db, before.id))!;
      await recordAudit(db, { actorId: actor.id, action: "cycle.dipa_issued", entityType: "review_cycle", entityId: before.id, detail: `DIPA siklus ${cycle.name} ditandai terbit.`, before: { dipaIssuedAt: null }, after: { dipaIssuedAt: issuedAt } });
      await recordAudit(db, { actorId: actor.id, action: "public_metrics.generated", entityType: "public_metrics", entityId: before.id, detail: `Agregat publik siklus ${cycle.name} dibuat (${publicMetricRows} baris).`, after: { rows: publicMetricRows, minNotes: options.minNotes } });
      return { cycle, publicMetricRows };
    });
    if (result === "tidak_ada") return context.json({ error: "Siklus tidak ditemukan." }, 404);
    if (result === "sudah") return context.json({ error: "DIPA siklus ini sudah ditandai terbit." }, 409);
    return context.json(result);
  });

  /** Tarik kembali penandaan DIPA (salah klik): agregat publik siklus dihapus (A17). */
  routes.delete("/:id/dipa-issued", requireRole("admin"), async (context) => {
    const actor = context.get("user")!;
    const result = await database.transaction(async () => {
      const before = await findCycle(db, context.req.param("id"));
      if (!before) return "tidak_ada" as const;
      if (before.dipaIssuedAt === null) return "belum" as const;
      await db.delete(publicMetrics).where(eq(publicMetrics.cycleId, before.id));
      await updateCycle(db, before.id, { dipaIssuedAt: null });
      const cycle = (await findCycle(db, before.id))!;
      await recordAudit(db, { actorId: actor.id, action: "cycle.dipa_retracted", entityType: "review_cycle", entityId: before.id, detail: `Penandaan DIPA siklus ${cycle.name} ditarik kembali; agregat publik dihapus.`, before: { dipaIssuedAt: before.dipaIssuedAt }, after: { dipaIssuedAt: null } });
      return cycle;
    });
    if (result === "tidak_ada") return context.json({ error: "Siklus tidak ditemukan." }, 404);
    if (result === "belum") return context.json({ error: "DIPA siklus ini belum ditandai terbit." }, 409);
    return context.json({ cycle: result });
  });

  return routes;
}
