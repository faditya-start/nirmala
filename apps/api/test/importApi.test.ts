import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImportJobDto, ImportOverviewResponse, ImportResultDto, SnapshotDto, SnapshotUploadResponse, TriageItemDetailResponse } from "@nirmala/shared";
import { createApp } from "../src/app.ts";
import { JobRegistry } from "../src/jobs/registry.ts";
import { DEMO, fixturePath, setup } from "./helpers.ts";

async function context() {
  const env = await setup();
  const admin = await env.login(...DEMO.admin);
  const reviewer = await env.login(...DEMO.reviewer);
  const leader = await env.login(...DEMO.leader);
  const created = await env.app.request("/api/cycles", { method: "POST", headers: { cookie: admin.cookie, "content-type": "application/json" }, body: JSON.stringify({ fiscalYear: 2026, stage: "alokasi" }) });
  const cycleId = ((await created.json()) as { cycle: { id: string } }).cycle.id;
  const json = async <T>(response: Response) => (await response.json()) as T;
  const upload = async (cookie: string, name: string, fields: Record<string, string> = {}, app = env.app, content?: string) => {
    const form = new FormData();
    form.set("file", new File([content ?? await readFile(fixturePath(name))], name.split("/").pop()!, { type: "text/csv" }));
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return app.request(`/api/cycles/${cycleId}/snapshots`, { method: "POST", headers: { cookie }, body: form });
  };
  const waitJob = async (cookie: string, jobId: string) => {
    for (let i = 0; i < 200; i++) {
      const job = await json<ImportJobDto>(await env.get(`/api/jobs/${jobId}`, cookie));
      if (job.status !== "berjalan") return job;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("job tidak selesai");
  };
  const hashOf = async (name: string) => createHash("sha256").update(await readFile(fixturePath(name))).digest("hex");
  return { ...env, admin, reviewer, leader, cycleId, json, upload, waitJob, hashOf };
}

test("lookup terdaftar sebelum /:snapshotId; hash baru -> null, hash dikenal -> snapshot; scope dan validasi", async () => {
  const env = await context();
  const lookup = (cookie: string, hash: string) => env.get(`/api/cycles/${env.cycleId}/snapshots/lookup?fileHash=${hash}`, cookie);
  const hash = await env.hashOf("awal/es1_90001_2026.csv");
  const none = await lookup(env.reviewer.cookie, hash);
  assert.equal(none.status, 200);
  assert.deepEqual(await env.json(none), { snapshot: null });
  assert.equal((await lookup(env.reviewer.cookie, "xyz")).status, 400);
  assert.equal((await lookup(env.leader.cookie, hash)).status, 403, "hanya R dan A");
  assert.equal((await env.get(`/api/cycles/${env.cycleId}/snapshots/lookup?fileHash=${hash}`)).status, 401);

  const uploaded = await env.json<SnapshotUploadResponse>(await env.upload(env.reviewer.cookie, "awal/es1_90001_2026.csv"));
  const found = await env.json<{ snapshot: SnapshotDto }>(await lookup(env.reviewer.cookie, hash));
  assert.equal(found.snapshot.id, uploaded.snapshot.id);
  assert.equal(found.snapshot.importedByName, "Rani Reviewer");
  assert.equal(found.snapshot.rowErrorCount, 0);
  assert.ok(found.snapshot.importDurationMs !== null);
  // hash milik eselon I lain -> null untuk reviewer A, ada untuk admin
  await env.upload(env.admin.cookie, "awal/es1_90002_2026.csv");
  const hashB = await env.hashOf("awal/es1_90002_2026.csv");
  assert.deepEqual(await env.json(await lookup(env.reviewer.cookie, hashB)), { snapshot: null });
  assert.notEqual((await env.json<{ snapshot: unknown }>(await lookup(env.admin.cookie, hashB))).snapshot, null);
  assert.equal((await env.get(`/api/cycles/${env.cycleId}/snapshots/${uploaded.snapshot.id}`, env.reviewer.cookie)).status, 200);
  assert.equal((await env.get(`/api/cycles/${env.cycleId}/snapshots/nope`, env.reviewer.cookie)).status, 404);
  env.close();
});

test("unggah ganda idempoten (200 alreadyImported, SnapshotDto penuh); isian terduga divalidasi (400)", async () => {
  const env = await context();
  const first = await env.upload(env.reviewer.cookie, "awal/es1_90001_2026.csv", { organizationUnitId: "org_90001", versionNo: "1" });
  assert.equal(first.status, 201);
  const firstBody = await env.json<SnapshotUploadResponse>(first);
  assert.equal(firstBody.alreadyImported, false);
  const again = await env.upload(env.reviewer.cookie, "awal/es1_90001_2026.csv");
  assert.equal(again.status, 200);
  const againBody = await env.json<SnapshotUploadResponse>(again);
  assert.deepEqual([againBody.alreadyImported, againBody.snapshot.id], [true, firstBody.snapshot.id]);
  assert.equal(againBody.snapshot.organizationUnitName, "DJCA");

  const wrongOrg = await env.upload(env.admin.cookie, "awal/es1_90002_2026.csv", { organizationUnitId: "org_90001" });
  assert.equal(wrongOrg.status, 400);
  assert.equal((await env.json<{ error: string }>(wrongOrg)).error, "Berkas ini milik eselon I lain.");
  const wrongVersion = await env.upload(env.reviewer.cookie, "revisi/es1_90001_2026.csv", { versionNo: "3" });
  assert.equal((await env.json<{ error: string }>(wrongVersion)).error, "Nomor versi yang diharapkan (v3) tidak sama dengan versi berikutnya (v2).");
  assert.equal((await env.upload(env.reviewer.cookie, "revisi/es1_90001_2026.csv", { versionNo: "2" })).status, 201);
  assert.equal((await env.upload(env.leader.cookie, "awal/es1_90002_2026.csv")).status, 403);
  assert.equal((await env.upload(env.reviewer.cookie, "awal/es1_90002_2026.csv")).status, 403, "di luar scope");
  env.close();
});

test("import-overview: baris per eselon I dalam scope, versi berikutnya, canImport", async () => {
  const env = await context();
  const overview = async (cookie: string) => env.json<ImportOverviewResponse>(await env.get(`/api/cycles/${env.cycleId}/import-overview`, cookie));
  const empty = await overview(env.admin.cookie);
  assert.deepEqual(empty.rows.map((row) => [row.organizationUnit.code, row.snapshots.length, row.nextVersionNo, row.nextLabel, row.satkerCount]), [["90001", 0, 1, "Awal", 0], ["90002", 0, 1, "Awal", 0]]);
  assert.equal(empty.canImport, true);
  await env.upload(env.admin.cookie, "awal/es1_90001_2026.csv");
  const after = await overview(env.reviewer.cookie);
  assert.equal(after.rows.length, 1);
  assert.deepEqual([after.rows[0].satkerCount, after.rows[0].nextVersionNo, after.rows[0].nextLabel, after.rows[0].snapshots[0].versionNo], [5, 2, "Revisi", 1]);
  assert.equal((await overview(env.leader.cookie)).canImport, false);
  assert.equal((await env.get("/api/cycles/nope/import-overview", env.admin.cookie)).status, 404);
  env.close();
});

test("impor asinkron: 202 + job, polling sampai selesai, hasil = SnapshotUploadResponse; akses job", async () => {
  const env = await context();
  const accepted = await env.upload(env.reviewer.cookie, "awal/es1_90001_2026.csv", { async: "true" });
  assert.equal(accepted.status, 202);
  const { jobId } = await env.json<{ jobId: string }>(accepted);
  const job = await env.waitJob(env.reviewer.cookie, jobId);
  assert.equal(job.status, "selesai");
  assert.equal(job.kind, "import");
  assert.equal(job.percent, 100);
  assert.deepEqual(job.steps.map((step) => [step.key, step.status]), [["baca_file", "selesai"], ["saring_header", "selesai"], ["simpan_item", "selesai"], ["aturan_dan_skor", "selesai"]]);
  assert.equal(job.result!.alreadyImported, false);
  assert.equal(job.result!.snapshot.rowCount, 87);
  assert.ok(job.rowsTotal! >= 87 && job.finishedAt !== null && job.error === null);
  assert.equal((await env.get(`/api/jobs/${jobId}`, env.admin.cookie)).status, 200, "admin boleh");
  assert.equal((await env.get(`/api/jobs/${jobId}`, env.leader.cookie)).status, 403);
  assert.equal((await env.get("/api/jobs/job_tidak_ada", env.admin.cookie)).status, 404);
  assert.equal((await env.get(`/api/jobs/${jobId}`)).status, 401);
  // hash yang sudah ada -> tetap sinkron 200 tanpa job
  const dup = await env.upload(env.reviewer.cookie, "awal/es1_90001_2026.csv", { async: "true" });
  assert.equal(dup.status, 200);
  // hasil impor tersimpan (aturan dan skor ikut jalan)
  const result = await env.json<ImportResultDto>(await env.get(`/api/cycles/${env.cycleId}/snapshots/${job.result!.snapshot.id}/result`, env.reviewer.cookie));
  assert.equal(result.itemsAssessed, 87);
  assert.deepEqual(result.ruleHits.map((hit) => [hit.code, hit.itemCount]), [["R01", 1], ["R02", 2], ["R03", 1], ["R04", 1], ["R05", 1], ["R06", 1], ["R07", 1]]);
  env.close();
});

test("job gagal melaporkan galat dan membatalkan transaksi; satu impor per (siklus, eselon I)", async () => {
  const env = await context();
  const jobs = new JobRegistry();
  const app = createApp({ database: env.database, sessionSecret: "test-secret", jobs });
  const release = jobs.tryLock(`import:${env.cycleId}:org_90001`)!;
  const blocked = await env.upload(env.reviewer.cookie, "awal/es1_90001_2026.csv", {}, app);
  assert.equal(blocked.status, 409);
  assert.equal((await env.upload(env.reviewer.cookie, "awal/es1_90001_2026.csv", { async: "true" }, app)).status, 409);
  release();

  // BAES1 berubah di tengah berkas -> job async gagal (bukan galat prepare), data di-rollback.
  const lines = (await readFile(fixturePath("awal/es1_90001_2026.csv"), "utf8")).trim().split("\n");
  const columns = lines[0].split(",");
  const last = lines[lines.length - 1].split(",");
  last[columns.indexOf("BAES1")] = "90002";
  const bad = [...lines.slice(0, -1), last.join(",")].join("\n");
  const accepted = await env.upload(env.reviewer.cookie, "awal/es1_90001_2026.csv", { async: "true" }, app, bad);
  assert.equal(accepted.status, 202);
  const { jobId } = await env.json<{ jobId: string }>(accepted);
  let job: ImportJobDto | undefined;
  for (let i = 0; i < 200 && job?.status !== "gagal" && job?.status !== "selesai"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    job = await env.json<ImportJobDto>(await app.request(`/api/jobs/${jobId}`, { headers: { cookie: env.reviewer.cookie } }));
  }
  assert.equal(job!.status, "gagal");
  assert.match(job!.error!, /lebih dari satu eselon I/);
  assert.equal(job!.result, null);
  assert.equal((await env.json<{ snapshots: unknown[] }>(await env.get(`/api/cycles/${env.cycleId}/snapshots`, env.admin.cookie))).snapshots.length, 0, "transaksi dibatalkan");
  // kunci dilepas setelah job gagal: impor berikutnya diterima
  assert.equal((await env.upload(env.reviewer.cookie, "awal/es1_90001_2026.csv", {}, app)).status, 201);
  env.close();
});

test("D2 lewat API: baris galat dilewati, hasil impor memuat rowErrors dan state tanpa kena aturan", async () => {
  const env = await context();
  const lines = (await readFile(fixturePath("awal/es1_90001_2026.csv"), "utf8")).trim().split("\n");
  const columns = lines[0].split(",");
  const idx = lines.findIndex((text, i) => i > 0 && text.split(",")[columns.indexOf("HEADER1")] === "0" && text.split(",")[columns.indexOf("HEADER2")] === "0" && text.split(",")[columns.indexOf("URAIAN_ITEM")] === "Penggandaan dokumen dan fotokopi");
  const cells = lines[idx].split(",");
  cells[columns.indexOf("VOLKEG")] = "dua puluh";
  lines[idx] = cells.join(",");
  const response = await env.upload(env.reviewer.cookie, "awal/es1_90001_2026.csv", {}, env.app, lines.join("\n"));
  assert.equal(response.status, 201);
  const { snapshot } = await env.json<SnapshotUploadResponse>(response);
  assert.equal(snapshot.rowErrorCount, 1);
  assert.equal(snapshot.rowCount, 86);
  const result = await env.json<ImportResultDto>(await env.get(`/api/cycles/${env.cycleId}/snapshots/${snapshot.id}/result`, env.reviewer.cookie));
  assert.deepEqual(result.rowErrors, [{ line: idx + 1, column: "VOLKEG", value: "dua puluh", reason: "bukan_angka", message: "Bukan angka." }]);
  assert.equal(result.rowsRead, 86 + result.headerRowsSkipped + 1);
  assert.equal(result.diff, null);
  assert.equal((await env.get(`/api/cycles/${env.cycleId}/snapshots/${snapshot.id}/result`, env.leader.cookie)).status, 200);
  const other = await env.upload(env.admin.cookie, "awal/es1_90002_2026.csv");
  const otherId = (await env.json<SnapshotUploadResponse>(other)).snapshot.id;
  assert.equal((await env.get(`/api/cycles/${env.cycleId}/snapshots/${otherId}/result`, env.reviewer.cookie)).status, 403);
  env.close();
});

test("revisi: hasil impor memuat diff dan hit; item tetap mewarisi hit dan keputusan, item berubah perlu ditinjau ulang", async () => {
  const env = await context();
  for (const code of ["90001", "90002"]) await env.upload(env.admin.cookie, `awal/es1_${code}_2026.csv`);
  const find = async (description: string, satker: string) => {
    const response = await env.get(`/api/triage/items?cycleId=${env.cycleId}&q=${encodeURIComponent(description)}&pageSize=50`, env.admin.cookie);
    return ((await response.json()) as { items: { id: string; workUnitCode: string; description: string; decision: string; decisionInherited: boolean; ruleCodes: string[]; changeType: string }[] }).items.find((item) => item.description === description && item.workUnitCode === satker)!;
  };
  const kept = await find("Jasa kebersihan kantor (cleaning service)", "900103"); // tetap di revisi, R02
  const changed = await find("Honor satpam dan pengemudi kantor", "900102"); // berubah (akun diperbaiki)
  for (const item of [kept, changed]) assert.equal((await env.app.request(`/api/triage/items/${item.id}/dismiss`, { method: "POST", headers: { cookie: env.admin.cookie, "content-type": "application/json" }, body: JSON.stringify({ reasonCategory: "akun_sudah_tepat" }) })).status, 201);

  const revisi = await env.json<SnapshotUploadResponse>(await env.upload(env.admin.cookie, "revisi/es1_90001_2026.csv"));
  const result = await env.json<ImportResultDto>(await env.get(`/api/cycles/${env.cycleId}/snapshots/${revisi.snapshot.id}/result`, env.admin.cookie));
  assert.deepEqual(result.diff, { baru: 2, berubah: 7, tetap: 77, hilang: 3 });
  assert.equal(result.itemsAssessed, 9);
  assert.deepEqual(result.recheckedNotes, []);
  assert.ok(result.ruleHits.some((hit) => hit.code === "R08" && hit.itemCount === 2));

  const keptNew = await find("Jasa kebersihan kantor (cleaning service)", "900103");
  assert.equal(keptNew.changeType, "tetap");
  assert.deepEqual(keptNew.ruleCodes, ["R02"], "hit diwarisi dari padanan");
  assert.deepEqual([keptNew.decision, keptNew.decisionInherited], ["dismiss", true]);
  const detail = (await (await env.get(`/api/triage/items/${keptNew.id}`, env.admin.cookie)).json()) as TriageItemDetailResponse;
  assert.equal(detail.decision!.inherited, true);
  assert.equal(detail.canDecide, false);
  assert.equal((await env.app.request(`/api/triage/items/${keptNew.id}/dismiss`, { method: "POST", headers: { cookie: env.admin.cookie, "content-type": "application/json" }, body: JSON.stringify({ reasonCategory: "lainnya" }) })).status, 409);
  assert.equal((await env.app.request(`/api/triage/items/${keptNew.id}/decision`, { method: "DELETE", headers: { cookie: env.admin.cookie } })).status, 404, "keputusan diwarisi tidak bisa dicabut dari sini");
  const changedNew = await find("Honor satpam dan pengemudi kantor", "900102");
  assert.deepEqual([changedNew.changeType, changedNew.decision], ["berubah", "belum_ditinjau"]);
  const changedDetail = (await (await env.get(`/api/triage/items/${changedNew.id}`, env.admin.cookie)).json()) as TriageItemDetailResponse;
  assert.equal(changedDetail.previousVersion!.versionNo, 1);
  assert.deepEqual(changedDetail.previousVersion!.fields.filter((field) => field.changed).map((field) => [field.field, field.before, field.after]), [["account_code", "521213", "521111"]]);
  // Item awal v1 tidak lagi tampil di daftar (hanya snapshot terbaru) dan keputusan lama tidak bisa diubah (snapshot lama)
  const old = await find("Jasa kebersihan kantor (cleaning service)", "900103");
  assert.notEqual(old.id, kept.id);
  assert.equal((await env.app.request(`/api/triage/items/${changed.id}/decision`, { method: "DELETE", headers: { cookie: env.admin.cookie } })).status, 204);
  env.close();
});
