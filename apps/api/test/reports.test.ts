import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  REPORT_NOTES_CSV_COLUMNS, REPORT_SUMMARY_CSV_COLUMNS,
  type EngineValidationResponse, type ReportSummaryResponse, type TriageListResponse, type TrackerListResponse
} from "@nirmala/shared";
import { answerKeyItems, answerKeySets, auditLogs, chrDocuments, chrNotes, rkaItems, ruleHits } from "../src/db/schema.ts";
import { importAnswerKey } from "../src/services/answerKeyImport.ts";
import { csvCell, toCsv } from "../src/services/reportService.ts";
import { setupPhase6, type Phase6Env } from "./phase6Helpers.ts";

const DAY = 86_400_000;

/** Parser CSV RFC 4180 minimal untuk memeriksa bolak-balik escaping. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const body = text.replace(/^﻿/, "");
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (quoted) {
      if (char === '"' && body[i + 1] === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\r" && body[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i += 1; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const summaryOf = async (env: Phase6Env, cookie: string, query = "") => (await env.getJson<ReportSummaryResponse>(`/api/reports/summary?cycleId=${env.cycleId}${query}`, cookie)).body;
const validationOf = async (env: Phase6Env, cookie: string, query = "") => (await env.getJson<EngineValidationResponse>(`/api/reports/engine-validation?cycleId=${env.cycleId}${query}`, cookie)).body;

test("laporan: autentikasi, validasi, siklus dan eselon I di luar scope", async () => {
  const env = await setupPhase6();
  const { reviewer, leader } = env.sessions;
  for (const path of ["summary", "engine-validation", "export.csv"]) {
    assert.equal((await env.get(`/api/reports/${path}?cycleId=${env.cycleId}`)).status, 401, path);
    assert.equal((await env.get(`/api/reports/${path}`, reviewer.cookie)).status, 400, `${path} tanpa cycleId`);
    assert.equal((await env.get(`/api/reports/${path}?cycleId=tidak-ada`, reviewer.cookie)).status, 404, path);
    assert.equal((await env.get(`/api/reports/${path}?cycleId=${env.cycleId}&organizationUnitId=org_90002`, reviewer.cookie)).status, 403, path);
    assert.equal((await env.get(`/api/reports/${path}?cycleId=${env.cycleId}`, leader.cookie)).status, 200, path);
  }
  assert.equal((await env.get(`/api/reports/export.csv?cycleId=${env.cycleId}&dataset=lain`, reviewer.cookie)).status, 400);
  env.close();
});

test("ringkasan laporan konsisten dengan tracker dan CHR pada skenario demo; mengikuti scope", async () => {
  const env = await setupPhase6();
  const { reviewer, uki, leader, admin } = env.sessions;

  const before = await summaryOf(env, leader.cookie);
  assert.deepEqual([before.notesIssued, before.notesClosed, before.percentClosed, before.medianDaysToClose, before.closedSampleSize], [0, 0, null, null, 0]);
  assert.deepEqual(before.chrDocuments, []);
  assert.equal(before.isFinal, false);

  await env.runLoop();
  const tracker = await env.trackerNotes(admin.cookie);
  const total = Object.values(tracker.statusCounts).reduce((a, b) => a + b, 0);
  const all = await summaryOf(env, leader.cookie);
  assert.equal(all.notesIssued, total);
  assert.equal(all.notesClosed, 0);
  assert.equal(all.percentClosed, 0);
  assert.equal(all.organizationUnit, null);
  assert.equal(Object.values(all.notesByCategory).reduce((a, b) => a + b, 0), total);
  assert.deepEqual(all.chrDocuments.map((chr) => chr.documentNumber), ["CHR/90001/2026/alokasi/001", "CHR/90002/2026/alokasi/002"]);
  const triage = await env.json<TriageListResponse>(await env.get(`/api/triage/items?cycleId=${env.cycleId}`, admin.cookie));
  assert.equal(all.flaggedItems, triage.summary.flaggedItems);
  assert.ok(all.dataAsOf && all.dataAsOf <= Date.now());

  // Scope: reviewer/UKI hanya DJCA; filter eksplisit oleh pimpinan sama dengan scope reviewer.
  const own = await summaryOf(env, reviewer.cookie);
  const ownTracker = await env.trackerNotes(reviewer.cookie);
  assert.equal(own.notesIssued, ownTracker.pagination.total);
  assert.ok(own.notesIssued < all.notesIssued);
  assert.deepEqual(own.chrDocuments.map((chr) => chr.documentNumber), ["CHR/90001/2026/alokasi/001"]);
  assert.deepEqual(await summaryOf(env, uki.cookie), { ...own });
  const filtered = await summaryOf(env, leader.cookie, "&organizationUnitId=org_90001");
  assert.deepEqual({ ...filtered, organizationUnit: null }, { ...own, organizationUnit: null });
  assert.deepEqual(filtered.organizationUnit, { id: "org_90001", code: "90001", shortName: "DJCA", name: "Direktorat Jenderal Contoh A (fiktif)" });

  // Tutup 3 catatan reviewer, lalu atur selisih hari (1, 2, 10) -> median 2, sampel 3.
  const ids = ownTracker.items.slice(0, 3).map((row) => row.id);
  for (const id of ids) assert.equal((await env.call("POST", `/api/tracker/notes/${id}/approve`, reviewer.cookie, {})).status, 200);
  const [chr] = await env.database.db.select().from(chrDocuments).where(eq(chrDocuments.organizationUnitId, "org_90001"));
  for (const [index, id] of ids.entries()) await env.database.db.update(chrNotes).set({ closedAt: chr.issuedAt! + [1, 2, 10][index] * DAY }).where(eq(chrNotes.id, id));
  const closed = await summaryOf(env, reviewer.cookie);
  assert.deepEqual([closed.notesClosed, closed.percentClosed, closed.medianDaysToClose, closed.closedSampleSize], [3, Math.round((3 / own.notesIssued) * 100), 2, 3]);
  // Median genap = rata-rata dua tengah.
  const fourth = ownTracker.items[3].id;
  assert.equal((await env.call("POST", `/api/tracker/notes/${fourth}/approve`, reviewer.cookie, {})).status, 200);
  await env.database.db.update(chrNotes).set({ closedAt: chr.issuedAt! + 20 * DAY }).where(eq(chrNotes.id, fourth));
  assert.equal((await summaryOf(env, reviewer.cookie)).medianDaysToClose, 6);

  // isFinal: false sampai tenggat lewat atau DIPA terbit.
  assert.equal(closed.isFinal, false);
  assert.equal((await env.call("PUT", `/api/cycles/${env.cycleId}`, admin.cookie, { adkDeadline: "2000-01-01" })).status, 200);
  assert.equal((await summaryOf(env, reviewer.cookie)).isFinal, true);
  env.close();
});

test("ringkasan laporan: alasan dismiss dan item di-dismiss", async () => {
  const env = await setupPhase6();
  const { reviewer } = env.sessions;
  const kaos = await env.findItem(reviewer.cookie, "Pengadaan kaos seragam peringatan HUT Kemerdekaan 17 Agustus", "900101");
  const internet = await env.findItem(reviewer.cookie, "Langganan internet kantor", "900101");
  const honor = await env.findItem(reviewer.cookie, "Honor satpam dan pengemudi kantor", "900102");
  for (const [row, reasonCategory] of [[kaos, "ada_dasar_hukum"], [internet, "ada_dasar_hukum"], [honor, "akun_sudah_tepat"]] as const) {
    assert.equal((await env.call("POST", `/api/triage/items/${row.id}/dismiss`, reviewer.cookie, { reasonCategory })).status, 201);
  }
  const summary = await summaryOf(env, reviewer.cookie);
  assert.equal(summary.dismissedItems, 3);
  assert.deepEqual(summary.dismissReasons, [{ code: "ada_dasar_hukum", label: "Sudah ada dasar hukum", count: 2 }, { code: "akun_sudah_tepat", label: "Akun sudah tepat", count: 1 }]);
  const triage = await env.json<TriageListResponse>(await env.get(`/api/triage/items?cycleId=${env.cycleId}`, reviewer.cookie));
  assert.equal(summary.flaggedItems, triage.summary.flaggedItems);
  assert.equal((await summaryOf(env, env.sessions.leader.cookie)).dismissedItems, 3);
  env.close();
});

test("validasi engine pada kunci jawaban sintetis: recall L1/L2 dan precision@N L3 dihitung benar", async () => {
  const env = await setupPhase6();
  const { reviewer, leader } = env.sessions;
  const db = env.database.db;

  // Sebelum Revisi: L1 dan L2; L3 tidak tampil (belum ada datanya).
  const first = await validationOf(env, leader.cookie);
  assert.equal(first.synthetic, true);
  assert.deepEqual(first.sets.map((set) => set.code), ["L1", "L2"]);
  const [l1, l2] = first.sets;
  assert.deepEqual([l1.metric, l1.totalItems, l1.caught, l1.missedCount, l1.n], ["recall", 11, 9, 2, null]);
  assert.equal(l1.value, 9 / 11);
  assert.deepEqual(l1.ruleCodes, ["R02", "R03", "R04", "R05", "R06"]);
  assert.deepEqual([l2.totalItems, l2.caught, l2.value, l2.missedCount], [4, 4, 1, 0]);
  assert.deepEqual(l2.ruleCodes, ["R01", "R07"]);
  assert.match(first.note ?? "", /sintetis/);
  assert.doesNotMatch(JSON.stringify(first), /Satker Fiktif|\b9\d{5}\b|totalAmount|rupiah/i, "tidak memuat nama Satker, kode Satker, atau rupiah");

  // Hitungan independen dari tabel: item kunci jawaban Awal yang punya rule_hits.
  const hitIds = new Set((await db.select({ id: ruleHits.rkaItemId }).from(ruleHits)).map((row) => row.id));
  const keys = await db.select().from(answerKeyItems).where(eq(answerKeyItems.setCode, "L1"));
  const itemsByKey = new Map((await db.select({ id: rkaItems.id, key: rkaItems.itemKey }).from(rkaItems)).map((row) => [row.key, row.id]));
  assert.equal(keys.filter((key) => hitIds.has(itemsByKey.get(key.itemKey)!)).length, l1.caught);

  // Setelah Revisi: L3 precision@5 = berapa item berblokir di 5 skor teratas / 5.
  await env.runLoop();
  const second = await validationOf(env, leader.cookie);
  assert.deepEqual(second.sets.map((set) => set.code), ["L1", "L2", "L3"]);
  const l3 = second.sets[2];
  assert.deepEqual([l3.metric, l3.n, l3.totalItems], ["precision_at_n", 5, 2]);
  const top = await env.json<TriageListResponse>(await env.get(`/api/triage/items?cycleId=${env.cycleId}&organizationUnitId=org_90001&sort=score&dir=desc&pageSize=5`, leader.cookie));
  const blokirTitles = new Set(["Paket meeting evaluasi kinerja", "Perjalanan dinas koordinasi pusat daerah"]);
  const expectedCaught = top.items.filter((item) => blokirTitles.has(item.description)).length;
  assert.equal(l3.caught, expectedCaught);
  assert.equal(l3.value, expectedCaught / 5);
  assert.equal(l3.missedCount, 2 - expectedCaught);
  assert.ok(l3.ruleCodes.every((code) => code === "R08"));
  // L1/L2 tetap dihitung pada snapshot Awal walau snapshot terbaru kini Revisi.
  assert.deepEqual([second.sets[0].totalItems, second.sets[0].caught], [11, 9]);

  // Scope: reviewer (DJCA) tidak melihat item DJCB; pimpinan memfilter DJCB: 3 item L1, tanpa L3.
  const rev = await validationOf(env, reviewer.cookie);
  assert.deepEqual([rev.sets[0].totalItems, rev.sets[0].caught], [8, 6]);
  const djcb = await validationOf(env, leader.cookie, "&organizationUnitId=org_90002");
  assert.deepEqual(djcb.sets.map((set) => [set.code, set.totalItems, set.caught]), [["L1", 3, 3], ["L2", 2, 2]]);
  env.close();
});

test("validasi engine: impor kunci jawaban lokal (JSON), sintetis=false, set diganti, item tak terpecahkan dilaporkan", async () => {
  const env = await setupPhase6();
  const { leader } = env.sessions;
  const result = await importAnswerKey(env.database, {
    synthetic: false,
    sets: [{ code: "L1", title: "Kunci asli", description: "Item berlabel di snapshot Awal", metric: "recall", n: null, note: null }],
    items: [
      { set: "L1", organizationCode: "90001", snapshotLabel: "Awal", satkerCode: "900101", description: "Pengadaan kaos seragam peringatan HUT Kemerdekaan 17 Agustus" },
      { set: "L1", organizationCode: "90001", snapshotLabel: "Awal", satkerCode: "900101", description: "Penggandaan dokumen dan fotokopi" },
      { set: "L1", organizationCode: "90001", snapshotLabel: "Awal", satkerCode: "900101", description: "Item yang tidak ada" },
      { set: "L1", organizationCode: "99999", snapshotLabel: "Awal", itemKey: "x" }
    ]
  }, env.cycleId);
  assert.deepEqual(result, { sets: 1, imported: 2, unresolved: 2 });
  const body = await validationOf(env, leader.cookie);
  assert.equal(body.synthetic, false, "L2 sintetis tidak ikut ditampilkan karena item-nya; hanya set yang tampil menentukan");
  assert.deepEqual(body.sets.map((set) => [set.code, set.totalItems, set.caught, set.value, set.missedCount]), [["L1", 2, 1, 0.5, 1], ["L2", 4, 4, 1, 0]]);
  assert.deepEqual(body.sets[0].ruleCodes, ["R01"]);
  assert.equal(body.note, null, "catatan kunci L1 lama diganti");
  assert.equal((await env.database.db.select().from(answerKeySets).where(eq(answerKeySets.code, "L1")))[0].synthetic, false);
  assert.equal((await env.database.db.select().from(answerKeyItems).where(eq(answerKeyItems.setCode, "L1"))).length, 2);

  // Tanpa kunci jawaban sama sekali: kosong, bukan galat.
  await env.database.db.delete(answerKeyItems);
  await env.database.db.delete(answerKeySets);
  assert.deepEqual(await validationOf(env, leader.cookie), { synthetic: false, sets: [], note: null });
  env.close();
});

test("csvCell dan toCsv: kutip, koma, baris baru, BOM, dan proteksi injeksi rumus", () => {
  assert.equal(csvCell("biasa"), "biasa");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('dia berkata "ya"'), '"dia berkata ""ya"""');
  assert.equal(csvCell("baris1\nbaris2"), '"baris1\nbaris2"');
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("+62812"), "'+62812");
  assert.equal(csvCell("-5"), "'-5");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell('=HYPERLINK("http://x","k")'), `"'=HYPERLINK(""http://x"",""k"")"`);
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(12), "12");
  const csv = toCsv(["a", "b"], [["x", 1], [null, "y,z"]]);
  assert.ok(csv.startsWith("﻿a,b\r\n"));
  assert.deepEqual(parseCsv(csv), [["a", "b"], ["x", "1"], ["", "y,z"]]);
});

test("ekspor CSV dan ringkasan tidak memuat catatan draf", async () => {
  const env = await setupPhase6();
  const { reviewer } = env.sessions;
  const kaos = await env.findItem(reviewer.cookie, "Pengadaan kaos seragam peringatan HUT Kemerdekaan 17 Agustus", "900101");
  assert.equal((await env.call("POST", `/api/triage/items/${kaos.id}/confirm`, reviewer.cookie, { category: "EFISIENSI", text: "Pengadaan kaos tidak esensial.", expectation: { type: "hapus_item" } })).status, 201);
  const csv = await env.get(`/api/reports/export.csv?cycleId=${env.cycleId}`, reviewer.cookie);
  assert.deepEqual(parseCsv(await csv.text()), [[...REPORT_NOTES_CSV_COLUMNS]]);
  assert.equal((await summaryOf(env, reviewer.cookie)).notesIssued, 0);
  env.close();
});

test("ekspor CSV: header, BOM, Content-Disposition, hanya catatan terbit, mengikuti scope, escaping bolak-balik", async () => {
  const env = await setupPhase6();
  const { reviewer, uki, leader, admin } = env.sessions;
  const url = (extra = "") => `/api/reports/export.csv?cycleId=${env.cycleId}${extra}`;

  await env.runLoop();
  const response = await env.get(url(), reviewer.cookie);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="nirmala-catatan-2026-alokasi.csv"');
  assert.deepEqual([...new Uint8Array(await response.clone().arrayBuffer()).slice(0, 3)], [0xef, 0xbb, 0xbf], "BOM UTF-8");
  const text = await response.text(); // dekoder membuang BOM
  assert.ok(text.startsWith(REPORT_NOTES_CSV_COLUMNS.join(",") + "\r\n"));
  const rows = parseCsv(text);
  const [header, ...data] = rows;
  const col = (row: string[], name: (typeof REPORT_NOTES_CSV_COLUMNS)[number]) => row[header.indexOf(name)];

  const tracker = await env.trackerNotes(reviewer.cookie);
  assert.equal(data.length, tracker.pagination.total);
  assert.ok(data.every((row) => col(row, "eselon_i_kode") === "90001" && /^CHR\/90001\//.test(col(row, "nomor_chr"))), "reviewer hanya DJCA");
  assert.ok(data.every((row) => row.length === header.length));
  const internet = data.find((row) => col(row, "uraian_item") === "Langganan internet kantor")!;
  assert.deepEqual([col(internet, "satker_kode"), col(internet, "akun"), col(internet, "kategori"), col(internet, "kode_aturan"), col(internet, "ekspektasi"), col(internet, "status"), col(internet, "hasil_cek_terakhir"), col(internet, "ditutup")],
    ["900101", "522191", "AKUN", "R03", "ganti_akun → 521111", "perlu_verifikasi", "belum_terpenuhi", ""]);
  assert.match(col(internet, "diterbitkan"), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(col(internet, "umur_hari"), "0");

  // Admin/pimpinan: semua eselon I; UKI sama dengan reviewer (scope).
  for (const cookie of [leader.cookie, admin.cookie]) assert.equal(parseCsv(await (await env.get(url(), cookie)).text()).length - 1, (await env.trackerNotes(admin.cookie)).pagination.total);
  assert.equal(parseCsv(await (await env.get(url(), uki.cookie)).text()).length - 1, tracker.pagination.total);
  assert.equal(parseCsv(await (await env.get(url("&organizationUnitId=org_90002"), leader.cookie)).text()).every((row, index) => index === 0 || col(row, "eselon_i_kode") === "90002"), true);

  // Escaping: catatan manual (adendum) dengan koma, kutip, baris baru, dan awalan rumus.
  const sample = tracker.items[0];
  const evil = '=HYPERLINK("http://contoh.test","klik, di sini")';
  const addendum = await env.call("POST", `/api/chr/${sample.chrDocumentId}/addendum`, reviewer.cookie, {
    reason: "Uji ekspor CSV", notes: [{ category: "LAINNYA", title: evil, text: "Catatan uji.", workUnitId: sample.workUnitId, expectation: { type: "manual", instruction: 'Periksa "lagi", baris\nkedua' } }]
  });
  assert.ok([200, 201].includes(addendum.status), `adendum ${addendum.status}`);
  const after = parseCsv(await (await env.get(url(), reviewer.cookie)).text());
  const manual = after.find((row) => row[after[0].indexOf("uraian_item")].startsWith("'="))!;
  assert.equal(manual[after[0].indexOf("uraian_item")], `'${evil}`);
  assert.equal(manual[after[0].indexOf("ekspektasi")], 'manual · Periksa "lagi", baris\nkedua');
  assert.equal(manual[after[0].indexOf("status")], "menunggu_revisi");
  assert.equal(manual.length, after[0].length);
  assert.equal(after.length - 1, data.length + 1);

  // Ringkasan.
  const summary = await env.get(url("&dataset=ringkasan"), reviewer.cookie);
  assert.equal(summary.headers.get("content-disposition"), 'attachment; filename="nirmala-ringkasan-2026-alokasi.csv"');
  const summaryRows = parseCsv(await summary.text());
  assert.deepEqual(summaryRows[0], [...REPORT_SUMMARY_CSV_COLUMNS]);
  const countOf = (dimension: string, key: string) => Number(summaryRows.find((row) => row[0] === dimension && row[1] === key)![2]);
  assert.equal(["menunggu_revisi", "perlu_verifikasi", "dijustifikasi", "closed"].reduce((sum, status) => sum + countOf("status", status), 0), after.length - 1);
  assert.equal(["EFISIENSI", "SATUAN_BIAYA", "AKUN", "LAINNYA"].reduce((sum, category) => sum + countOf("kategori", category), 0), after.length - 1);
  assert.ok(await env.database.db.$count(auditLogs, eq(auditLogs.action, "snapshot.imported")) > 0);
  assert.equal(await env.database.db.$count(auditLogs, eq(auditLogs.entityType, "report")), 0, "ekspor tidak menulis audit (baca saja)");
  env.close();
});
