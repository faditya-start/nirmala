import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import type {
  ChrDetailResponse, ConfirmItemResponse, ImportResultDto, NavCountsResponse, NeedsActionResponse, NoteActionResponse, SatkerProgressResponse,
  SnapshotUploadResponse, TrackerListResponse, TrackerNoteDetailResponse, BulkApproveResponse, CheckResult, Expectation
} from "@nirmala/shared";
import { auditLogs, chrDocuments, chrNotes, followUpChecks } from "../src/db/schema.ts";
import { fixturePath, setupSeeded } from "./helpers.ts";

const sleep = (ms = 3) => new Promise((resolve) => setTimeout(resolve, ms));

/** Catatan uji pada eselon I 90001 (reviewer demo) dan hasil cek yang dirancang di fixtures Revisi. */
const CASES = {
  honor: { description: "Honor satpam dan pengemudi kantor", satker: "900102", category: "AKUN", expectation: { type: "ganti_akun", to: "521111" }, expected: "terpenuhi" },
  kop: { description: "Cetak kop surat dan amplop dinas", satker: "900104", category: "AKUN", expectation: { type: "ganti_akun", to: "521211" }, expected: "terpenuhi" },
  laptop: { description: "Pengadaan laptop untuk staf", satker: "900102", category: "AKUN", expectation: { type: "ganti_akun", to: "532111" }, expected: "terpenuhi" },
  kebersihan: { description: "Jasa kebersihan kantor (cleaning service)", satker: "900103", category: "AKUN", expectation: { type: "ganti_akun", to: "521111" }, expected: "belum_terpenuhi" },
  internet: { description: "Langganan internet kantor", satker: "900101", category: "AKUN", expectation: { type: "ganti_akun", to: "521111" }, expected: "belum_terpenuhi" },
  kaos: { description: "Pengadaan kaos seragam peringatan HUT Kemerdekaan 17 Agustus", satker: "900101", category: "EFISIENSI", expectation: { type: "hapus_item" }, expected: "terpenuhi" },
  pelatihan: { description: "Belanja bahan pelatihan", satker: "900103", category: "LAINNYA", expectation: { type: "ganti_akun", to: "521111" }, expected: "item_tidak_ditemukan" },
  koordinasi: { description: "Biaya koordinasi lain-lain", satker: "900103", category: "EFISIENSI", expectation: { type: "rinci_item" }, expected: "belum_terpenuhi" },
  uangHarian: { description: "Uang harian perjalanan dinas dalam negeri", satker: "900104", category: "SATUAN_BIAYA", expectation: { type: "turunkan_nilai", maxUnitPrice: 500_000 }, expected: "terpenuhi" }
} as const satisfies Record<string, { description: string; satker: string; category: string; expectation: Expectation; expected: CheckResult }>;
type CaseKey = keyof typeof CASES;

async function trackerEnv() {
  const env = await setupSeeded();
  const { reviewer, uki, leader, admin } = env.sessions;
  const json = async <T>(response: Response) => (await response.json()) as T;
  const db = env.database.db;

  const confirm = async (cookie: string, description: string, satker: string, category: string, expectation: Expectation) => {
    const row = await env.findItem(admin.cookie, description, satker);
    const response = await env.call("POST", `/api/triage/items/${row.id}/confirm`, cookie, { category, text: `Catatan uji: ${description}.`, expectation });
    assert.equal(response.status, 201, description);
    return json<ConfirmItemResponse>(response);
  };
  const confirmCases = async (keys: CaseKey[]) => {
    const noteIds = {} as Record<CaseKey, string>;
    let chrId = "";
    for (const key of keys) {
      const spec = CASES[key];
      const result = await confirm(reviewer.cookie, spec.description, spec.satker, spec.category, spec.expectation);
      noteIds[key] = result.note.id;
      chrId = result.chr.id;
    }
    return { noteIds, chrId };
  };
  const issue = async (chrId: string, cookie = reviewer.cookie) => {
    const response = await env.call("POST", `/api/chr/${chrId}/issue`, cookie);
    assert.equal(response.status, 200);
  };
  const uploadRevisi = async (code: string, cookie = reviewer.cookie) => {
    const name = `revisi/es1_${code}_2026.csv`;
    const form = new FormData();
    form.set("file", new File([await readFile(fixturePath(name))], name.split("/")[1], { type: "text/csv" }));
    return env.app.request(`/api/cycles/${env.cycleId}/snapshots`, { method: "POST", headers: { cookie }, body: form });
  };
  const list = async (cookie: string, query = "") => {
    const response = await env.get(`/api/tracker/notes?cycleId=${env.cycleId}${query}`, cookie);
    assert.equal(response.status, 200);
    return json<TrackerListResponse>(response);
  };
  const detail = async (noteId: string, cookie: string) => json<TrackerNoteDetailResponse>(await env.get(`/api/tracker/notes/${noteId}`, cookie));
  const act = (cookie: string, noteId: string, action: string, body?: unknown) => env.call("POST", `/api/tracker/notes/${noteId}/${action}`, cookie, body ?? {});
  const progress = async (cookie: string, query = `&organizationUnitId=org_90001`) => json<SatkerProgressResponse>(await env.get(`/api/satker/progress?cycleId=${env.cycleId}${query}`, cookie));
  const statusOf = async (noteId: string) => (await db.select({ status: chrNotes.status }).from(chrNotes).where(eq(chrNotes.id, noteId)))[0].status;
  const resultOf = async (noteId: string) => (await detail(noteId, reviewer.cookie)).latestEvidence?.result ?? null;
  return { ...env, reviewer, uki, leader, admin, json, db, confirm, confirmCases, issue, uploadRevisi, list, detail, act, progress, statusOf, resultOf };
}

