import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import type {
  ChrAddendumResponse, ChrDetailResponse, ChrDocumentResponse, ChrIssueResponse, ChrListResponse, ChrNoteResponse, ChrPrintResponse, ChrVersionDetailResponse,
  ConfirmItemResponse, NavCountsResponse, NeedsActionResponse
} from "@nirmala/shared";
import { auditLogs, chrDocuments, chrNotes, chrVersions, reviewerDecisions, userScopes, users, workUnits } from "../src/db/schema.ts";
import { hashPassword } from "../src/lib/security.ts";
import { syncChrCompletion } from "../src/repositories/chr.ts";
import { DEMO, setupSeeded } from "./helpers.ts";

const R01 = "Pengadaan kaos seragam peringatan HUT Kemerdekaan 17 Agustus";
const HONOR = "Honor satpam dan pengemudi kantor";
const HAPUS = { type: "hapus_item" } as const;

async function setupChr() {
  const env = await setupSeeded();
  const { reviewer, uki, leader, admin } = env.sessions;
  // Reviewer dan PIC UKI eselon I B (sintetis).
  const makeUser = async (id: string, role: "reviewer" | "uki", org: string) => {
    await env.database.db.insert(users).values({ id, username: id, displayName: id, role, passwordHash: await hashPassword("Rahasia123!"), createdAt: Date.now() });
    await env.database.db.insert(userScopes).values({ userId: id, organizationUnitId: org });
    return env.login(id, "Rahasia123!");
  };
  const reviewerB = await makeUser("usr_reviewer_b", "reviewer", "org_90002");
  const ukiB = await makeUser("usr_uki_b", "uki", "org_90002");

  const confirm = async (cookie: string, description: string, satker: string, text = "Catatan uji untuk item ini.", expectation: unknown = HAPUS) => {
    const row = await env.findItem(admin.cookie, description, satker);
    const response = await env.call("POST", `/api/triage/items/${row.id}/confirm`, cookie, { category: "EFISIENSI", text, expectation });
    assert.equal(response.status, 201);
    return { row, ...((await response.json()) as ConfirmItemResponse) };
  };
  const json = async <T>(response: Response) => (await response.json()) as T;
  const detail = async (id: string, cookie: string) => json<ChrDetailResponse>(await env.get(`/api/chr/${id}`, cookie));
  const orgBItem = async () => {
    const page = await env.list(admin.cookie, "&organizationUnitId=org_90002&onlyFlagged=true&pageSize=100");
    return page.items[0];
  };
  return { ...env, reviewer, uki, leader, admin, reviewerB, ukiB, confirm, json, detail, orgBItem };
}

test("satu CHR per (siklus, eselon I): dua Satker masuk satu dokumen; POST /api/chr idempoten; constraint di database", async () => {
  const env = await setupChr();
  const a = await env.confirm(env.reviewer.cookie, R01, "900101");
  const b = await env.confirm(env.reviewer.cookie, HONOR, "900102");
  assert.equal(a.chr.id, b.chr.id);
  assert.equal((await env.database.db.select().from(chrDocuments)).length, 1);

  const again = await env.call("POST", "/api/chr", env.reviewer.cookie, { cycleId: env.cycleId, organizationUnitId: "org_90001" });
  assert.equal(again.status, 200);
  assert.equal((await env.json<ChrDocumentResponse>(again)).document.id, a.chr.id);
  await assert.rejects(() => env.database.db.insert(chrDocuments).values({ id: "dup", cycleId: env.cycleId, organizationUnitId: "org_90001", createdBy: "usr_admin", createdAt: 1, updatedAt: 1 }), /UNIQUE/);

  const created = await env.call("POST", "/api/chr", env.admin.cookie, { cycleId: env.cycleId, organizationUnitId: "org_90002" });
  assert.equal(created.status, 201);
  const second = (await env.json<ChrDocumentResponse>(created)).document;
  assert.deepEqual([second.status, second.documentNumber, second.currentVersion, second.organizationUnitCode, second.fiscalYear, second.stage], ["draft", null, 0, "90002", 2026, "alokasi"]);

  const detail = await env.detail(a.chr.id, env.reviewer.cookie);
  assert.equal(detail.notesTotal, 2);
  assert.equal(detail.notesByStatus.draf, 2);
  assert.deepEqual(detail.groups.map((group) => [group.letter, group.category, group.notes.length]), [["A", "EFISIENSI", 2]]);
  assert.deepEqual(detail.groups[0].notes.map((note) => [note.number, note.workUnitCode, note.status]), [[1, "900101", "draf"], [2, "900102", "draf"]]);
  assert.deepEqual(detail.permissions, { canEditNotes: true, canEditRecommendation: true, canIssue: true, canAddAddendum: false, canRespond: false });
  assert.equal(detail.document.status, "draft");
  env.close();
});

test("daftar: dibatasi scope; eselon I tanpa CHR ditawarkan; filter status; 403 untuk eselon I lain", async () => {
  const env = await setupChr();
  await env.confirm(env.reviewer.cookie, R01, "900101");
  const own = await env.json<ChrListResponse>(await env.get(`/api/chr?cycleId=${env.cycleId}`, env.reviewer.cookie));
  assert.equal(own.items.length, 1);
  assert.deepEqual([own.items[0].organizationUnitCode, own.items[0].status, own.items[0].notesTotal, own.items[0].notesByStatus.draf], ["90001", "draft", 1, 1]);
  assert.deepEqual(own.organizationUnitsWithoutChr, []);
  const all = await env.json<ChrListResponse>(await env.get(`/api/chr?cycleId=${env.cycleId}`, env.leader.cookie));
  assert.deepEqual(all.organizationUnitsWithoutChr.map((unit) => unit.code), ["90002"]);
  assert.equal((await env.json<ChrListResponse>(await env.get(`/api/chr?cycleId=${env.cycleId}&status=issued`, env.admin.cookie))).items.length, 0);
  assert.equal((await env.get(`/api/chr?cycleId=${env.cycleId}&organizationUnitId=org_90002`, env.reviewer.cookie)).status, 403);
  assert.equal((await env.get(`/api/chr?cycleId=nope`, env.reviewer.cookie)).status, 404);
  assert.equal((await env.get(`/api/chr`, env.reviewer.cookie)).status, 400);
  assert.equal((await env.get(`/api/chr?cycleId=${env.cycleId}`)).status, 401);
  env.close();
});

