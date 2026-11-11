import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { readCsvRecords } from "../src/ingest/csvParser.ts";
import { ingestSnapshot, IngestError } from "../src/ingest/ingestService.ts";
import { createCycle } from "../src/repositories/cycles.ts";
import { rkaDocuments, rkaItems, workUnits } from "../src/db/schema.ts";
import { buildFixtureFiles } from "../scripts/syntheticData.ts";
import { DEMO, fixturePath, setup } from "./helpers.ts";

async function context() {
  const env = await setup();
  const cycleId = await createCycle(env.database.db, { fiscalYear: 2026, stage: "alokasi", name: "TA 2026 · Alokasi", adkDeadline: null, dipaIssuedAt: null, createdBy: null });
  const importFile = (name: string, overrides: Partial<Parameters<typeof ingestSnapshot>[1]> = {}) =>
    ingestSnapshot(env.database, { cycleId, filePath: fixturePath(name), fileName: name, importedBy: "usr_admin", allowedOrganizationUnitIds: null, ...overrides });
  return { ...env, cycleId, importFile };
}

/** Item dengan uraian tertentu; `satker` menyaring bila uraian yang sama ada di banyak Satker. */
const itemByDescription = async (env: Awaited<ReturnType<typeof context>>, documentId: string, description: string, satker?: string) => {
  const rows = (await env.database.db.select().from(rkaItems).where(and(eq(rkaItems.documentId, documentId), eq(rkaItems.description, description))))
    .filter((row) => !satker || row.itemKey.startsWith(`${satker}|`));
  assert.equal(rows.length, 1, `item "${description}" harus tepat satu`);
  return rows[0];
};

test("parser CSV: kutip, koma, newline di dalam kutip, CRLF, BOM, dan batas chunk", async () => {
  const dir = await mkdtemp(join(tmpdir(), "csv-"));
  const path = join(dir, "a.csv");
  await writeFile(path, "﻿a,b,c\r\n1,\"x, y\",\"baris1\nbaris2\"\r\n2,\"kata \"\"kutip\"\"\",\r\n\r\n,,\r\n,\r\n3,,z\r\n,");
  for (const chunk of [1, 2, 3, 7, 1 << 20]) {
    const rows: string[][] = [];
    for await (const row of readCsvRecords(path, chunk)) rows.push(row);
    assert.deepEqual(rows, [["a", "b", "c"], ["1", "x, y", "baris1\nbaris2"], ["2", 'kata "kutip"', ""], ["3", "", "z"]], `highWaterMark=${chunk}`);
  }
});

test("fixtures yang di-commit sama dengan keluaran generator (deterministik)", async () => {
  for (const [name, content] of Object.entries(buildFixtureFiles())) assert.equal(await readFile(fixturePath(name), "utf8"), content, name);
});

test("mengimpor berkas yang sama dua kali menghasilkan satu snapshot", async () => {
  const env = await context();
  const first = await env.importFile("awal/es1_90001_2026.csv");
  const second = await env.importFile("awal/es1_90001_2026.csv");
  assert.equal(first.alreadyImported, false);
  assert.equal(second.alreadyImported, true);
  assert.equal(second.snapshot.id, first.snapshot.id);
  assert.equal((await env.database.db.select().from(rkaDocuments)).length, 1);
  assert.equal((await env.database.db.select().from(rkaItems)).length, first.snapshot.rowCount);
  env.close();
});

test("baris judul kelompok tersaring dan hanya item detail yang tersimpan", async () => {
  const env = await context();
  const { snapshot } = await env.importFile("awal/es1_90001_2026.csv");
  const totalRows = (await readFile(fixturePath("awal/es1_90001_2026.csv"), "utf8")).trim().split("\n").length - 1;
  assert.equal(snapshot.rowCount, 87);
  assert.equal(snapshot.headerRowsSkipped, totalRows - 87);
  assert.ok(snapshot.headerRowsSkipped > 0);
  assert.equal(snapshot.label, "Awal");
  assert.equal(snapshot.versionNo, 1);
  assert.equal(snapshot.diffSummary, null);
  const descriptions = (await env.database.db.select({ description: rkaItems.description }).from(rkaItems)).map((row) => row.description);
  assert.ok(!descriptions.some((description) => description.startsWith("Akun ") || description === "LAYANAN PERKANTORAN"));
  env.close();
});