const ALL_CASES = Object.keys(CASES) as CaseKey[];

test("skenario MVP: impor Awal -> triage -> terbit CHR -> impor Revisi -> cek otomatis -> reviewer memutuskan -> closed, Satker siap diajukan, CHR completed", async () => {
  const env = await trackerEnv();
  const { reviewer, uki, leader } = env;
  const { noteIds, chrId } = await env.confirmCases(ALL_CASES);

  // Catatan draf belum tampil di tracker.
  assert.deepEqual((await env.list(reviewer.cookie, "&status=menunggu_revisi")).statusCounts, { menunggu_revisi: 0, perlu_verifikasi: 0, dijustifikasi: 0, closed: 0 });
  assert.equal((await env.get(`/api/tracker/notes/${noteIds.honor}`, reviewer.cookie)).status, 404);
  await env.issue(chrId);

  // Setelah terbit: semua menunggu_revisi; Satker belum siap; tracker menunjukkan antrean UKI.
  const waiting = await env.list(reviewer.cookie, "&status=menunggu_revisi");
  assert.equal(waiting.pagination.total, 9);
  assert.deepEqual(waiting.statusCounts, { menunggu_revisi: 9, perlu_verifikasi: 0, dijustifikasi: 0, closed: 0 });
  assert.equal(waiting.chrDocuments.length, 1);
  assert.match(waiting.chrDocuments[0].documentNumber ?? "", /^CHR\/90001\/2026\/alokasi\/\d{3}$/);
  assert.equal((await env.list(reviewer.cookie)).pagination.total, 0, "default tab perlu_verifikasi kosong sebelum revisi");
  const needsUki = await env.json<NeedsActionResponse>(await env.get("/api/needs-action", uki.cookie));
  assert.deepEqual(needsUki.items.map((item) => [item.href, item.count]), [["/tracker?status=menunggu_revisi", 9], ["/chr/" + chrId, 1]]);
  const before = await env.progress(reviewer.cookie);
  assert.equal(before.summary.satkerReady, 0);
  assert.equal(before.summary.satkerWithNotes, 4);
  assert.equal(before.summary.satkerWithoutNotes, 1);
  assert.equal(before.summary.openNotes, 9);
  assert.equal(before.items.at(-1)?.readiness, "tidak_ada_catatan");
  assert.equal(before.items.at(-1)?.workUnitCode, "900105");

  // Impor Revisi eselon I 90001: hook cek otomatis berjalan di transaksi impor.
  await sleep();
  const imported = await env.uploadRevisi("90001");
  assert.equal(imported.status, 201);
  const snapshot = (await env.json<SnapshotUploadResponse>(imported)).snapshot;
  assert.equal(snapshot.versionNo, 2);

  // Tidak ada catatan yang ditutup sistem; semua berpindah ke perlu_verifikasi dengan hasil cek sesuai rancangan fixture.
  const notes = await env.db.select({ id: chrNotes.id, status: chrNotes.status }).from(chrNotes);
  assert.equal(notes.filter((note) => note.status === "closed").length, 0);
  for (const key of ALL_CASES) {
    assert.equal(await env.statusOf(noteIds[key]), "perlu_verifikasi", key);
    assert.equal(await env.resultOf(noteIds[key]), CASES[key].expected, key);
  }
  assert.equal((await env.db.select().from(followUpChecks)).length, 9);
  const result = await env.json<ImportResultDto>(await env.get(`/api/cycles/${env.cycleId}/snapshots/${snapshot.id}/result`, reviewer.cookie));
  assert.equal(result.recheckedNotes.length, 9);
  assert.equal(result.notesMovedToVerification, 9);
  const checkedAudits = (await env.db.select().from(auditLogs).where(eq(auditLogs.action, "note.checked")));
  assert.equal(checkedAudits.length, 9);
  assert.ok(checkedAudits.every((entry) => entry.actorUserId === null), "cek otomatis dicatat sebagai Sistem");

  // Impor ulang berkas yang sama: idempoten, tidak ada cek ganda.
  const again = await env.uploadRevisi("90001");
  assert.equal(again.status, 200);
  assert.equal((await env.json<SnapshotUploadResponse>(again)).alreadyImported, true);
  assert.equal((await env.db.select().from(followUpChecks)).length, 9);

  // Daftar tracker: tab, hasil cek, bulkApprovable, filter, urutan.
  const verify = await env.list(reviewer.cookie);
  assert.equal(verify.pagination.total, 9);
  assert.deepEqual(verify.statusCounts, { menunggu_revisi: 0, perlu_verifikasi: 9, dijustifikasi: 0, closed: 0 });
  assert.equal(verify.items.filter((row) => row.bulkApprovable).length, 5);
  assert.equal((await env.list(reviewer.cookie, "&checkResult=terpenuhi")).pagination.total, 5);
  assert.equal((await env.list(reviewer.cookie, "&checkResult=item_tidak_ditemukan")).items[0].id, noteIds.pelatihan);
  assert.equal((await env.list(reviewer.cookie, "&category=AKUN")).pagination.total, 5);
  const bySatker = await env.list(reviewer.cookie, "&sort=satker&dir=asc");
  assert.deepEqual(bySatker.items.map((row) => row.workUnitName), [...bySatker.items.map((row) => row.workUnitName)].sort());
  const byCheck = await env.list(reviewer.cookie, "&sort=check&dir=asc");
  assert.equal(byCheck.items[0].latestCheck?.result, "terpenuhi");
  assert.equal(byCheck.items.at(-1)?.latestCheck?.result, "item_tidak_ditemukan");
  const paged = await env.list(reviewer.cookie, "&pageSize=4&page=3");
  assert.equal(paged.items.length, 1);
  assert.equal(paged.pagination.totalPages, 3);
  const honorRow = verify.items.find((row) => row.id === noteIds.honor)!;
  assert.equal(honorRow.accountCode, "521111", "akun terkini dari padanan di revisi");
  assert.equal(honorRow.ruleCode, "R02");
  assert.equal(honorRow.latestCheck?.snapshotVersionNo, 2);
  assert.equal((await env.list(leader.cookie)).pagination.total, 9, "pimpinan membaca");

  // Detail: bukti sebelum -> sesudah, izin per peran.
  const honor = await env.detail(noteIds.honor, reviewer.cookie);
  assert.equal(honor.latestEvidence?.snapshotVersionNo, 2);
  assert.equal(honor.latestEvidence?.snapshotLabel, "Revisi");
  assert.deepEqual(honor.latestEvidence?.rows.find((row) => row.field === "account_code"), { field: "account_code", before: "521213", after: "521111", changed: true, expected: "521111" });
  assert.deepEqual(honor.nextStep, { kind: "keputusan_reviewer" });
  assert.deepEqual(honor.permissions, { canApprove: true, canReturn: true, canAcceptJustification: false, canJustify: false });
  assert.deepEqual((await env.detail(noteIds.honor, uki.cookie)).permissions, { canApprove: false, canReturn: false, canAcceptJustification: false, canJustify: true });
  assert.deepEqual((await env.detail(noteIds.honor, leader.cookie)).permissions, { canApprove: false, canReturn: false, canAcceptJustification: false, canJustify: false });
  const gone = await env.detail(noteIds.pelatihan, reviewer.cookie);
  assert.equal(gone.latestEvidence?.result, "item_tidak_ditemukan");
  assert.ok(gone.latestEvidence?.rows.every((row) => row.after === null && row.before !== null));
  const removedKaos = await env.detail(noteIds.kaos, reviewer.cookie);
  assert.equal(removedKaos.latestEvidence?.result, "terpenuhi");
  assert.match(removedKaos.latestEvidence?.note ?? "", /tidak ada/i);

  // Reviewer sudah punya antrean; nav-counts dan needs-action mengikuti tracker.
  assert.equal((await env.json<NavCountsResponse>(await env.get("/api/nav-counts", reviewer.cookie))).trackerPending, 9);
  const needsReviewer = await env.json<NeedsActionResponse>(await env.get("/api/needs-action", reviewer.cookie));
  assert.deepEqual(needsReviewer.items[0], { label: "Catatan perlu verifikasi", href: "/tracker?status=perlu_verifikasi", count: 9 });
  const needsUkiAfter = await env.json<NeedsActionResponse>(await env.get("/api/needs-action", uki.cookie));
  assert.deepEqual(needsUkiAfter.items.slice(0, 1).map((item) => item.count), [4], "UKI: perlu_verifikasi yang belum terpenuhi (4 dari 9)");

  // Setujui massal: hanya yang terpenuhi; sisanya dilaporkan.
  const bulkIds = [...Object.values(noteIds), "note_tidak_ada"];
  const bulk = await env.json<BulkApproveResponse>(await env.call("POST", "/api/tracker/notes/bulk-approve", reviewer.cookie, { noteIds: bulkIds }));
  assert.deepEqual([...bulk.approvedNoteIds].sort(), [noteIds.honor, noteIds.kop, noteIds.laptop, noteIds.kaos, noteIds.uangHarian].sort());
  const reasons = Object.fromEntries(bulk.skipped.map((entry) => [entry.noteId, entry.reason]));
  assert.equal(reasons[noteIds.kebersihan], "belum_terpenuhi");
  assert.equal(reasons[noteIds.internet], "belum_terpenuhi");
  assert.equal(reasons[noteIds.koordinasi], "belum_terpenuhi");
  assert.equal(reasons[noteIds.pelatihan], "belum_terpenuhi");
  assert.equal(reasons["note_tidak_ada"], "tidak_ditemukan");
  assert.deepEqual(bulk.completedChrIds, []);
  const approvedAudits = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "note.approved"));
  assert.equal(approvedAudits.length, 5);
  assert.ok(approvedAudits.every((entry) => entry.actorUserId === "usr_reviewer" && /massal/.test(entry.detail)));
  const closedRow = (await env.list(reviewer.cookie, "&status=closed")).items[0];
  assert.ok(closedRow.id && closedRow.ageDays >= 0);
  // Diulang: sudah closed -> dilewati.
  const repeat = await env.json<BulkApproveResponse>(await env.call("POST", "/api/tracker/notes/bulk-approve", reviewer.cookie, { noteIds: [noteIds.honor] }));
  assert.deepEqual(repeat, { approvedNoteIds: [], skipped: [{ noteId: noteIds.honor, reason: "bukan_perlu_verifikasi" }], completedChrIds: [] });
  const approvedCheck = (await env.db.select().from(followUpChecks).where(eq(followUpChecks.noteId, noteIds.honor)))[0];
  assert.equal(approvedCheck.reviewerAction, "setujui");
  assert.equal(approvedCheck.reviewedBy, "usr_reviewer");

  // Siap diajukan per Satker: 900102 (honor + laptop) dan 900104 (kop + uang harian) siap; 900101 belum (internet terbuka).
  const mid = await env.progress(reviewer.cookie);
  const readiness = Object.fromEntries(mid.items.map((row) => [row.workUnitCode, row.readiness]));
  assert.deepEqual(readiness, { "900101": "belum_siap", "900102": "siap_diajukan", "900103": "belum_siap", "900104": "siap_diajukan", "900105": "tidak_ada_catatan" });
  assert.equal(mid.summary.satkerReady, 2);
  assert.equal(mid.summary.openNotes, 4);
  assert.equal(mid.summary.openNotesPreview.length, 3);
  assert.equal(mid.chr?.status, "issued");
  assert.equal(mid.items[0].lastMovedAt !== null, true);
  const open101 = mid.items.find((row) => row.workUnitCode === "900101")!;
  assert.deepEqual(open101.counts, { menunggu_revisi: 0, perlu_verifikasi: 1, dijustifikasi: 0, closed: 1 });

  // Kembalikan wajib beralasan; UKI mengisi justifikasi; reviewer menerima.
  await sleep();
  assert.equal((await env.act(reviewer.cookie, noteIds.internet, "return", { reason: "abc" })).status, 400);
  assert.equal((await env.act(reviewer.cookie, noteIds.internet, "return", {})).status, 400);
  const returned = await env.json<NoteActionResponse>(await env.act(reviewer.cookie, noteIds.internet, "return", { reason: "Akun belum diganti, mohon direvisi." }));
  assert.equal(returned.note.status, "menunggu_revisi");
  assert.equal(returned.note.closedAt, null);
  assert.equal(returned.chrCompleted, false);
  const returnedCheck = (await env.db.select().from(followUpChecks).where(eq(followUpChecks.noteId, noteIds.internet)))[0];
  assert.equal(returnedCheck.reviewerAction, "kembalikan");
  assert.equal(returnedCheck.reviewerNote, "Akun belum diganti, mohon direvisi.");
  assert.deepEqual((await env.detail(noteIds.internet, reviewer.cookie)).nextStep, { kind: "snapshot_revisi", snapshotVersionNo: 3 });

  await sleep();
  assert.equal((await env.act(uki.cookie, noteIds.internet, "justify", { justification: "pendek" })).status, 400);
  const justified = await env.json<NoteActionResponse>(await env.act(uki.cookie, noteIds.internet, "justify", { justification: "Langganan internet termasuk biaya operasional kantor tetap." }));
  assert.equal(justified.note.status, "dijustifikasi");
  assert.equal(justified.note.justification, "Langganan internet termasuk biaya operasional kantor tetap.");
  assert.equal((await env.db.select({ by: chrNotes.justifiedBy }).from(chrNotes).where(eq(chrNotes.id, noteIds.internet)))[0].by, "usr_uki");
  assert.equal((await env.detail(noteIds.internet, reviewer.cookie)).permissions.canAcceptJustification, true);
  await sleep();
  assert.equal((await env.json<NoteActionResponse>(await env.act(reviewer.cookie, noteIds.internet, "accept-justification", {}))).note.status, "closed");

  // Timeline lengkap untuk catatan yang dikembalikan lalu dijustifikasi.
  const timeline = (await env.detail(noteIds.internet, reviewer.cookie)).timeline;
  assert.deepEqual(timeline.map((event) => event.type), ["dibuat", "terbit", "cek", "dikembalikan", "dijustifikasi", "justifikasi_diterima"]);
  assert.equal(timeline[1].chrVersion, 1);
  assert.equal(timeline[2].actorName, null, "cek otomatis = Sistem");
  assert.equal(timeline[2].checkResult, "belum_terpenuhi");
  assert.equal(timeline[3].reason, "Akun belum diganti, mohon direvisi.");
  assert.equal(timeline[3].actorName, "Rani Reviewer");
  assert.equal(timeline[5].statusAfter, "closed");
  assert.equal((await env.detail(noteIds.internet, reviewer.cookie)).nextStep, null);

  // Justifikasi dari perlu_verifikasi, lalu diterima.
  await sleep();
  assert.equal((await env.act(uki.cookie, noteIds.kebersihan, "justify", { justification: "Jasa kebersihan dikontrak tahunan, akun sesuai kontrak." })).status, 200);
  await sleep();
  assert.equal((await env.act(reviewer.cookie, noteIds.kebersihan, "accept-justification", {})).status, 200);
  // Setujui satu catatan walau belum terpenuhi (keputusan reviewer, A8).
  const approveKoordinasi = await env.json<NoteActionResponse>(await env.act(reviewer.cookie, noteIds.koordinasi, "approve", { note: "Rincian akan diberikan di DIPA." }));
  assert.equal(approveKoordinasi.note.status, "closed");
  assert.equal(approveKoordinasi.chrCompleted, false);
  assert.equal((await env.detail(noteIds.koordinasi, reviewer.cookie)).timeline.at(-1)?.reason, "Rincian akan diberikan di DIPA.");

  // Catatan terakhir -> CHR completed dalam transaksi yang sama.
  const last = await env.json<NoteActionResponse>(await env.act(reviewer.cookie, noteIds.pelatihan, "approve", {}));
  assert.equal(last.note.status, "closed");
  assert.equal(last.chrCompleted, true);
  const [chr] = await env.db.select().from(chrDocuments).where(eq(chrDocuments.id, chrId));
  assert.equal(chr.status, "completed");
  assert.ok(chr.completedAt);
  assert.equal((await env.db.select().from(auditLogs).where(eq(auditLogs.action, "chr.completed"))).length, 1);

  const finalProgress = await env.progress(reviewer.cookie);
  assert.equal(finalProgress.summary.satkerReady, 4);
  assert.equal(finalProgress.summary.satkerWithNotes, 4);
  assert.equal(finalProgress.summary.openNotes, 0);
  assert.equal(finalProgress.chr?.status, "completed");
  assert.deepEqual(finalProgress.items.map((row) => row.readiness), ["siap_diajukan", "siap_diajukan", "siap_diajukan", "siap_diajukan", "tidak_ada_catatan"]);
  assert.equal((await env.json<NavCountsResponse>(await env.get("/api/nav-counts", reviewer.cookie))).trackerPending, 0);
  const needsFinal = await env.json<NeedsActionResponse>(await env.get("/api/needs-action", reviewer.cookie));
  assert.ok(!needsFinal.items.some((item) => item.href.startsWith("/tracker")));

  // Semua penutupan dilakukan pengguna: tiap note.approved / justification_accepted punya aktor.
  const closers = await env.db.select().from(auditLogs).where(eq(auditLogs.entityType, "chr_note"));
  const closeAudits = closers.filter((entry) => entry.action === "note.approved" || entry.action === "note.justification_accepted");
  assert.equal(closeAudits.length, 9);
  assert.ok(closeAudits.every((entry) => entry.actorUserId !== null));
  const detailChr = await env.json<ChrDetailResponse>(await env.get(`/api/chr/${chrId}`, reviewer.cookie));
  assert.equal(detailChr.document.status, "completed");
  assert.equal(detailChr.notesByStatus.closed, 9);
  env.close();
});