test("editor draf: catatan manual dan dari item, validasi, ubah, hapus (keputusan ikut dicabut), rekomendasi, audit", async () => {
  const env = await setupChr();
  const first = await env.confirm(env.reviewer.cookie, R01, "900101");
  const chrId = first.chr.id;
  const post = (body: unknown, cookie = env.reviewer.cookie) => env.call("POST", `/api/chr/${chrId}/notes`, cookie, body);
  const [unit] = await env.database.db.select().from(workUnits).where(eq(workUnits.code, "900103"));

  // validasi: ekspektasi, teks, catatan tanpa item butuh judul dan Satker
  assert.equal((await post({ category: "AKUN", text: "Gunakan akun lain.", expectation: { type: "ganti_akun", to: "12" }, title: "Manual", workUnitId: unit.id })).status, 400);
  assert.equal((await post({ category: "AKUN", text: "x", expectation: HAPUS, title: "Manual", workUnitId: unit.id })).status, 400);
  assert.equal((await post({ category: "AKUN", text: "Gunakan akun lain.", expectation: HAPUS })).status, 400);
  assert.equal((await post({ category: "AKUN", text: "Gunakan akun lain.", expectation: { type: "manual", instruction: "" }, title: "Manual", workUnitId: unit.id })).status, 400);

  const manual = await post({ category: "LAINNYA", text: "Periksa kembali dokumen pendukung.", expectation: { type: "manual", instruction: "Minta dokumen pendukung" }, title: "Dokumen pendukung", workUnitId: unit.id });
  assert.equal(manual.status, 201);
  const manualNote = (await env.json<ChrNoteResponse>(manual)).note;
  assert.deepEqual([manualNote.status, manualNote.rkaItemId, manualNote.workUnitCode, manualNote.title, manualNote.category], ["draf", null, "900103", "Dokumen pendukung", "LAINNYA"]);
  assert.equal((await post({ category: "LAINNYA", text: "Satker tidak ada.", expectation: HAPUS, title: "Satker?", workUnitId: "tidak-ada" })).status, 404);

  // item dari eselon I lain / sudah ditinjau: 409
  const itemB = await env.orgBItem();
  assert.equal((await post({ category: "EFISIENSI", text: "Hapus item ini.", expectation: HAPUS, rkaItemId: itemB.id }, env.admin.cookie)).status, 409);
  assert.equal((await post({ category: "EFISIENSI", text: "Hapus item ini.", expectation: HAPUS, rkaItemId: first.row.id })).status, 409);
  assert.equal((await post({ category: "EFISIENSI", text: "Hapus item ini.", expectation: HAPUS, rkaItemId: "tidak-ada" })).status, 404);

  // item baru lewat editor: judul default = uraian, keputusan confirm dibuat
  const honor = await env.findItem(env.admin.cookie, HONOR, "900102");
  const viaEditor = await post({ category: "AKUN", text: "Gunakan akun belanja jasa.", expectation: { type: "ganti_akun", to: "521115" }, rkaItemId: honor.id });
  assert.equal(viaEditor.status, 201);
  const editorNote = (await env.json<ChrNoteResponse>(viaEditor)).note;
  assert.deepEqual([editorNote.title, editorNote.workUnitCode, editorNote.rkaItemId], [HONOR, "900102", honor.id]);
  assert.equal((await env.database.db.select().from(reviewerDecisions).where(eq(reviewerDecisions.rkaItemId, honor.id))).length, 1);
  assert.equal((await env.findItem(env.admin.cookie, HONOR, "900102")).decision, "confirm");

  // ubah
  const patch = (noteId: string, body: unknown) => env.call("PATCH", `/api/chr/${chrId}/notes/${noteId}`, env.reviewer.cookie, body);
  assert.equal((await patch(manualNote.id, {})).status, 400);
  assert.equal((await patch(manualNote.id, { expectation: { type: "ganti_akun", to: "1" } })).status, 400);
  assert.equal((await patch("tidak-ada", { text: "Teks baru yang valid." })).status, 404);
  const patched = await patch(manualNote.id, { text: "Teks catatan yang sudah diperbarui.", category: "SATUAN_BIAYA", expectation: { type: "turunkan_nilai", maxTotal: 1000000 } });
  assert.equal(patched.status, 200);
  const updated = (await env.json<ChrNoteResponse>(patched)).note;
  assert.deepEqual([updated.text, updated.category, updated.expectation, updated.title], ["Teks catatan yang sudah diperbarui.", "SATUAN_BIAYA", { type: "turunkan_nilai", maxTotal: 1000000 }, "Dokumen pendukung"]);

  // hapus catatan dari item: keputusan ikut dihapus
  assert.equal((await env.call("DELETE", `/api/chr/${chrId}/notes/${editorNote.id}`, env.reviewer.cookie)).status, 204);
  assert.equal((await env.call("DELETE", `/api/chr/${chrId}/notes/${editorNote.id}`, env.reviewer.cookie)).status, 404);
  assert.equal((await env.findItem(env.admin.cookie, HONOR, "900102")).decision, "belum_ditinjau");
  assert.equal((await env.database.db.select().from(reviewerDecisions).where(eq(reviewerDecisions.rkaItemId, honor.id))).length, 0);

  // rekomendasi
  const recommendation = (value: unknown) => env.call("PUT", `/api/chr/${chrId}/recommendation`, env.reviewer.cookie, { recommendation: value });
  assert.equal((await recommendation("x".repeat(5001))).status, 400);
  assert.equal((await env.json<ChrDocumentResponse>(await recommendation("  Segera revisi RKA-K/L.  "))).document.recommendation, "Segera revisi RKA-K/L.");
  assert.equal((await env.json<ChrDocumentResponse>(await recommendation(""))).document.recommendation, null);
  await recommendation("Rekomendasi akhir.");

  // urutan kelompok: SATUAN_BIAYA lalu LAINNYA tidak ada; EFISIENSI (R01) dahulu
  const view = await env.detail(chrId, env.reviewer.cookie);
  assert.deepEqual(view.groups.map((group) => [group.letter, group.category]), [["A", "EFISIENSI"], ["B", "SATUAN_BIAYA"]]);

  // audit: tepat satu baris per mutasi
  const actions = (await env.database.db.select().from(auditLogs)).map((log) => log.action).filter((action) => action.startsWith("chr."));
  const count = (action: string) => actions.filter((entry) => entry === action).length;
  assert.deepEqual([count("chr.created"), count("chr.note_created"), count("chr.note_updated"), count("chr.note_deleted"), count("chr.recommendation_updated")], [1, 2, 1, 1, 3]);
  const [deleted] = (await env.database.db.select().from(auditLogs)).filter((log) => log.action === "chr.note_deleted");
  assert.equal(deleted.entityId, editorNote.id);
  assert.equal((deleted.before as { rkaItemId: string }).rkaItemId, honor.id);
  env.close();
});

