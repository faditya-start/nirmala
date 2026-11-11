import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import type { MarkDipaIssuedResponse, NoteCategory, NoteStatus, PublicCycleListResponse, PublicTransparencyResponse, ReviewCycleDto } from "@nirmala/shared";
import { createApp } from "../src/app.ts";
import type { Database } from "../src/db/client.ts";
import { auditLogs, chrDocuments, chrNotes, followUpChecks, organizationUnits, publicMetrics, reviewCycles, rkaItems, workUnits } from "../src/db/schema.ts";
import { groupOrganizations } from "../src/services/publicMetrics.ts";
import { setup, DEMO } from "./helpers.ts";
import { setupPhase6 } from "./phase6Helpers.ts";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1);

test("groupOrganizations: k, aturan gabung tambahan, semua kecil, satu eselon I", () => {
  const org = (label: string, total: number) => ({ id: `id-${label}`, label, total });
  const labels = (groups: ReturnType<typeof groupOrganizations>) => groups.map((group) => [group.label, group.orgIds.length]);
  // Semua >= k: tidak ada Lainnya.
  assert.deepEqual(labels(groupOrganizations([org("A", 9), org("B", 5)], 5)), [["A", 1], ["B", 1]]);
  // Dua kecil: digabung, yang besar tetap tampil.
  assert.deepEqual(labels(groupOrganizations([org("A", 9), org("B", 2), org("C", 3), org("D", 5)], 5)), [["A", 1], ["D", 1], ["Lainnya", 2]]);
  // Satu kecil saja: eselon I terkecil berikutnya (>= k) ikut digabung (tie: label).
  assert.deepEqual(labels(groupOrganizations([org("A", 9), org("B", 2), org("C", 6), org("D", 6)], 5)), [["A", 1], ["D", 1], ["Lainnya", 2]]);
  assert.deepEqual(groupOrganizations([org("A", 9), org("B", 2), org("C", 6)], 5).find((group) => group.label === "Lainnya")!.orgIds, ["id-B", "id-C"]);
  // Satu kecil + satu besar: seluruh siklus menjadi Lainnya.
  assert.deepEqual(labels(groupOrganizations([org("A", 9), org("B", 2)], 5)), [["Lainnya", 2]]);
  // Semua kecil.
  assert.deepEqual(labels(groupOrganizations([org("A", 4), org("B", 1)], 5)), [["Lainnya", 2]]);
  // Satu eselon I saja (besar atau kecil): satu baris Lainnya. Tanpa catatan: kosong.
  assert.deepEqual(labels(groupOrganizations([org("A", 50)], 5)), [["Lainnya", 1]]);
  assert.deepEqual(labels(groupOrganizations([org("A", 3)], 5)), [["Lainnya", 1]]);
  assert.deepEqual(groupOrganizations([org("A", 0), org("B", 0)], 5), []);
  // Eselon I tanpa catatan tidak ikut dihitung sebagai "satu kecil".
  assert.deepEqual(labels(groupOrganizations([org("A", 9), org("B", 0), org("C", 3), org("D", 7)], 5)), [["A", 1], ["Lainnya", 2]]);
});

async function addOrgNotes(database: Database, cycleId: string, label: string, spec: { category: NoteCategory; status: NoteStatus; closeAfterDays?: number }[], number: number) {
  const { db } = database;
  const id = `org_${label}`;
  await db.insert(organizationUnits).values({ id, code: `7${number}`, shortName: label, name: `Eselon ${label} (uji)`, createdAt: T0 });
  const chrId = `chr_${label}`;
  await db.insert(chrDocuments).values({ id: chrId, cycleId, organizationUnitId: id, documentNumber: `CHR/7${number}/2026/alokasi/${String(number).padStart(3, "0")}`, status: "issued", createdBy: "usr_admin", issuedAt: T0, createdAt: T0, updatedAt: T0 });
  for (const [index, note] of spec.entries()) {
    await db.insert(chrNotes).values({
      id: `note_${label}_${index}`, chrDocumentId: chrId, category: note.category, text: `Catatan uji ${label} ${index}`, title: `Uji ${label} ${index}`,
      expectation: { type: "manual", instruction: "periksa" }, status: note.status, closedAt: note.closeAfterDays !== undefined ? T0 + note.closeAfterDays * DAY : null,
      createdBy: "usr_admin", createdAt: T0, updatedAt: T0
    });
  }
}
const notes = (n: number, category: NoteCategory = "AKUN", closeDays: number[] = []) => Array.from({ length: n }, (_, index) => (
  index < closeDays.length ? { category, status: "closed" as const, closeAfterDays: closeDays[index] } : { category, status: "perlu_verifikasi" as const }
));