test("peran dan scope: reviewer tidak boleh justifikasi, UKI hanya justifikasi di eselon I sendiri, pimpinan baca saja, lintas eselon I 403", async () => {
  const env = await trackerEnv();
  const { reviewer, uki, leader, admin } = env;
  const { noteIds, chrId } = await env.confirmCases(["honor", "kebersihan"]);
  await env.issue(chrId);
  // Eselon I 90002 oleh admin: catatan terbit di luar scope reviewer/UKI demo.
  const other = await env.findItem(admin.cookie, "Seragam batik hari bakti", "900201");
  const confirmed = await env.json<ConfirmItemResponse>(await env.call("POST", `/api/triage/items/${other.id}/confirm`, admin.cookie, { category: "EFISIENSI", text: "Catatan eselon I B.", expectation: { type: "hapus_item" } }));
  await env.issue(confirmed.chr.id, admin.cookie);
  const foreign = confirmed.note.id;

  // menunggu_revisi: approve tidak boleh (409 menyebut status); justify boleh oleh UKI.
  const wrongState = await env.act(reviewer.cookie, noteIds.honor, "approve", {});
  assert.equal(wrongState.status, 409);
  assert.match(((await wrongState.json()) as { error: string }).error, /Menunggu Revisi/);
  assert.equal((await env.act(reviewer.cookie, noteIds.honor, "return", { reason: "alasan cukup" })).status, 409);
  assert.equal((await env.act(reviewer.cookie, noteIds.honor, "accept-justification", {})).status, 409);

  assert.equal((await env.act(reviewer.cookie, noteIds.honor, "justify", { justification: "Reviewer tidak boleh menjustifikasi." })).status, 403);
  assert.equal((await env.act(leader.cookie, noteIds.honor, "justify", { justification: "Pimpinan tidak boleh menjustifikasi." })).status, 403);
  assert.equal((await env.act(uki.cookie, foreign, "justify", { justification: "UKI eselon I lain tidak boleh." })).status, 403);
  assert.equal((await env.act(uki.cookie, noteIds.honor, "justify", { justification: "Satker menjelaskan akun sudah tepat." })).status, 200);
  assert.equal((await env.act(uki.cookie, noteIds.honor, "justify", { justification: "Justifikasi kedua tidak diperlukan." })).status, 409, "sudah dijustifikasi");

  // UKI tidak punya jalur menutup.
  for (const action of ["approve", "return", "accept-justification"]) assert.equal((await env.act(uki.cookie, noteIds.honor, action, { reason: "alasan cukup" })).status, 403, action);
  assert.equal((await env.call("POST", "/api/tracker/notes/bulk-approve", uki.cookie, { noteIds: [noteIds.honor] })).status, 403);
  // Pimpinan baca saja.
  for (const action of ["approve", "return", "accept-justification"]) assert.equal((await env.act(leader.cookie, noteIds.honor, action, { reason: "alasan cukup" })).status, 403, action);
  assert.equal((await env.call("POST", "/api/tracker/notes/bulk-approve", leader.cookie, { noteIds: [noteIds.honor] })).status, 403);
  assert.equal((await env.get(`/api/tracker/notes/${noteIds.honor}`, leader.cookie)).status, 200);
  assert.equal((await env.get(`/api/tracker/notes?cycleId=${env.cycleId}`)).status, 401);
  assert.equal((await env.call("POST", `/api/tracker/notes/${noteIds.honor}/approve`)).status, 401);

  // Lintas eselon I: reviewer/UKI demo (hanya 90001) tidak boleh menyentuh catatan 90002.
  assert.equal((await env.get(`/api/tracker/notes/${foreign}`, reviewer.cookie)).status, 403);
  assert.equal((await env.get(`/api/tracker/notes/${foreign}`, uki.cookie)).status, 403);
  assert.equal((await env.get(`/api/tracker/notes/${foreign}`, admin.cookie)).status, 200);
  assert.equal((await env.get(`/api/tracker/notes/tidak_ada`, reviewer.cookie)).status, 404);
  for (const action of ["approve", "return", "accept-justification"]) assert.equal((await env.act(reviewer.cookie, foreign, action, { reason: "alasan cukup" })).status, 403, action);
  assert.equal((await env.get(`/api/tracker/notes?cycleId=${env.cycleId}&organizationUnitId=org_90002&status=menunggu_revisi`, reviewer.cookie)).status, 403);
  assert.equal((await env.get(`/api/tracker/notes?cycleId=tidak_ada`, reviewer.cookie)).status, 404);
  assert.equal((await env.get(`/api/tracker/notes?cycleId=${env.cycleId}&status=draf`, reviewer.cookie)).status, 400);
  // Daftar otomatis dibatasi scope; admin melihat keduanya.
  const scoped = await env.list(reviewer.cookie, "&status=menunggu_revisi");
  assert.equal(scoped.pagination.total, 1, "honor sudah dijustifikasi; tersisa kebersihan");
  assert.ok(scoped.items.every((row) => row.organizationUnitId === "org_90001"));
  assert.equal((await env.list(admin.cookie, "&status=menunggu_revisi")).pagination.total, 2);
  // Bulk lintas scope: tidak_ada_akses (setelah 90001 direvisi agar catatan perlu_verifikasi).
  const bulk = await env.json<BulkApproveResponse>(await env.call("POST", "/api/tracker/notes/bulk-approve", reviewer.cookie, { noteIds: [foreign, noteIds.kebersihan] }));
  assert.deepEqual(bulk.skipped, [{ noteId: foreign, reason: "tidak_ada_akses" }, { noteId: noteIds.kebersihan, reason: "bukan_perlu_verifikasi" }]);
  assert.equal((await env.call("POST", "/api/tracker/notes/bulk-approve", reviewer.cookie, { noteIds: [] })).status, 400);
  assert.equal((await env.call("POST", "/api/tracker/notes/bulk-approve", reviewer.cookie, { noteIds: Array.from({ length: 501 }, (_, i) => `n${i}`) })).status, 400);

  // Progres Satker: scope dan parameter eselon I.
  assert.equal((await env.get(`/api/satker/progress?cycleId=${env.cycleId}&organizationUnitId=org_90002`, reviewer.cookie)).status, 403);
  assert.equal((await env.get(`/api/satker/progress?cycleId=${env.cycleId}&organizationUnitId=org_90002`, uki.cookie)).status, 403);
  const ukiOwn = await env.json<SatkerProgressResponse>(await env.get(`/api/satker/progress?cycleId=${env.cycleId}`, uki.cookie));
  assert.equal(ukiOwn.organizationUnit.id, "org_90001", "UKI dengan satu eselon I otomatis");
  const noOrg = await env.get(`/api/satker/progress?cycleId=${env.cycleId}`, admin.cookie);
  assert.equal(noOrg.status, 400);
  assert.deepEqual(await noOrg.json(), { error: "Pilih eselon I." });
  assert.equal((await env.progress(leader.cookie, "&organizationUnitId=org_90002")).summary.satkerWithNotes, 1);
  assert.equal((await env.get(`/api/satker/progress?cycleId=${env.cycleId}&organizationUnitId=org_nope`, admin.cookie)).status, 404);
  assert.equal((await env.get(`/api/satker/progress?cycleId=nope&organizationUnitId=org_90001`, admin.cookie)).status, 404);
  env.close();
});