test("terbit: nomor CHR/<BAES1>/<TA>/<tahap>/<urut> unik, status issued, catatan menunggu_revisi, versi 1 berisi snapshot, audit", async () => {
  const env = await setupChr();
  const a = await env.confirm(env.reviewer.cookie, R01, "900101");
  await env.confirm(env.reviewer.cookie, HONOR, "900102", "Honor tidak boleh dobel.", { type: "ganti_akun", to: "521115" });
  await env.call("PUT", `/api/chr/${a.chr.id}/recommendation`, env.reviewer.cookie, { recommendation: "Revisi sebelum DIPA." });

  // CHR kosong tidak bisa diterbitkan
  const emptyB = (await env.json<ChrDocumentResponse>(await env.call("POST", "/api/chr", env.admin.cookie, { cycleId: env.cycleId, organizationUnitId: "org_90002" }))).document;
  assert.equal((await env.call("POST", `/api/chr/${emptyB.id}/issue`, env.admin.cookie)).status, 409);

  const issued = await env.call("POST", `/api/chr/${a.chr.id}/issue`, env.reviewer.cookie);
  assert.equal(issued.status, 200);
  const body = await env.json<ChrIssueResponse>(issued);
  assert.deepEqual([body.document.status, body.document.documentNumber, body.notesTransitioned, body.document.issuedByName, body.document.currentVersion], ["issued", "CHR/90001/2026/alokasi/001", 2, "Rani Reviewer", 1]);
  assert.ok(body.document.issuedAt);
  assert.deepEqual([body.version.versionNumber, body.version.reason, body.version.notesCount, body.version.addendumReason, body.version.createdByName], [1, "terbit", 2, null, "Rani Reviewer"]);

  // semua catatan draf -> menunggu_revisi
  const notes = await env.database.db.select().from(chrNotes).where(eq(chrNotes.chrDocumentId, a.chr.id));
  assert.deepEqual(notes.map((note) => note.status), ["menunggu_revisi", "menunggu_revisi"]);

  // versi 1: snapshot memuat nomor, rekomendasi, dan catatan pada saat terbit
  const [version] = await env.database.db.select().from(chrVersions).where(eq(chrVersions.chrId, a.chr.id));
  const snapshot = version.snapshot as unknown as ChrVersionDetailResponse["snapshot"];
  assert.equal(version.reason, "terbit");
  assert.deepEqual([snapshot.document.documentNumber, snapshot.document.recommendation, snapshot.document.status, snapshot.addendumReason], ["CHR/90001/2026/alokasi/001", "Revisi sebelum DIPA.", "issued", null]);
  assert.deepEqual(snapshot.notes.map((note) => [note.number, note.status, note.workUnitCode]), [[1, "menunggu_revisi", "900101"], [2, "menunggu_revisi", "900102"]]);
  assert.equal(snapshot.notes[0].text, "Catatan uji untuk item ini.");

  // terbit lagi: 409; hanya satu versi dan satu audit terbit
  assert.equal((await env.call("POST", `/api/chr/${a.chr.id}/issue`, env.reviewer.cookie)).status, 409);
  assert.equal((await env.database.db.select().from(chrVersions)).length, 1);

  // dua penerbitan berurutan pada siklus yang sama: urut 002, nomor unik
  const itemB = await env.orgBItem();
  const noteB = await env.call("POST", `/api/chr/${emptyB.id}/notes`, env.reviewerB.cookie, { category: "EFISIENSI", text: "Catatan untuk eselon I B.", expectation: HAPUS, rkaItemId: itemB.id });
  assert.equal(noteB.status, 201);
  const issuedB = await env.json<ChrIssueResponse>(await env.call("POST", `/api/chr/${emptyB.id}/issue`, env.reviewerB.cookie));
  assert.equal(issuedB.document.documentNumber, "CHR/90002/2026/alokasi/002");
  const numbers = (await env.database.db.select({ number: chrDocuments.documentNumber }).from(chrDocuments)).map((row) => row.number);
  assert.equal(new Set(numbers).size, 2);
  await assert.rejects(() => env.database.db.update(chrDocuments).set({ documentNumber: "CHR/90001/2026/alokasi/001" }).where(eq(chrDocuments.id, emptyB.id)), /UNIQUE/);

  const audits = (await env.database.db.select().from(auditLogs)).filter((log) => log.action === "chr.issued");
  assert.equal(audits.length, 2);
  assert.equal(audits[0].entityId, a.chr.id);
  assert.equal((audits[0].after as { documentNumber: string; notesCount: number }).notesCount, 2);
  env.close();
});

