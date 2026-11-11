/** Mocks for S3 (VITE_MOCK=1). Stateful: an upload creates a job that advances with time, then a snapshot. */
import type { SnapshotLookupResponse } from "@nirmala/shared";
import { ApiError } from "../../lib/api-error";
import { mockCycles, registerMockJob } from "../../lib/mock-defaults";
import { registerMock, respond } from "../../lib/mock";
import { toHex } from "./logic";
import {
  applyScenario,
  buildResult,
  currentRole,
  findSnapshot,
  getCycles,
  importScope,
  jobDto,
  overviewRows,
  runningJobFor,
  store,
  type MockJob
} from "./mock-store";

const scenario = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("scenario") : null;
applyScenario(scenario);

// `?scenario=belum-siklus` shows the "Belum ada siklus" state (replaces the default cycle list).
if (scenario === "belum-siklus") mockCycles.length = 0;

async function requireCycle(id: string) {
  const cycle = (await getCycles()).find((c) => c.id === id);
  if (!cycle) throw new ApiError(404, "Siklus tidak ditemukan.");
  return cycle;
}

registerMock("GET", "/cycles/:id/import-overview", async ({ params }) => {
  const cycle = await requireCycle(params.id);
  const role = await currentRole();
  return {
    cycle,
    rows: overviewRows(cycle.id, importScope(role)),
    canImport: (role === "reviewer" || role === "admin") && cycle.status === "aktif"
  };
});

registerMock("GET", "/cycles/:id/snapshots/lookup", async ({ params, query }) => {
  const cycle = await requireCycle(params.id);
  const hash = (query.fileHash ?? "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new ApiError(400, "Hash berkas harus SHA-256 heksadesimal.");
  const found = store.snapshots.find((s) => s.dto.cycleId === cycle.id && s.hash === hash);
  return { snapshot: found?.dto ?? null } satisfies SnapshotLookupResponse;
});

registerMock("GET", "/cycles/:id/snapshots/:snapshotId/result", async ({ params }) => {
  const cycle = await requireCycle(params.id);
  const stored = findSnapshot(cycle.id, params.snapshotId);
  if (!stored) throw new ApiError(404, "Snapshot tidak ditemukan.");
  return buildResult(stored);
});

registerMock(
  "POST",
  "/cycles/:id/snapshots",
  async ({ params, body }) => {
    const role = await currentRole();
    if (role !== "reviewer" && role !== "admin") throw new ApiError(403, "Peran Anda tidak memiliki akses ke sumber daya ini.");
    const cycle = await requireCycle(params.id);
    if (cycle.status !== "aktif") throw new ApiError(409, "Siklus sudah selesai, impor tidak dapat dilakukan.");
    if (!(body instanceof FormData)) throw new ApiError(400, "Kirim berkas CSV sebagai multipart/form-data.");
    const file = body.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Berkas CSV wajib dikirim.");
    if (file.size === 0) throw new ApiError(400, "Berkas CSV kosong.");
    const orgId = String(body.get("organizationUnitId") ?? "");
    const versionNo = Number(body.get("versionNo") ?? 0);
    if (!importScope(role).includes(orgId)) throw new ApiError(403, "Anda tidak memiliki akses ke eselon I ini.");

    const hash = toHex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
    const duplicate = store.snapshots.find((s) => s.dto.cycleId === cycle.id && s.hash === hash);
    if (duplicate) return respond(200, { snapshot: duplicate.dto, alreadyImported: true });

    const rows = overviewRows(cycle.id, [orgId])[0];
    if (versionNo && versionNo !== rows.nextVersionNo) {
      throw new ApiError(400, `Nomor versi yang diharapkan (v${versionNo}) tidak sama dengan versi berikutnya (v${rows.nextVersionNo}).`);
    }
    if (/\.csv$/i.test(file.name) === false) throw new ApiError(400, "Berkas harus berformat CSV.");
    const now = Date.now();
    if (runningJobFor(cycle.id, orgId, now)) throw new ApiError(409, "Impor lain untuk eselon I ini masih berjalan. Tunggu sampai selesai.");

    const rowsTotal = Math.max(200, Math.round(file.size / 140));
    const job: MockJob = {
      id: `job-${store.seq++}`,
      cycleId: cycle.id,
      orgId,
      versionNo: rows.nextVersionNo,
      fileName: file.name,
      hash,
      startedAt: now,
      durationMs: Math.min(30_000, Math.max(6_000, rowsTotal * 2)),
      rowsTotal,
      userId: "u-mock",
      userName: role === "admin" ? "Admin 01" : "Reviewer 01",
      failMessage: /gagal/i.test(file.name) ? "Kolom wajib TAHUN tidak ditemukan di baris judul berkas." : null,
      snapshotId: null
    };
    store.jobs.set(job.id, job);
    registerMockJob(job.id, (now) => jobDto(job, now));
    return respond(202, { jobId: job.id });
  },
  { delay: [300, 500] }
);