test("cek otomatis tidak menyentuh catatan dijustifikasi; catatan perlu_verifikasi hanya mendapat cek baru; item hilang -> item_tidak_ditemukan", async () => {
  const env = await trackerEnv();
  const { reviewer, uki } = env;
  const { noteIds, chrId } = await env.confirmCases(["honor", "kebersihan", "pelatihan"]);
  await env.issue(chrId);
  // Dijustifikasi sebelum revisi: tidak dicek.
  assert.equal((await env.act(uki.cookie, noteIds.kebersihan, "justify", { justification: "Satker menolak mengganti akun." })).status, 200);
  assert.equal((await env.uploadRevisi("90001")).status, 201);
  assert.equal(await env.statusOf(noteIds.kebersihan), "dijustifikasi");
  assert.equal(await env.resultOf(noteIds.kebersihan), null);
  assert.equal(await env.statusOf(noteIds.honor), "perlu_verifikasi");
  assert.equal(await env.resultOf(noteIds.pelatihan), "item_tidak_ditemukan");
  // Dijustifikasi tidak muncul di tab perlu_verifikasi, hanya di tab dijustifikasi.
  assert.equal((await env.list(reviewer.cookie, "&status=dijustifikasi")).items[0].latestCheck, null);

  // Reviewer mengembalikan satu catatan; revisi berikutnya (v3) dicek lagi mengikuti rantai padanan v1 -> v2 -> v3.
  assert.equal((await env.act(reviewer.cookie, noteIds.honor, "return", { reason: "Mohon dicek lagi pada revisi berikutnya." })).status, 200);
  assert.equal(await env.statusOf(noteIds.honor), "menunggu_revisi");
  const v3 = await readFile(fixturePath("revisi/es1_90001_2026.csv"), "utf8");
  const edited = v3.replace(/(\d+,2026,90001,900102,[^\n]*Honor satpam dan pengemudi kantor[^\n]*)/, (line) => line.replace(",521111,", ",521211,"));
  assert.notEqual(edited, v3, "baris honor ditemukan di revisi");
  const form = new FormData();
  form.set("file", new File([edited], "es1_90001_2026_v3.csv", { type: "text/csv" }));
  const imported = await env.app.request(`/api/cycles/${env.cycleId}/snapshots`, { method: "POST", headers: { cookie: reviewer.cookie }, body: form });
  assert.equal(imported.status, 201);
  assert.equal((await env.json<SnapshotUploadResponse>(imported)).snapshot.versionNo, 3);
  const honorDetail = await env.detail(noteIds.honor, reviewer.cookie);
  assert.equal(honorDetail.latestEvidence?.snapshotVersionNo, 3);
  assert.equal(honorDetail.latestEvidence?.result, "belum_terpenuhi", "akun dikembalikan ke 521211 di v3");
  assert.equal(honorDetail.previousEvidence.length, 1);
  assert.equal(honorDetail.previousEvidence[0].result, "terpenuhi");
  assert.equal(honorDetail.latestEvidence?.rows.find((row) => row.field === "account_code")?.before, "521213", "before selalu item dasar catatan");
  assert.equal(await env.statusOf(noteIds.honor), "perlu_verifikasi");
  // Catatan perlu_verifikasi (pelatihan, hilang sejak v2) mendapat cek baru tanpa pindah status; rantai putus tetap tidak ditemukan.
  assert.equal(await env.statusOf(noteIds.pelatihan), "perlu_verifikasi");
  assert.equal((await env.db.select().from(followUpChecks).where(eq(followUpChecks.noteId, noteIds.pelatihan))).length, 2);
  assert.equal(await env.resultOf(noteIds.pelatihan), "item_tidak_ditemukan");
  assert.equal((await env.db.select().from(chrNotes).where(eq(chrNotes.status, "closed"))).length, 0);
  env.close();
});