test("terbit bersifat atomik: kegagalan di tengah proses tidak menyisakan nomor, status, atau perubahan catatan", async () => {
  const env = await setupChr();
  const a = await env.confirm(env.reviewer.cookie, R01, "900101");
  // Versi 1 yang sudah ada memaksa insert `chr_versions` gagal setelah nomor dan status ditulis.
  // Trigger uji memaksa insert `chr_versions` gagal setelah nomor, status, dan catatan sudah ditulis di transaksi terbit.
  env.database.sqlite.exec("CREATE TRIGGER fail_version BEFORE INSERT ON chr_versions BEGIN SELECT RAISE(ABORT, 'gagal'); END;");
  const response = await env.call("POST", `/api/chr/${a.chr.id}/issue`, env.reviewer.cookie);
  assert.equal(response.status, 500);
  env.database.sqlite.exec("DROP TRIGGER fail_version");
  const [doc] = await env.database.db.select().from(chrDocuments).where(eq(chrDocuments.id, a.chr.id));
  assert.deepEqual([doc.status, doc.documentNumber, doc.issuedAt], ["draft", null, null]);
  assert.deepEqual((await env.database.db.select().from(chrNotes)).map((note) => note.status), ["draf"]);
  assert.equal((await env.database.db.select().from(auditLogs)).filter((log) => log.action === "chr.issued").length, 0);
  env.close();
});