async function dipaCycle(env: Awaited<ReturnType<typeof setup>>, adkDeadline = "2026-10-06") {
  const admin = await env.login(...DEMO.admin);
  const created = await env.app.request("/api/cycles", { method: "POST", headers: { cookie: admin.cookie, "content-type": "application/json" }, body: JSON.stringify({ fiscalYear: 2030, stage: "pagu", adkDeadline }) });
  const { cycle } = (await created.json()) as { cycle: ReviewCycleDto };
  return { admin, cycle };
}

test("publik: eselon I < k digabung ke Lainnya, aturan gabung tambahan, rekap KPI dari baris __TOTAL__, tidak membocorkan unit kecil", async () => {
  const env = await setup();
  const { admin, cycle } = await dipaCycle(env);
  // A: 6 catatan (2 closed hari ke-2 dan ke-4), B: 7 (closed hari 1, 3, 9), C: 2 (closed hari ke-5 = tepat tenggat).
  await addOrgNotes(env.database, cycle.id, "ORG-A", [...notes(2, "AKUN", [2, 4]), ...notes(2, "EFISIENSI"), ...notes(2, "SATUAN_BIAYA")], 1);
  await addOrgNotes(env.database, cycle.id, "ORG-B", [...notes(3, "AKUN", [1, 3, 9]), ...notes(4, "LAINNYA")], 2);
  await addOrgNotes(env.database, cycle.id, "ORG-C", [...notes(1, "EFISIENSI", [5]), ...notes(1, "AKUN")], 3);
  // Catatan draf pada CHR terbit tidak boleh dihitung.
  await env.database.db.insert(chrNotes).values({ id: "note_draf", chrDocumentId: "chr_ORG-B", category: "AKUN", text: "draf", expectation: { type: "hapus_item" }, status: "draf", createdBy: "usr_admin", createdAt: T0, updatedAt: T0, title: "Draf" });

  const mark = await env.app.request(`/api/cycles/${cycle.id}/dipa-issued`, { method: "POST", headers: { cookie: admin.cookie, "content-type": "application/json" }, body: JSON.stringify({ issuedAt: "2026-10-20" }) });
  assert.equal(mark.status, 200);
  const marked = (await mark.json()) as MarkDipaIssuedResponse;
  assert.equal(marked.cycle.dipaIssuedAt, Date.UTC(2026, 9, 20));
  assert.equal(marked.publicMetricRows, await env.database.db.$count(publicMetrics, eq(publicMetrics.cycleId, cycle.id)));

  const response = await env.get(`/api/public/transparency?cycleId=${cycle.id}`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as PublicTransparencyResponse;
  assert.equal(body.minNotes, 5);
  assert.equal(body.synthetic, false);
  // ORG-C (2) kecil sendirian -> ORG-A (terkecil berikutnya, 6) ikut digabung; ORG-B (7) tampil.
  assert.deepEqual(body.rows.map((row) => [row.kind, row.label, row.total]), [["eselon", "ORG-B", 7], ["lainnya", "Lainnya", 8]]);
  assert.deepEqual(body.rows[0].byCategory, { EFISIENSI: 0, SATUAN_BIAYA: 0, AKUN: 3, LAINNYA: 4 });
  assert.deepEqual(body.rows[1].byCategory, { EFISIENSI: 3, SATUAN_BIAYA: 2, AKUN: 3, LAINNYA: 0 });
  assert.deepEqual(body.totals, { byCategory: { EFISIENSI: 3, SATUAN_BIAYA: 2, AKUN: 6, LAINNYA: 4 }, total: 15 });
  // KPI dari baris rekap: 6 closed, 5 sebelum/pada tenggat 6 Okt, median keseluruhan (1,2,3,4,5,9) = 3,5 (tidak bisa dari median per sel).
  assert.deepEqual(body.kpis, { notesTotal: 15, closedBeforeDeadline: 5, closedBeforeDeadlinePercent: 33, medianDaysToClose: 3.5 });
  assert.equal(body.cycle.id, cycle.id);
  const text = JSON.stringify(body);
  assert.ok(!text.includes("ORG-A") && !text.includes("ORG-C"), "unit kecil dan unit yang ikut digabung tidak tampil");
  assert.ok(!text.includes("__TOTAL__") && !text.includes("__ALL__"), "baris rekap bukan baris tabel");

  // Dua kecil (C 2 + D 3): digabung tanpa unit lain; A dan B tampil.
  await addOrgNotes(env.database, cycle.id, "ORG-D", notes(3), 4);
  assert.equal((await env.app.request(`/api/cycles/${cycle.id}/dipa-issued`, { method: "DELETE", headers: { cookie: admin.cookie } })).status, 200);
  assert.equal((await env.app.request(`/api/cycles/${cycle.id}/dipa-issued`, { method: "POST", headers: { cookie: admin.cookie } })).status, 200);
  const second = (await (await env.get(`/api/public/transparency?cycleId=${cycle.id}`)).json()) as PublicTransparencyResponse;
  assert.deepEqual(second.rows.map((row) => [row.label, row.total]), [["ORG-B", 7], ["ORG-A", 6], ["Lainnya", 5]]);
  assert.ok(!JSON.stringify(second).includes("ORG-C") && !JSON.stringify(second).includes("ORG-D"));
  assert.equal(second.totals.total, 18);

  // k besar (PUBLIC_MIN_NOTES): semuanya satu baris Lainnya.
  const big = createApp({ database: env.database, sessionSecret: "test-secret", publicMinNotes: 100, publicSynthetic: true });
  await env.app.request(`/api/cycles/${cycle.id}/dipa-issued`, { method: "DELETE", headers: { cookie: admin.cookie } });
  assert.equal((await big.request(`/api/cycles/${cycle.id}/dipa-issued`, { method: "POST", headers: { cookie: admin.cookie } })).status, 200);
  const all = (await (await big.request(`/api/public/transparency`)).json()) as PublicTransparencyResponse;
  assert.deepEqual(all.rows.map((row) => [row.kind, row.label, row.total]), [["lainnya", "Lainnya", 18]]);
  assert.equal(all.minNotes, 100);
  assert.equal(all.synthetic, true);
  env.close();
});

test("publik: kosong sebelum DIPA terbit; tanpa login/cookie; cache publik; 404 tidak membocorkan; endpoint lama hilang", async () => {
  const env = await setup();
  const { admin, cycle } = await dipaCycle(env);
  const empty = await env.get("/api/public/cycles");
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { cycles: [] });
  assert.equal((await env.get("/api/public/transparency")).status, 404);
  const notIssued = await env.get(`/api/public/transparency?cycleId=${cycle.id}`);
  assert.equal(notIssued.status, 404);
  assert.deepEqual(await notIssued.json(), { error: "Siklus tidak ditemukan." });
  assert.equal((await env.get("/api/public/transparency?cycleId=tidak-ada")).status, 404, "id tidak ada dan DIPA belum terbit tampak sama");
  assert.equal(notIssued.headers.get("cache-control"), "no-store");
  assert.equal((await env.get("/api/public/transparency/summary")).status, 404);
  assert.equal((await env.get("/api/public/transparency/trends")).status, 404);

  // Siklus dengan dipa_issued_at tetapi tanpa public_metrics (impor data lama) tidak tampil.
  await env.database.db.update(reviewCycles).set({ dipaIssuedAt: T0 }).where(eq(reviewCycles.id, cycle.id));
  assert.deepEqual(await (await env.get("/api/public/cycles")).json(), { cycles: [] });
  assert.equal((await env.get(`/api/public/transparency?cycleId=${cycle.id}`)).status, 404);
  await env.database.db.update(reviewCycles).set({ dipaIssuedAt: null }).where(eq(reviewCycles.id, cycle.id));

  // Siklus tanpa catatan terbit: tetap muncul (DIPA terbit), kosong.
  const mark = await env.app.request(`/api/cycles/${cycle.id}/dipa-issued`, { method: "POST", headers: { cookie: admin.cookie } });
  assert.equal(mark.status, 200);
  assert.equal(((await mark.json()) as MarkDipaIssuedResponse).publicMetricRows, 1, "hanya baris rekap");
  const list = await env.get("/api/public/cycles", "nirmala_session=sesi-palsu");
  assert.equal(list.status, 200);
  assert.equal(list.headers.get("cache-control"), "public, max-age=300");
  assert.equal(list.headers.get("set-cookie"), null);
  const cycles = ((await list.json()) as PublicCycleListResponse).cycles;
  assert.deepEqual(cycles.map((entry) => [entry.id, entry.fiscalYear, entry.stage]), [[cycle.id, 2030, "pagu"]]);
  const page = (await (await env.get("/api/public/transparency")).json()) as PublicTransparencyResponse;
  assert.deepEqual([page.rows, page.totals.total, page.kpis], [[], 0, { notesTotal: 0, closedBeforeDeadline: 0, closedBeforeDeadlinePercent: null, medianDaysToClose: null }]);
  assert.equal(page.cycle.id, cycle.id);
  env.close();
});