test("catatan tanpa item (manual) dicek sebagai data_tidak_cukup dan tetap perlu keputusan reviewer", async () => {
  const env = await trackerEnv();
  const { reviewer, admin } = env;
  const created = await env.call("POST", "/api/chr", admin.cookie, { cycleId: env.cycleId, organizationUnitId: "org_90001" });
  const chrId = ((await created.json()) as { document: { id: string } }).document.id;
  const unit = (await env.json<{ workUnits: { id: string; code: string }[] }>(await env.get("/api/work-units?organizationUnitId=org_90001", admin.cookie))).workUnits.find((entry) => entry.code === "900101")!;
  const note = await env.call("POST", `/api/chr/${chrId}/notes`, reviewer.cookie, {
    category: "LAINNYA", text: "Periksa kelengkapan dokumen pendukung Satker.", title: "Dokumen pendukung", workUnitId: unit.id, expectation: { type: "manual", instruction: "Periksa dokumen pendukung." }
  });
  assert.equal(note.status, 201);
  const noteId = ((await note.json()) as { note: { id: string } }).note.id;
  await env.issue(chrId);
  assert.equal((await env.uploadRevisi("90001")).status, 201);
  const detail = await env.detail(noteId, reviewer.cookie);
  assert.equal(detail.latestEvidence?.result, "data_tidak_cukup");
  assert.match(detail.latestEvidence?.note ?? "", /tidak dapat dicek otomatis/);
  assert.equal(detail.note.status, "perlu_verifikasi");
  assert.equal(detail.permissions.canApprove, true);
  assert.equal((await env.act(reviewer.cookie, noteId, "approve", {})).status, 200);
  env.close();
});