test("setelah terbit: edit ditolak 409; hanya tanggapan UKI dan adendum; permissions mengikuti", async () => {
  const env = await setupChr();
  const a = await env.confirm(env.reviewer.cookie, R01, "900101");
  const chrId = a.chr.id;
  const [unit] = await env.database.db.select().from(workUnits).where(eq(workUnits.code, "900103"));
  const noteId = a.note.id;
  await env.call("POST", `/api/chr/${chrId}/issue`, env.reviewer.cookie);

  const locked = [
    await env.call("POST", `/api/chr/${chrId}/notes`, env.reviewer.cookie, { category: "LAINNYA", text: "Catatan baru.", expectation: HAPUS, title: "Baru", workUnitId: unit.id }),
    await env.call("PATCH", `/api/chr/${chrId}/notes/${noteId}`, env.reviewer.cookie, { text: "Diubah setelah terbit." }),
    await env.call("DELETE", `/api/chr/${chrId}/notes/${noteId}`, env.reviewer.cookie),
    await env.call("PUT", `/api/chr/${chrId}/recommendation`, env.reviewer.cookie, { recommendation: "Diubah setelah terbit." }),
    await env.call("PUT", `/api/chr/${chrId}/recommendation`, env.admin.cookie, { recommendation: "Admin pun ditolak." })
  ];
  assert.deepEqual(locked.map((response) => response.status), [409, 409, 409, 409, 409]);
  assert.equal(((await locked[0].json()) as { error: string }).error, "CHR sudah terbit dan terkunci. Gunakan adendum.");
  // konfirmasi triage juga ditolak (fase 3)
  const honor = await env.findItem(env.admin.cookie, HONOR, "900102");
  assert.equal((await env.call("POST", `/api/triage/items/${honor.id}/confirm`, env.reviewer.cookie, { category: "EFISIENSI", text: "Setelah terbit.", expectation: HAPUS })).status, 409);
  const [note] = await env.database.db.select().from(chrNotes);
  assert.equal(note.text, "Catatan uji untuk item ini.");

  const reviewerView = await env.detail(chrId, env.reviewer.cookie);
  assert.deepEqual(reviewerView.permissions, { canEditNotes: false, canEditRecommendation: false, canIssue: false, canAddAddendum: true, canRespond: false });
  assert.deepEqual((await env.detail(chrId, env.uki.cookie)).permissions, { canEditNotes: false, canEditRecommendation: false, canIssue: false, canAddAddendum: false, canRespond: true });
  assert.deepEqual((await env.detail(chrId, env.leader.cookie)).permissions, { canEditNotes: false, canEditRecommendation: false, canIssue: false, canAddAddendum: false, canRespond: false });
  assert.equal(reviewerView.document.status, "issued");

  // adendum: catatan baru langsung menunggu_revisi, versi 2, catatan lama tidak berubah
  const addendum = (body: unknown, cookie = env.reviewer.cookie) => env.call("POST", `/api/chr/${chrId}/addendum`, cookie, body);
  assert.equal((await addendum({ reason: "abc" })).status, 400);
  assert.equal((await addendum({ reason: "Menambah temuan baru" })).status, 400, "harus mengubah rekomendasi atau menambah catatan");
  assert.equal((await addendum({ reason: "Menambah temuan baru", notes: [{ category: "LAINNYA", text: "x", expectation: HAPUS, title: "Baru", workUnitId: unit.id }] })).status, 400);
  const made = await addendum({
    reason: "Temuan baru dari verifikasi lapangan", recommendation: "Rekomendasi diperbarui lewat adendum.",
    notes: [
      { category: "AKUN", text: "Pindahkan ke akun belanja barang.", expectation: { type: "ganti_akun", to: "521111" }, rkaItemId: honor.id },
      { category: "LAINNYA", text: "Lengkapi dokumen pendukung.", expectation: { type: "manual", instruction: "Minta dokumen" }, title: "Dokumen", workUnitId: unit.id }
    ]
  });
  assert.equal(made.status, 201);
  const result = await env.json<ChrAddendumResponse>(made);
  assert.deepEqual([result.notesAdded, result.version.versionNumber, result.version.reason, result.version.addendumReason, result.version.notesCount], [2, 2, "adendum", "Temuan baru dari verifikasi lapangan", 3]);
  assert.equal(result.document.recommendation, "Rekomendasi diperbarui lewat adendum.");
  assert.equal(result.document.documentNumber, "CHR/90001/2026/alokasi/001", "nomor tidak berubah");
  const notes = await env.database.db.select().from(chrNotes);
  assert.deepEqual(notes.map((entry) => entry.status), ["menunggu_revisi", "menunggu_revisi", "menunggu_revisi"]);
  assert.equal(notes.find((entry) => entry.id === noteId)!.text, "Catatan uji untuk item ini.");
  assert.equal((await env.findItem(env.admin.cookie, HONOR, "900102")).decision, "confirm");
  // item yang sama tidak boleh dua kali
  assert.equal((await addendum({ reason: "Tambah lagi item yang sama", notes: [{ category: "AKUN", text: "Duplikat item.", expectation: HAPUS, rkaItemId: honor.id }] })).status, 409);
  assert.equal((await env.database.db.select().from(chrVersions)).length, 2, "adendum yang gagal tidak membuat versi");

  const versions = await env.json<{ versions: { versionNumber: number; reason: string }[] }>(await env.get(`/api/chr/${chrId}/versions`, env.uki.cookie));
  assert.deepEqual(versions.versions.map((version) => [version.versionNumber, version.reason]), [[1, "terbit"], [2, "adendum"]]);
  const v1 = await env.json<ChrVersionDetailResponse>(await env.get(`/api/chr/${chrId}/versions/1`, env.leader.cookie));
  assert.equal(v1.snapshot.notes.length, 1);
  const v2 = await env.json<ChrVersionDetailResponse>(await env.get(`/api/chr/${chrId}/versions/2`, env.leader.cookie));
  assert.deepEqual([v2.snapshot.notes.length, v2.snapshot.addendumReason, v2.snapshot.document.recommendation], [3, "Temuan baru dari verifikasi lapangan", "Rekomendasi diperbarui lewat adendum."]);
  assert.equal((await env.get(`/api/chr/${chrId}/versions/3`, env.leader.cookie)).status, 404);
  assert.equal((await env.get(`/api/chr/${chrId}/versions/abc`, env.leader.cookie)).status, 404);
  assert.equal((await env.detail(chrId, env.reviewer.cookie)).versions.length, 2);
  assert.equal((await env.database.db.select().from(auditLogs)).filter((log) => log.action === "chr.addendum_added").length, 1);

  // adendum pada CHR draf: 409
  const draftB = (await env.json<ChrDocumentResponse>(await env.call("POST", "/api/chr", env.admin.cookie, { cycleId: env.cycleId, organizationUnitId: "org_90002" }))).document;
  assert.equal((await env.call("POST", `/api/chr/${draftB.id}/addendum`, env.admin.cookie, { reason: "Tidak boleh pada draf", recommendation: "x" })).status, 409);
  env.close();
});

test("tanggapan eselon I: hanya PIC UKI eselon I itu (atau admin), hanya setelah terbit, dengan by/at, audit before/after", async () => {
  const env = await setupChr();
  const a = await env.confirm(env.reviewer.cookie, R01, "900101");
  const respond = (cookie: string, value: unknown = "Kami akan merevisi RKA-K/L.") => env.call("PUT", `/api/chr/${a.chr.id}/unit-response`, cookie, { unitResponse: value });
  assert.equal((await respond(env.uki.cookie)).status, 409, "sebelum terbit");
  assert.equal((await respond(env.admin.cookie)).status, 409);
  await env.call("POST", `/api/chr/${a.chr.id}/issue`, env.reviewer.cookie);

  assert.equal((await respond(env.uki.cookie, "")).status, 400);
  assert.equal((await respond(env.uki.cookie, "x".repeat(5001))).status, 400);
  assert.equal((await respond(env.ukiB.cookie)).status, 403, "UKI eselon I lain");
  assert.equal((await respond(env.reviewer.cookie)).status, 403);
  assert.equal((await respond(env.leader.cookie)).status, 403);
  assert.equal((await env.call("PUT", `/api/chr/${a.chr.id}/unit-response`, undefined, { unitResponse: "x" })).status, 401);

  const before = Date.now();
  const ok = await respond(env.uki.cookie);
  assert.equal(ok.status, 200);
  const document = (await env.json<ChrDocumentResponse>(ok)).document;
  assert.deepEqual([document.unitResponse, document.unitResponseByName, document.status], ["Kami akan merevisi RKA-K/L.", "Umar UKI", "issued"]);
  assert.ok(document.unitResponseAt! >= before);
  assert.equal(document.currentVersion, 1, "tanggapan tidak membuat versi baru");
  assert.equal((await respond(env.admin.cookie, "Tanggapan terbaru dari admin.")).status, 200, "boleh ditimpa");
  const logs = (await env.database.db.select().from(auditLogs)).filter((log) => log.action === "chr.unit_response_updated");
  assert.equal(logs.length, 2);
  assert.deepEqual(logs[1].before, { unitResponse: "Kami akan merevisi RKA-K/L." });
  assert.deepEqual(logs[1].after, { unitResponse: "Tanggapan terbaru dari admin." });
  env.close();
});

