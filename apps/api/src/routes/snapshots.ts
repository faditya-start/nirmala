import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { count } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  snapshotLookupQuerySchema, snapshotUploadFieldsSchema,
  type ImportOverviewResponse, type SnapshotDto, type SnapshotListResponse, type SnapshotLookupResponse,
  type SnapshotResponse, type SnapshotUploadAcceptedResponse, type SnapshotUploadResponse
} from "@nirmala/shared";
import type { Database } from "../db/client.js";
import { workUnits } from "../db/schema.js";
import { executeImport, IngestError, prepareImport, type ImportProgressEvent, type IngestHooks, type IngestInput } from "../ingest/ingestService.js";
import type { JobHandle, JobRegistry } from "../jobs/registry.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { canAccessOrganization } from "../middleware/scope.js";
import { findCycle } from "../repositories/cycles.js";
import { listOrganizationUnits } from "../repositories/organizationUnits.js";
import { findSnapshot, findSnapshotByHash, listSnapshots, listSnapshotsAscending } from "../repositories/snapshots.js";
import { importHooks } from "../services/importHooks.js";
import { buildImportResult } from "../services/importResult.js";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const IMPORT_STEPS = ["baca_file", "saring_header", "simpan_item", "aturan_dan_skor"] as const;
const FORBIDDEN_ORG = "Anda tidak memiliki akses ke eselon I ini.";

/** Memetakan kemajuan impor ke persen: baca 5%, parse + simpan 65%, aturan dan skor 30%. */
function importProgress(handle: JobHandle) {
  const fraction = (event: ImportProgressEvent) => (event.rowsTotal ? Math.min(1, (event.rowsDone ?? 0) / event.rowsTotal) : 0);
  return (event: ImportProgressEvent) => {
    handle.setStep(event.step, event.state === "selesai" ? "selesai" : "berjalan");
    handle.progress({ rowsDone: event.step === "aturan_dan_skor" ? undefined : event.rowsDone, rowsTotal: event.step === "aturan_dan_skor" ? undefined : event.rowsTotal });
    if (event.step === "baca_file") handle.progress({ percent: event.state === "selesai" ? 5 : 0 });
    else if (event.step === "saring_header" || event.step === "simpan_item") handle.progress({ percent: event.state === "selesai" ? 70 : 5 + 65 * fraction(event) });
    else handle.progress({ percent: event.state === "selesai" ? 99 : 70 + 29 * fraction(event) });
  };
}