test("demo loop (db:seed:demo): konfirmasi item ter-flag, terbitkan CHR, impor Revisi; idempoten; hasil bisa diputuskan lewat API", async () => {
  const { seedDemoFollowUpLoop } = await import("../src/db/seedDemoLoop.ts");
  const env = await trackerEnv();
  assert.equal((await env.list(env.admin.cookie)).pagination.total, 0, "seed biasa tidak menjalankan loop");

  const first = await seedDemoFollowUpLoop(env.database);
  assert.deepEqual(first.organizations.map((org) => [org.code, org.revisionImported]), [["90001", true], ["90002", true]]);
  assert.ok(first.organizations.every((org) => org.notesIssued > 0));

  const all = await env.list(env.admin.cookie, "&pageSize=100");
  assert.equal(all.pagination.total, first.organizations.reduce((sum, org) => sum + org.notesIssued, 0));
  assert.equal(all.statusCounts.closed, 0, "loop demo tidak menutup catatan");
  assert.equal(all.statusCounts.menunggu_revisi, 0);
  const results = new Set(all.items.map((row) => row.latestCheck?.result));
  assert.ok(results.has("terpenuhi") && results.has("belum_terpenuhi"));
  assert.equal(all.chrDocuments.length, 2);

  // Idempoten: tidak ada catatan, cek, atau snapshot ganda.
  const second = await seedDemoFollowUpLoop(env.database);
  assert.ok(second.organizations.every((org) => org.notesIssued === 0 && !org.revisionImported));
  assert.equal((await env.db.select().from(followUpChecks)).length, all.pagination.total);

  // Reviewer memutuskan lewat API (setujui massal hanya yang terpenuhi).
  const terpenuhi = (await env.list(env.reviewer.cookie, "&checkResult=terpenuhi")).items.map((row) => row.id);
  assert.ok(terpenuhi.length > 0);
  const bulk = await env.json<BulkApproveResponse>(await env.call("POST", "/api/tracker/notes/bulk-approve", env.reviewer.cookie, { noteIds: terpenuhi }));
  assert.equal(bulk.approvedNoteIds.length, terpenuhi.length);
  assert.equal(bulk.skipped.length, 0);
  env.close();
});