test("peran dan scope: reviewer A tidak bisa membaca/menulis CHR B; 401 dan 403 per endpoint", async () => {
  const env = await setupChr();
  const a = await env.confirm(env.reviewer.cookie, R01, "900101");
  const itemB = await env.orgBItem();
  const b = (await env.json<ChrDocumentResponse>(await env.call("POST", "/api/chr", env.admin.cookie, { cycleId: env.cycleId, organizationUnitId: "org_90002" }))).document;
  const [noteB] = await (async () => {
    const response = await env.call("POST", `/api/chr/${b.id}/notes`, env.admin.cookie, { category: "EFISIENSI", text: "Catatan untuk B.", expectation: HAPUS, rkaItemId: itemB.id });
    return [(await env.json<ChrNoteResponse>(response)).note];
  })();

  // reviewer A terhadap CHR B
  const attempts: [string, string, unknown?][] = [
    ["GET", `/api/chr/${b.id}`], ["GET", `/api/chr/${b.id}/versions`], ["GET", `/api/chr/${b.id}/versions/1`], ["GET", `/api/chr/${b.id}/print`],
    ["POST", `/api/chr/${b.id}/notes`, { category: "EFISIENSI", text: "Lintas eselon I.", expectation: HAPUS, title: "Lintas", workUnitId: "x" }],
    ["PATCH", `/api/chr/${b.id}/notes/${noteB.id}`, { text: "Diubah lintas eselon I." }], ["DELETE", `/api/chr/${b.id}/notes/${noteB.id}`],
    ["PUT", `/api/chr/${b.id}/recommendation`, { recommendation: "Lintas." }], ["POST", `/api/chr/${b.id}/issue`],
    ["POST", `/api/chr/${b.id}/addendum`, { reason: "Lintas eselon I", recommendation: "x" }], ["PUT", `/api/chr/${b.id}/unit-response`, { unitResponse: "x" }]
  ];
  for (const [method, path, body] of attempts) {
    const cookie = path.endsWith("unit-response") ? env.uki.cookie : env.reviewer.cookie;
    assert.equal((await env.call(method, path, cookie, body)).status, 403, `${method} ${path}`);
  }
  assert.equal((await env.call("POST", "/api/chr", env.reviewer.cookie, { cycleId: env.cycleId, organizationUnitId: "org_90002" })).status, 403);
  assert.equal((await env.get(`/api/chr/${b.id}`, env.uki.cookie)).status, 403);
  assert.equal((await env.get(`/api/chr/${a.chr.id}`, env.reviewerB.cookie)).status, 403);
  assert.equal((await env.get(`/api/chr/${a.chr.id}`, env.ukiB.cookie)).status, 403);
  assert.equal((await env.get(`/api/chr/${b.id}`, env.reviewerB.cookie)).status, 200);
  assert.equal((await env.get("/api/chr/tidak-ada", env.admin.cookie)).status, 404);
  assert.equal((await env.call("POST", "/api/chr", env.admin.cookie, { cycleId: "nope", organizationUnitId: "org_90001" })).status, 404);
  assert.equal((await env.call("POST", "/api/chr", env.admin.cookie, { cycleId: env.cycleId, organizationUnitId: "nope" })).status, 404);
  assert.equal((await env.call("POST", "/api/chr", env.admin.cookie, { cycleId: env.cycleId })).status, 400);
  // CHR B tidak berubah oleh percobaan di atas
  assert.equal((await env.detail(b.id, env.admin.cookie)).notesTotal, 1);
  assert.equal((await env.detail(b.id, env.admin.cookie)).document.status, "draft");

  // pimpinan baca saja; UKI tidak menulis catatan/rekomendasi/terbit/adendum; semua 401 tanpa sesi
  const writes: [string, string, unknown?][] = [
    ["POST", `/api/chr`, { cycleId: env.cycleId, organizationUnitId: "org_90001" }],
    ["POST", `/api/chr/${a.chr.id}/notes`, { category: "EFISIENSI", text: "Tidak boleh.", expectation: HAPUS, title: "Tidak", workUnitId: "x" }],
    ["PATCH", `/api/chr/${a.chr.id}/notes/${a.note.id}`, { text: "Tidak boleh ubah." }], ["DELETE", `/api/chr/${a.chr.id}/notes/${a.note.id}`],
    ["PUT", `/api/chr/${a.chr.id}/recommendation`, { recommendation: "x" }], ["POST", `/api/chr/${a.chr.id}/issue`],
    ["POST", `/api/chr/${a.chr.id}/addendum`, { reason: "Tidak boleh", recommendation: "x" }], ["PUT", `/api/chr/${a.chr.id}/unit-response`, { unitResponse: "x" }]
  ];
  for (const [method, path, body] of writes) {
    assert.equal((await env.call(method, path, env.leader.cookie, body)).status, 403, `leader ${method} ${path}`);
    assert.equal((await env.call(method, path, undefined, body)).status, 401, `anonim ${method} ${path}`);
    if (!path.endsWith("unit-response")) assert.equal((await env.call(method, path, env.uki.cookie, body)).status, 403, `uki ${method} ${path}`);
  }
  for (const path of [`/api/chr/${a.chr.id}`, `/api/chr/${a.chr.id}/versions`, `/api/chr/${a.chr.id}/print`, `/api/chr?cycleId=${env.cycleId}`]) assert.equal((await env.get(path)).status, 401);
  for (const path of [`/api/chr/${a.chr.id}`, `/api/chr/${a.chr.id}/print`, `/api/chr?cycleId=${env.cycleId}`]) assert.equal((await env.get(path, env.leader.cookie)).status, 200);
  assert.equal((await env.detail(a.chr.id, env.admin.cookie)).notesByStatus.draf, 1, "A tidak berubah");
  env.close();
});