test("diff awal → revisi sesuai angka yang diharapkan", async () => {
  const env = await context();
  const manifest = JSON.parse(await readFile(fixturePath("manifest.json"), "utf8")) as { expectedDiff: Record<string, unknown> };
  for (const code of ["90001", "90002"]) {
    await env.importFile(`awal/es1_${code}_2026.csv`);
    const revisi = await env.importFile(`revisi/es1_${code}_2026.csv`);
    assert.equal(revisi.snapshot.label, "Revisi");
    assert.equal(revisi.snapshot.versionNo, 2);
    assert.deepEqual(revisi.snapshot.diffSummary, manifest.expectedDiff[code]);
  }
  assert.deepEqual(manifest.expectedDiff["90001"], { baru: 2, berubah: 7, tetap: 77, hilang: 3 });
  assert.deepEqual(manifest.expectedDiff["90002"], { baru: 1, berubah: 2, tetap: 61, hilang: 2 });
  env.close();
});

test("item yang akunnya diganti di revisi tetap cocok dengan item awal", async () => {
  const env = await context();
  const awal = (await env.importFile("awal/es1_90001_2026.csv")).snapshot;
  const revisi = (await env.importFile("revisi/es1_90001_2026.csv")).snapshot;
  for (const [description, from, to] of [["Honor satpam dan pengemudi kantor", "521213", "521111"], ["Cetak kop surat dan amplop dinas", "521111", "521211"], ["Pengadaan laptop untuk staf", "521211", "532111"]]) {
    const before = await itemByDescription(env, awal.id, description);
    const after = await itemByDescription(env, revisi.id, description);
    assert.equal(before.accountCode, from);
    assert.equal(after.accountCode, to);
    assert.equal(after.previousItemId, before.id, description);
    assert.equal(after.changeType, "berubah");
  }
  const unchanged = await itemByDescription(env, revisi.id, "Jasa kebersihan kantor (cleaning service)");
  assert.equal(unchanged.changeType, "tetap");
  env.close();
});

test("langkah 2: uraian yang berubah dicocokkan lewat akun + CONS_ITEM", async () => {
  const env = await context();
  const awal = (await env.importFile("awal/es1_90001_2026.csv")).snapshot;
  const revisi = (await env.importFile("revisi/es1_90001_2026.csv")).snapshot;
  const before = await itemByDescription(env, awal.id, "Belanja ATK kegiatan", "900101");
  const after = await itemByDescription(env, revisi.id, "Belanja alat tulis kantor kegiatan", "900101");
  assert.equal(after.previousItemId, before.id);
  assert.equal(after.changeType, "berubah");
  assert.notEqual(after.itemKey, before.itemKey);
  env.close();
});

test("uraian kembar di subkomponen yang sama mendapat item_key berbeda dan tetap berpasangan", async () => {
  const env = await context();
  const awal = (await env.importFile("awal/es1_90001_2026.csv")).snapshot;
  const revisi = (await env.importFile("revisi/es1_90001_2026.csv")).snapshot;
  const pick = (documentId: string) => env.database.db.select().from(rkaItems).where(and(eq(rkaItems.documentId, documentId), eq(rkaItems.description, "Honorarium narasumber")));
  const before = (await pick(awal.id)).filter((item) => item.itemKey.startsWith("900101|"));
  const after = (await pick(revisi.id)).filter((item) => item.itemKey.startsWith("900101|"));
  assert.deepEqual(before.map((item) => item.itemKey.slice(-1)).sort(), ["1", "2"]);
  assert.deepEqual(after.map((item) => item.previousItemId).sort(), before.map((item) => item.id).sort());
  env.close();
});

test("item di revisi yang baru ditandai baru dan blokir tersimpan", async () => {
  const env = await context();
  await env.importFile("awal/es1_90001_2026.csv");
  const revisi = (await env.importFile("revisi/es1_90001_2026.csv")).snapshot;
  const added = await itemByDescription(env, revisi.id, "Pengadaan perangkat lunak analisis");
  assert.equal(added.changeType, "baru");
  assert.equal(added.previousItemId, null);
  const blocked = await itemByDescription(env, revisi.id, "Paket meeting evaluasi kinerja");
  assert.equal(blocked.blokirCode, "2");
  assert.equal(blocked.blokirAmount, 15_000_000);
  env.close();
});