test("publik: penandaan DIPA hanya admin, 409/404, audit, tarik kembali menghapus agregat, siklus terkunci", async () => {
  const env = await setup();
  const { admin, cycle } = await dipaCycle(env);
  const reviewer = await env.login(...DEMO.reviewer);
  const uki = await env.login(...DEMO.uki);
  const leader = await env.login(...DEMO.leader);
  const call = (method: string, path: string, cookie?: string, body?: unknown) => env.app.request(path, { method, headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const url = `/api/cycles/${cycle.id}/dipa-issued`;

  assert.equal((await call("POST", url)).status, 401);
  for (const session of [reviewer, uki, leader]) {
    assert.equal((await call("POST", url, session.cookie)).status, 403);
    assert.equal((await call("DELETE", url, session.cookie)).status, 403);
  }
  assert.equal((await call("POST", "/api/cycles/tidak-ada/dipa-issued", admin.cookie)).status, 404);
  assert.equal((await call("DELETE", "/api/cycles/tidak-ada/dipa-issued", admin.cookie)).status, 404);
  const notYet = await call("DELETE", url, admin.cookie);
  assert.equal(notYet.status, 409);
  assert.equal((await call("POST", url, admin.cookie, { issuedAt: "bukan-tanggal" })).status, 400);

  assert.equal((await call("POST", url, admin.cookie)).status, 200);
  const twice = await call("POST", url, admin.cookie);
  assert.equal(twice.status, 409);
  assert.deepEqual(await twice.json(), { error: "DIPA siklus ini sudah ditandai terbit." });
  const actions = (await env.database.db.select().from(auditLogs).where(eq(auditLogs.entityId, cycle.id))).map((row) => row.action).sort();
  assert.deepEqual(actions, ["cycle.created", "cycle.dipa_issued", "public_metrics.generated"]);

  // Penjagaan di endpoint siklus lain.
  assert.equal((await call("PUT", `/api/cycles/${cycle.id}`, admin.cookie, { dipaIssuedAt: "2026-12-01" })).status, 400);
  assert.equal((await call("PUT", `/api/cycles/${cycle.id}`, admin.cookie, { dipaIssuedAt: null })).status, 400, "tidak boleh dikosongkan tanpa menarik agregat");
  assert.equal((await call("PUT", `/api/cycles/${cycle.id}`, admin.cookie, { name: "TA 2030 · Pagu (revisi nama)" })).status, 200);
  assert.equal((await call("DELETE", `/api/cycles/${cycle.id}`, admin.cookie)).status, 409);
  assert.equal(((await (await env.get("/api/public/cycles")).json()) as PublicCycleListResponse).cycles[0].name, "TA 2030 · Pagu (revisi nama)");

  const retract = await call("DELETE", url, admin.cookie);
  assert.equal(retract.status, 200);
  assert.equal(((await retract.json()) as { cycle: ReviewCycleDto }).cycle.dipaIssuedAt, null);
  assert.equal(await env.database.db.$count(publicMetrics), 0);
  assert.deepEqual(await (await env.get("/api/public/cycles")).json(), { cycles: [] });
  assert.equal((await env.get(`/api/public/transparency?cycleId=${cycle.id}`)).status, 404);
  assert.ok((await env.database.db.select().from(auditLogs).where(eq(auditLogs.action, "cycle.dipa_retracted"))).length === 1);
  assert.equal((await call("DELETE", `/api/cycles/${cycle.id}`, admin.cookie)).status, 204, "setelah ditarik kembali siklus kosong dapat dihapus");
  env.close();
});

test("publik: batas laju per IP", async () => {
  const env = await setup();
  const limited = createApp({ database: env.database, sessionSecret: "test-secret", publicRatePerMinute: 3 });
  const hit = (ip: string) => limited.request("/api/public/cycles", { headers: { "cf-connecting-ip": ip } });
  for (let index = 0; index < 3; index += 1) assert.equal((await hit("1.1.1.1")).status, 200);
  const blocked = await hit("1.1.1.1");
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
  assert.equal(blocked.headers.get("cache-control"), "no-store");
  assert.equal((await hit("2.2.2.2")).status, 200, "IP lain tidak terpengaruh");
  env.close();
});

test("publik pada skenario demo: HANYA agregat proses, hanya setelah DIPA terbit, hanya membaca public_metrics", async () => {
  const env = await setupPhase6();
  const { reviewer, admin } = env.sessions;
  await env.runLoop();
  const db = env.database.db;

  // Tutup beberapa catatan (reviewer DJCA, admin DJCB) agar closed/median terisi.
  for (const [cookie, org] of [[reviewer.cookie, "org_90001"], [admin.cookie, "org_90002"]] as const) {
    const rows = (await env.trackerNotes(cookie, `&organizationUnitId=${org}`)).items.slice(0, 2);
    for (const row of rows) assert.equal((await env.call("POST", `/api/tracker/notes/${row.id}/approve`, cookie, {})).status, 200);
  }
  assert.equal((await env.call("PUT", `/api/cycles/${env.cycleId}`, admin.cookie, { adkDeadline: "2100-01-01" })).status, 200);
  assert.equal((await env.get("/api/public/cycles")).status, 200);
  assert.deepEqual(await (await env.get("/api/public/cycles")).json(), { cycles: [] }, "belum ada DIPA: tidak ada yang publik");
  assert.equal((await env.get(`/api/public/transparency?cycleId=${env.cycleId}`)).status, 404);

  const issuedByOrg = new Map<string, number>();
  for (const row of await db.select({ org: chrDocuments.organizationUnitId, id: chrNotes.id }).from(chrNotes).innerJoin(chrDocuments, eq(chrDocuments.id, chrNotes.chrDocumentId))) issuedByOrg.set(row.org, (issuedByOrg.get(row.org) ?? 0) + 1);
  const totalIssued = [...issuedByOrg.values()].reduce((a, b) => a + b, 0);

  assert.equal((await env.call("POST", `/api/cycles/${env.cycleId}/dipa-issued`, admin.cookie, {})).status, 200);
  const cyclesBody = (await (await env.get("/api/public/cycles")).json()) as PublicCycleListResponse;
  assert.equal(cyclesBody.cycles.length, 1);
  const page = (await (await env.get("/api/public/transparency")).json()) as PublicTransparencyResponse;
  assert.equal(page.kpis.notesTotal, totalIssued);
  assert.equal(page.totals.total, totalIssued);
  assert.equal(page.kpis.closedBeforeDeadline, 4, "4 catatan closed sebelum tenggat");
  assert.equal(page.kpis.closedBeforeDeadlinePercent, Math.round((4 / totalIssued) * 100));
  assert.equal(page.kpis.medianDaysToClose, 0);
  // Dengan k = 5: DJCA dan DJCB masing-masing punya catatan; apa pun hasil penggabungannya, total konsisten dengan CHR.
  assert.equal(page.rows.reduce((sum, row) => sum + row.total, 0), totalIssued);

  // Privasi: tidak ada kunci selain agregat; tidak ada teks item, nama/kode Satker, atau rupiah.
  const responses = [cyclesBody, page];
  const allowed = new Set(["cycles", "id", "name", "fiscalYear", "stage", "dipaIssuedAt", "cycle", "synthetic", "generatedAt", "minNotes", "kpis", "notesTotal", "closedBeforeDeadline", "closedBeforeDeadlinePercent", "medianDaysToClose", "rows", "kind", "label", "byCategory", "total", "totals", "EFISIENSI", "SATUAN_BIAYA", "AKUN", "LAINNYA"]);
  const keys = (value: unknown): string[] => (value && typeof value === "object" ? Object.entries(value).flatMap(([key, inner]) => [Array.isArray(value) ? "" : key, ...keys(inner)]) : []).filter(Boolean);
  for (const body of responses) assert.deepEqual(keys(body).filter((key) => !allowed.has(key)), [], "kunci di luar agregat");
  const text = JSON.stringify(responses);
  for (const item of await db.select({ description: rkaItems.description }).from(rkaItems)) assert.ok(!text.includes(item.description), `uraian item bocor: ${item.description}`);
  for (const unit of await db.select({ code: workUnits.code, name: workUnits.name }).from(workUnits)) assert.ok(!text.includes(unit.code) && !text.includes(unit.name), `Satker bocor: ${unit.name}`);
  for (const note of await db.select({ text: chrNotes.text }).from(chrNotes)) assert.ok(!text.includes(note.text));
  assert.doesNotMatch(text, /Satker|totalAmount|unitPrice|amount|rupiah|CHR\//i);
  // Baris database juga hanya agregat.
  const stored = await db.select().from(publicMetrics);
  assert.deepEqual(Object.keys(stored[0]).sort(), ["category", "closedBeforeDeadline", "cycleId", "generatedAt", "id", "medianDaysToClose", "notesTotal", "organizationUnitLabel"]);

  // Endpoint publik hanya membaca public_metrics: mengubah/menghapus data proses tidak mengubah jawaban.
  await db.update(chrNotes).set({ status: "closed", closedAt: Date.now() });
  await db.delete(followUpChecks);
  await db.delete(chrNotes);
  assert.deepEqual(await (await env.get("/api/public/transparency")).json(), page);
  assert.deepEqual(await (await env.get("/api/public/cycles")).json(), cyclesBody);

  // Tarik kembali: kosong lagi.
  assert.equal((await env.call("DELETE", `/api/cycles/${env.cycleId}/dipa-issued`, admin.cookie)).status, 200);
  assert.deepEqual(await (await env.get("/api/public/cycles")).json(), { cycles: [] });
  assert.equal((await env.get("/api/public/transparency")).status, 404);
  env.close();
});

test("publik: sumber endpoint publik tidak menyentuh tabel proses saat membaca", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../src/routes/public.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /rkaItems|chrNotes|workUnits|schema\.js/);
  const service = readFileSync(new URL("../src/services/publicMetrics.ts", import.meta.url), "utf8");
  const readPart = service.slice(service.indexOf("export async function listPublicCycles"));
  assert.doesNotMatch(readPart, /rkaItems|chrNotes|workUnits|chrDocuments|loadNotes/);
});