test("cetak: memuat semua catatan per kelompok (draf dan terbit), kop/penandatangan dari konfigurasi, versi", async () => {
  const env = await setupChr();
  const a = await env.confirm(env.reviewer.cookie, R01, "900101", "Hapus pakaian hari besar.");
  await env.confirm(env.reviewer.cookie, HONOR, "900102", "Gunakan akun jasa.", { type: "ganti_akun", to: "521115" });
  const [unit] = await env.database.db.select().from(workUnits).where(eq(workUnits.code, "900103"));
  await env.call("POST", `/api/chr/${a.chr.id}/notes`, env.reviewer.cookie, { category: "LAINNYA", text: "Lengkapi dokumen pendukung.", expectation: { type: "manual", instruction: "Minta dokumen" }, title: "Dokumen pendukung", workUnitId: unit.id });
  await env.call("PUT", `/api/chr/${a.chr.id}/recommendation`, env.reviewer.cookie, { recommendation: "Revisi sebelum DIPA." });

  const draft = await env.json<ChrPrintResponse>(await env.get(`/api/chr/${a.chr.id}/print`, env.leader.cookie));
  assert.deepEqual([draft.status, draft.documentNumber, draft.versionNumber, draft.issuedAt, draft.organizationUnitName, draft.fiscalYear, draft.stage], ["draft", null, 0, null, "DJCA", 2026, "alokasi"]);
  assert.equal(draft.groups.flatMap((group) => group.rows).length, 3);
  assert.equal((await env.get(`/api/chr/${a.chr.id}/print?version=1`, env.leader.cookie)).status, 404);
  assert.equal((await env.get(`/api/chr/${a.chr.id}/print?version=0`, env.leader.cookie)).status, 400);

  await env.call("POST", `/api/chr/${a.chr.id}/issue`, env.reviewer.cookie);
  await env.call("PUT", `/api/chr/${a.chr.id}/unit-response`, env.uki.cookie, { unitResponse: "Siap menindaklanjuti." });
  const printed = await env.json<ChrPrintResponse>(await env.get(`/api/chr/${a.chr.id}/print`, env.reviewer.cookie));
  assert.deepEqual([printed.status, printed.documentNumber, printed.versionNumber, printed.recommendation, printed.unitResponse], ["issued", "CHR/90001/2026/alokasi/001", 1, "Revisi sebelum DIPA.", "Siap menindaklanjuti."]);
  assert.deepEqual(printed.groups.map((group) => [group.letter, group.category, group.rows.length]), [["A", "EFISIENSI", 2], ["B", "LAINNYA", 1]]);
  const rows = printed.groups.flatMap((group) => group.rows);
  assert.equal(rows.length, 3, "semua catatan ada di cetak");
  assert.deepEqual(rows.map((row) => row.number).sort(), [1, 2, 3]);
  const first = printed.groups[0].rows[0];
  assert.deepEqual([first.number, first.workUnitName === null, first.itemDescription, first.text, first.expectation], [1, false, R01, "Hapus pakaian hari besar.", HAPUS]);
  assert.deepEqual(printed.letterhead, { organizationName: "Kementerian Pekerjaan Umum", unitName: "Inspektorat Jenderal", address: null });
  assert.deepEqual(printed.signatory, { city: "Jakarta", title: "Inspektur Jenderal", name: null, nip: null });
  assert.ok(printed.issuedAt && printed.generatedAt);

  // adendum -> versi 2; cetak default = terbaru, ?version=1 = isi saat terbit
  await env.call("POST", `/api/chr/${a.chr.id}/addendum`, env.reviewer.cookie, { reason: "Tambah rekomendasi", recommendation: "Rekomendasi baru." });
  const latest = await env.json<ChrPrintResponse>(await env.get(`/api/chr/${a.chr.id}/print`, env.reviewer.cookie));
  const v1 = await env.json<ChrPrintResponse>(await env.get(`/api/chr/${a.chr.id}/print?version=1`, env.reviewer.cookie));
  assert.deepEqual([latest.versionNumber, latest.recommendation, v1.versionNumber, v1.recommendation, v1.groups.flatMap((group) => group.rows).length], [2, "Rekomendasi baru.", 1, "Revisi sebelum DIPA.", 3]);
  assert.equal((await env.get(`/api/chr/${a.chr.id}/print?version=3`, env.reviewer.cookie)).status, 404);
  env.close();
});