test("impor yang gagal di tengah berkas di-rollback seluruhnya", async () => {
  const env = await context();
  const lines = (await readFile(fixturePath("awal/es1_90001_2026.csv"), "utf8")).trim().split("\n");
  const columns = lines[0].split(",");
  const kdsatker = columns.indexOf("KDSATKER");
  const bad = lines[lines.length - 1].split(",");
  bad[kdsatker] = "bukan-angka";
  const dir = await mkdtemp(join(tmpdir(), "bad-"));
  const path = join(dir, "bad.csv");
  await writeFile(path, [...lines, bad.join(",")].join("\n"));
  await assert.rejects(() => env.importFile("x", { filePath: path }), (error: unknown) => error instanceof IngestError && /KDSATKER/.test(error.message) && error.status === 400);
  assert.equal((await env.database.db.select().from(rkaDocuments)).length, 0);
  assert.equal((await env.database.db.select().from(rkaItems)).length, 0);
  assert.equal((await env.database.db.select().from(workUnits)).length, 0);
  env.close();
});

test("berkas tidak valid ditolak dengan pesan jelas", async () => {
  const env = await context();
  const dir = await mkdtemp(join(tmpdir(), "inv-"));
  const write = async (name: string, content: string) => { const path = join(dir, name); await writeFile(path, content); return path; };
  await assert.rejects(async () => env.importFile("x", { filePath: await write("a.csv", "A,B\n1,2\n") }), /Kolom wajib/);
  await assert.rejects(async () => env.importFile("x", { filePath: await write("b.csv", "") }), /kosong/i);
  const good = (await readFile(fixturePath("awal/es1_90001_2026.csv"), "utf8")).replaceAll(",90001,", ",99999,");
  await assert.rejects(async () => env.importFile("x", { filePath: await write("c.csv", good) }), /belum terdaftar/);
  const wrongYear = (await readFile(fixturePath("awal/es1_90001_2026.csv"), "utf8")).replaceAll("2026,90001", "2025,90001");
  await assert.rejects(async () => env.importFile("x", { filePath: await write("d.csv", wrongYear) }), /Tahun anggaran/);
  env.close();
});

test("API: reviewer hanya boleh mengimpor eselon I miliknya; siklus CRUD hanya admin", async () => {
  const env = await setup();
  const admin = await env.login(...DEMO.admin);
  const reviewer = await env.login(...DEMO.reviewer);
  const post = (path: string, cookie: string, body: unknown) => env.app.request(path, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });

  assert.equal((await post("/api/cycles", reviewer.cookie, { fiscalYear: 2026, stage: "alokasi" })).status, 403);
  const created = await post("/api/cycles", admin.cookie, { fiscalYear: 2026, stage: "alokasi", adkDeadline: "2026-11-12" });
  assert.equal(created.status, 201);
  const { cycle } = await created.json() as { cycle: { id: string; name: string; adkDeadline: number } };
  assert.equal(cycle.name, "TA 2026 · Alokasi");
  assert.equal(cycle.adkDeadline, Date.parse("2026-11-12"));
  assert.equal((await post("/api/cycles", admin.cookie, { fiscalYear: 2026, stage: "alokasi" })).status, 409);

  const upload = async (cookie: string, name: string) => {
    const form = new FormData();
    form.set("file", new File([await readFile(fixturePath(name))], name.split("/")[1], { type: "text/csv" }));
    return env.app.request(`/api/cycles/${cycle.id}/snapshots`, { method: "POST", headers: { cookie }, body: form });
  };
  const own = await upload(reviewer.cookie, "awal/es1_90001_2026.csv");
  assert.equal(own.status, 201);
  assert.equal((await own.json() as { snapshot: { rowCount: number } }).snapshot.rowCount, 87);
  assert.equal((await upload(reviewer.cookie, "awal/es1_90001_2026.csv")).status, 200);
  assert.equal((await upload(reviewer.cookie, "awal/es1_90002_2026.csv")).status, 403);
  assert.equal((await upload(admin.cookie, "awal/es1_90002_2026.csv")).status, 201);

  const listAs = async (cookie: string) => (await (await env.get(`/api/cycles/${cycle.id}/snapshots`, cookie)).json() as { snapshots: { organizationUnitCode: string }[] }).snapshots;
  assert.deepEqual((await listAs(reviewer.cookie)).map((snapshot) => snapshot.organizationUnitCode), ["90001"]);
  assert.deepEqual((await listAs(admin.cookie)).map((snapshot) => snapshot.organizationUnitCode).sort(), ["90001", "90002"]);

  const del = await env.app.request(`/api/cycles/${cycle.id}`, { method: "DELETE", headers: { cookie: admin.cookie } });
  assert.equal(del.status, 409);
  env.close();
});