export function snapshotRoutes(database: Database, jobs: JobRegistry, hooks: IngestHooks = importHooks()) {
  const { db } = database;
  const routes = new Hono<AppEnv>();

  routes.get("/:id/import-overview", requireRole(), async (context) => {
    const cycle = await findCycle(db, context.req.param("id"));
    if (!cycle) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    const scope = context.get("orgScope");
    const user = context.get("user")!;
    const organizations = await listOrganizationUnits(db, scope);
    const snapshots = await listSnapshotsAscending(db, cycle.id, scope);
    const satkerCounts = new Map((await db.select({ organizationUnitId: workUnits.organizationUnitId, total: count() }).from(workUnits).groupBy(workUnits.organizationUnitId)).map((row) => [row.organizationUnitId, row.total]));
    const body: ImportOverviewResponse = {
      cycle,
      rows: organizations.map((organizationUnit) => {
        const own = snapshots.filter((snapshot) => snapshot.organizationUnitId === organizationUnit.id);
        const nextVersionNo = own.length ? Math.max(...own.map((snapshot) => snapshot.versionNo)) + 1 : 1;
        return { organizationUnit, satkerCount: satkerCounts.get(organizationUnit.id) ?? 0, snapshots: own, nextVersionNo, nextLabel: nextVersionNo === 1 ? "Awal" : "Revisi" };
      }),
      canImport: (user.role === "reviewer" || user.role === "admin") && cycle.status === "aktif"
    };
    return context.json(body);
  });

  routes.get("/:id/snapshots", requireRole(), async (context) => {
    if (!(await findCycle(db, context.req.param("id")))) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    return context.json({ snapshots: await listSnapshots(db, context.req.param("id"), context.get("orgScope")) } satisfies SnapshotListResponse);
  });

  // Harus didaftarkan SEBELUM `/:id/snapshots/:snapshotId`, kalau tidak "lookup" terbaca sebagai snapshotId.
  routes.get("/:id/snapshots/lookup", requireRole("reviewer", "admin"), async (context) => {
    const cycleId = context.req.param("id");
    if (!(await findCycle(db, cycleId))) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    const parsed = snapshotLookupQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Hash berkas tidak valid." }, 400);
    const found = await findSnapshotByHash(db, parsed.data.fileHash);
    const visible = found && found.cycleId === cycleId && canAccessOrganization(context.get("orgScope"), found.organizationUnitId);
    return context.json({ snapshot: visible ? found : null } satisfies SnapshotLookupResponse);
  });

  routes.get("/:id/snapshots/:snapshotId", requireRole(), async (context) => {
    const snapshot = await findSnapshot(db, context.req.param("snapshotId"));
    if (!snapshot || snapshot.cycleId !== context.req.param("id")) return context.json({ error: "Snapshot tidak ditemukan." }, 404);
    if (!canAccessOrganization(context.get("orgScope"), snapshot.organizationUnitId)) return context.json({ error: FORBIDDEN_ORG }, 403);
    return context.json({ snapshot } satisfies SnapshotResponse);
  });

  routes.get("/:id/snapshots/:snapshotId/result", requireRole(), async (context) => {
    const snapshot = await findSnapshot(db, context.req.param("snapshotId"));
    if (!snapshot || snapshot.cycleId !== context.req.param("id")) return context.json({ error: "Snapshot tidak ditemukan." }, 404);
    if (!canAccessOrganization(context.get("orgScope"), snapshot.organizationUnitId)) return context.json({ error: FORBIDDEN_ORG }, 403);
    return context.json(await buildImportResult(db, snapshot));
  });

  routes.post("/:id/snapshots", requireRole("reviewer", "admin"), bodyLimit({ maxSize: MAX_UPLOAD_BYTES, onError: (context) => context.json({ error: "Berkas terlalu besar (maks. 500 MB)." }, 413) }), async (context) => {
    const user = context.get("user")!;
    const cycleId = context.req.param("id");
    const form = await context.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return context.json({ error: "Unggah berkas CSV pada field `file`." }, 400);
    const text = (name: string) => { const value = form!.get(name); return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined; };
    const fields = snapshotUploadFieldsSchema.safeParse({ organizationUnitId: text("organizationUnitId"), versionNo: text("versionNo"), async: text("async") });
    if (!fields.success) return context.json({ error: fields.error.issues[0]?.message ?? "Isian unggah tidak valid." }, 400);
    if (fields.data.organizationUnitId && !canAccessOrganization(context.get("orgScope"), fields.data.organizationUnitId)) return context.json({ error: FORBIDDEN_ORG }, 403);

    const directory = await mkdtemp(join(tmpdir(), "nirmala-import-"));
    const cleanup = () => rm(directory, { recursive: true, force: true });
    let cleanupNow = true;
    try {
      const filePath = join(directory, "upload.csv");
      await pipeline(Readable.fromWeb(file.stream() as never), createWriteStream(filePath));
      const input: IngestInput = {
        cycleId, filePath, fileName: file.name, importedBy: user.id, allowedOrganizationUnitIds: context.get("orgScope"),
        expectedOrganizationUnitId: fields.data.organizationUnitId, expectedVersionNo: fields.data.versionNo
      };
      const prepared = await prepareImport(database, input);
      const toDto = async (id: string) => (await findSnapshot(db, id)) as SnapshotDto;

      if (prepared.kind === "existing") return context.json({ snapshot: await toDto(prepared.result.snapshot.id), alreadyImported: true } satisfies SnapshotUploadResponse, 200);

      const release = jobs.tryLock(`import:${cycleId}:${prepared.plan.organization.id}`);
      if (!release) return context.json({ error: "Impor lain untuk eselon I ini sedang berjalan. Tunggu sampai selesai." }, 409);

      if (!fields.data.async) {
        try {
          const result = await executeImport(database, prepared.plan, hooks);
          return context.json({ snapshot: await toDto(result.snapshot.id), alreadyImported: false } satisfies SnapshotUploadResponse, 201);
        } finally { release(); }
      }

      // Asinkron: file sementara dibersihkan saat job selesai.
      cleanupNow = false;
      const handle = jobs.create("import", user.id, [...IMPORT_STEPS], release);
      input.onProgress = importProgress(handle);
      void executeImport(database, prepared.plan, hooks)
        .then(async (result) => handle.finish({ snapshot: await toDto(result.snapshot.id), alreadyImported: false } satisfies SnapshotUploadResponse))
        .catch((error: unknown) => {
          if (!(error instanceof IngestError)) console.error("Impor asinkron gagal:", error);
          handle.fail(error instanceof IngestError ? error.message : "Impor gagal karena kesalahan di server. Tidak ada data yang tersimpan.");
        })
        .finally(() => { void cleanup(); });
      return context.json({ jobId: handle.id } satisfies SnapshotUploadAcceptedResponse, 202);
    } catch (error) {
      if (error instanceof IngestError) return context.json({ error: error.message }, error.status);
      throw error;
    } finally {
      if (cleanupNow) await cleanup();
    }
  });

  return routes;
}