test("antrean CHR: needs-action dan nav-counts konsisten dengan CHR draf, terbit, dan tanggapan (§2.9)", async () => {
  const env = await setupChr();
  const needs = async (cookie: string) => env.json<NeedsActionResponse>(await env.get(`/api/needs-action?cycleId=${env.cycleId}`, cookie));
  const labelled = (response: NeedsActionResponse, href: string) => response.items.find((item) => item.href === href)?.count ?? 0;

  assert.equal(labelled(await needs(env.reviewer.cookie), "/chr"), 0);
  const a = await env.confirm(env.reviewer.cookie, R01, "900101");
  const draft = await needs(env.reviewer.cookie);
  assert.equal(labelled(draft, `/chr/${a.chr.id}`), 1, "CHR draf dengan catatan -> tautan langsung ke dokumen");
  assert.equal((await needs(env.admin.cookie)).items.find((item) => item.href.startsWith("/chr"))?.count, 1);
  assert.equal((await needs(env.leader.cookie)).count, 0);
  assert.equal((await needs(env.uki.cookie)).items.length, 0, "UKI belum punya antrean sebelum terbit");

  // CHR draf tanpa catatan tidak dihitung
  await env.call("POST", "/api/chr", env.admin.cookie, { cycleId: env.cycleId, organizationUnitId: "org_90002" });
  assert.equal(labelled(await needs(env.admin.cookie), "/chr"), 0);
  assert.equal(labelled(await needs(env.admin.cookie), `/chr/${a.chr.id}`), 1);

  await env.call("POST", `/api/chr/${a.chr.id}/issue`, env.reviewer.cookie);
  const afterIssue = await needs(env.reviewer.cookie);
  assert.equal(afterIssue.items.some((item) => item.href.startsWith("/chr")), false, "CHR sudah terbit tidak lagi draf");
  const ukiNeeds = await needs(env.uki.cookie);
  assert.equal(labelled(ukiNeeds, "/tracker?status=menunggu_revisi"), 1);
  assert.equal(labelled(ukiNeeds, `/chr/${a.chr.id}`), 1, "CHR terbit tanpa tanggapan");
  assert.equal(ukiNeeds.count, 2);
  assert.equal((await needs(env.ukiB.cookie)).count, 0, "eselon I lain tidak terhitung");

  await env.call("PUT", `/api/chr/${a.chr.id}/unit-response`, env.uki.cookie, { unitResponse: "Siap menindaklanjuti." });
  const answered = await needs(env.uki.cookie);
  assert.equal(labelled(answered, `/chr/${a.chr.id}`), 0);
  assert.equal(answered.count, 1);
  const nav = await env.json<NavCountsResponse>(await env.get(`/api/nav-counts?cycleId=${env.cycleId}`, env.reviewer.cookie));
  assert.deepEqual(nav, { triageUnreviewed: (await env.list(env.reviewer.cookie)).summary.unreviewedFlaggedItems, trackerPending: 0 });
  env.close();
});

test("syncChrCompletion: completed hanya bila semua catatan closed (dalam transaksi); adendum mengembalikan ke issued; draf tidak berubah", async () => {
  const env = await setupChr();
  const a = await env.confirm(env.reviewer.cookie, R01, "900101");
  const b = await env.confirm(env.reviewer.cookie, HONOR, "900102");
  const db = env.database.db;
  const sync = () => env.database.transaction(() => syncChrCompletion(db, a.chr.id, "usr_reviewer"));

  assert.deepEqual(await sync(), { status: "draft", justCompleted: false }, "draf tidak pernah selesai");
  await env.call("POST", `/api/chr/${a.chr.id}/issue`, env.reviewer.cookie);
  assert.deepEqual(await sync(), { status: "issued", justCompleted: false });
  // sistem tidak pernah menutup: tanpa aksi pengguna tidak ada catatan closed
  assert.equal((await db.select().from(chrNotes)).filter((note) => note.status === "closed").length, 0);

  await db.update(chrNotes).set({ status: "closed", closedBy: "usr_reviewer", closedAt: Date.now() }).where(eq(chrNotes.id, a.note.id));
  assert.deepEqual(await sync(), { status: "issued", justCompleted: false }, "satu catatan masih terbuka");
  await db.update(chrNotes).set({ status: "closed", closedBy: "usr_reviewer", closedAt: Date.now() }).where(eq(chrNotes.id, b.note.id));
  assert.deepEqual(await sync(), { status: "completed", justCompleted: true });
  const [completed] = await db.select().from(chrDocuments).where(eq(chrDocuments.id, a.chr.id));
  assert.ok(completed.completedAt);
  assert.deepEqual(await sync(), { status: "completed", justCompleted: false }, "idempoten");
  assert.equal((await db.select().from(auditLogs)).filter((log) => log.action === "chr.completed").length, 1);
  const detail = await env.detail(a.chr.id, env.reviewer.cookie);
  assert.deepEqual([detail.document.status, detail.permissions.canAddAddendum, (await env.detail(a.chr.id, env.uki.cookie)).permissions.canRespond], ["completed", true, true]);
  assert.equal((await env.call("PUT", `/api/chr/${a.chr.id}/unit-response`, env.uki.cookie, { unitResponse: "Tanggapan setelah selesai." })).status, 200);

  // adendum dengan catatan baru: completed -> issued, completedAt kosong
  const [unit] = await db.select().from(workUnits).where(eq(workUnits.code, "900103"));
  const addendum = await env.call("POST", `/api/chr/${a.chr.id}/addendum`, env.reviewer.cookie, {
    reason: "Temuan tambahan", notes: [{ category: "LAINNYA", text: "Lengkapi dokumen.", expectation: { type: "manual", instruction: "Minta dokumen" }, title: "Dokumen", workUnitId: unit.id }]
  });
  assert.equal(addendum.status, 201);
  const after = (await env.json<ChrAddendumResponse>(addendum)).document;
  assert.deepEqual([after.status, after.completedAt], ["issued", null]);
  // adendum hanya rekomendasi pada CHR completed: tetap completed
  await db.update(chrNotes).set({ status: "closed", closedBy: "usr_reviewer", closedAt: Date.now() }).where(eq(chrNotes.status, "menunggu_revisi"));
  assert.equal((await sync()).status, "completed");
  const recommendationOnly = await env.call("POST", `/api/chr/${a.chr.id}/addendum`, env.reviewer.cookie, { reason: "Perbarui rekomendasi", recommendation: "Rekomendasi akhir." });
  assert.equal((await env.json<ChrAddendumResponse>(recommendationOnly)).document.status, "completed");
  env.close();
});
