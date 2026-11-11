import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import type { ConfirmItemResponse, TriageItemDetailResponse } from "@nirmala/shared";
import { auditLogs, chrDocuments, chrNotes, reviewerDecisions, riskAssessments, workUnits } from "../src/db/schema.ts";
import { setupSeeded } from "./helpers.ts";

const R01 = "Pengadaan kaos seragam peringatan HUT Kemerdekaan 17 Agustus";

test("seed: daftar triage terisi, kasus R01-R07 teratas, rule dahulu lalu skor menurun", async () => {
  const env = await setupSeeded();
  const body = await env.list(env.sessions.admin.cookie, "&pageSize=100");
  assert.equal(body.snapshots.length, 2);
  assert.equal(body.summary.flaggedItems, 13);
  assert.equal(body.summary.unreviewedFlaggedItems, 13);
  assert.equal(body.summary.analyzedItems, body.pagination.total);
  const flagged = body.items.filter((item) => item.ruleCodes.length);
  assert.equal(flagged.length, 13);
  assert.deepEqual(body.items.slice(0, 13).map((item) => item.ruleCodes.length > 0), Array(13).fill(true), "item kena aturan di atas");
  const scores = body.items.slice(0, 13).map((item) => item.score!);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  const only = await env.list(env.sessions.admin.cookie, "&onlyFlagged=true&ruleCode=R02");
  assert.equal(only.pagination.total, 3);
  assert.equal((await env.list(env.sessions.admin.cookie, "&ruleCategory=AKUN&onlyFlagged=true")).pagination.total, 9);
  assert.equal((await env.list(env.sessions.admin.cookie, "&pageSize=5&page=2")).items.length, 5);
  env.close();
});

test("akses: reviewer eselon I A hanya melihat A; B ditolak (403); pimpinan dan admin melihat semua; 401 tanpa sesi", async () => {
  const env = await setupSeeded();
  const reviewer = env.sessions.reviewer.cookie;
  const own = await env.list(reviewer);
  assert.deepEqual(own.snapshots.map((snapshot) => snapshot.organizationUnitId), ["org_90001"]);
  assert.ok(own.items.every((item) => item.organizationUnitId === "org_90001"));
  assert.equal((await env.get(`/api/triage/items?cycleId=${env.cycleId}&organizationUnitId=org_90002`, reviewer)).status, 403);
  const adminList = await env.list(env.sessions.admin.cookie, "&pageSize=100");
  const itemB = adminList.items.find((item) => item.organizationUnitId === "org_90002")!;
  assert.equal((await env.get(`/api/triage/items/${itemB.id}`, reviewer)).status, 403);
  assert.equal((await env.call("POST", `/api/triage/items/${itemB.id}/dismiss`, reviewer, { reasonCategory: "lainnya" })).status, 403);
  assert.equal((await env.get(`/api/triage/items/${itemB.id}`, env.sessions.leader.cookie)).status, 200);
  assert.equal((await env.list(env.sessions.leader.cookie)).snapshots.length, 2);
  assert.equal((await env.get(`/api/triage/items?cycleId=${env.cycleId}`)).status, 401);
  assert.equal((await env.get("/api/triage/items/x", env.sessions.admin.cookie)).status, 404);
  // leader/uki baca saja
  const item = await env.findItem(env.sessions.admin.cookie, R01);
  for (const cookie of [env.sessions.leader.cookie, env.sessions.uki.cookie]) {
    assert.equal((await env.call("POST", `/api/triage/items/${item.id}/dismiss`, cookie, { reasonCategory: "lainnya" })).status, 403);
    assert.equal((await env.call("DELETE", `/api/triage/items/${item.id}/decision`, cookie)).status, 403);
  }
  env.close();
});

test("detail: faktor yang tampil sama dengan yang tersimpan; kartu aturan, peer, riwayat Satker, default konfirmasi, navigasi", async () => {
  const env = await setupSeeded();
  const cookie = env.sessions.reviewer.cookie;
  const row = await env.findItem(cookie, R01, "900101");
  const detail = (await (await env.get(`/api/triage/items/${row.id}?cycleId=${env.cycleId}&onlyFlagged=true`, cookie)).json()) as TriageItemDetailResponse;
  const [stored] = await env.database.db.select().from(riskAssessments).where(eq(riskAssessments.rkaItemId, row.id));
  assert.equal(detail.score!.value, stored.score);
  assert.deepEqual(detail.score!.factors.map(({ key, ...factor }) => factor), stored.factors);
  assert.deepEqual(detail.score!.factors.map((factor) => factor.key), ["F1", "F2", "F3", "F4", "F5"]);
  assert.equal(detail.score!.configVersion, "1");
  assert.equal(detail.score!.factors[2].dataAvailable, false, "900101 tidak punya profil BPK");
  assert.equal(detail.satkerHistory.hasProfile, false);
  assert.deepEqual(detail.ruleHits.map((hit) => [hit.code, hit.matchedTerms]), [["R01", ["kaos", "hut"]]]);
  assert.deepEqual(detail.confirmDefaults, { category: "EFISIENSI", text: detail.ruleHits[0].reason, expectation: { type: "hapus_item" }, ruleCode: "R01" });
  assert.equal(detail.item.hierarchy.length, 6);
  assert.equal(detail.item.hierarchy[5].name, "Layanan perkantoran");
  assert.equal(detail.item.accountName, "Belanja Bahan");
  assert.equal(detail.item.volumeDetail[0].volume, 120);
  assert.equal(detail.previousVersion, null);
  assert.equal(detail.canDecide, true);
  assert.equal(detail.decision, null);
  assert.equal(detail.chr, null);
  assert.equal(detail.navigation!.total, 8);
  assert.equal(detail.navigation!.previousItemId === null, detail.navigation!.position === 1);
  const noFilter = (await (await env.get(`/api/triage/items/${row.id}`, cookie)).json()) as TriageItemDetailResponse;
  assert.equal(noFilter.navigation, null);
  // Detail item dengan pembanding harga (>= 5 Satker, eselon I A saja = 5 Satker).
  const honor = (await env.list(env.sessions.admin.cookie, `&q=${encodeURIComponent("Honorarium narasumber")}&workUnitId=${(await env.database.db.select().from(workUnits).where(eq(workUnits.code, "900105")))[0].id}`)).items[0];
  const honorDetail = (await (await env.get(`/api/triage/items/${honor.id}`, env.sessions.admin.cookie)).json()) as TriageItemDetailResponse;
  assert.ok(honorDetail.peer && honorDetail.peer.satkerCount >= 5 && honorDetail.peer.ratio > 2 && honorDetail.peer.minSatker === 5);
  assert.equal(honorDetail.satkerHistory.hasProfile, true);
  assert.equal(honorDetail.satkerHistory.themes.find((theme) => theme.theme === "penganggaran")!.countOpen, 8);
  env.close();
});

test("dismiss tanpa kategori alasan ditolak (400); kategori tak dikenal 400; dismiss sah tersimpan dan tidak bisa dobel (409)", async () => {
  const env = await setupSeeded();
  const cookie = env.sessions.reviewer.cookie;
  const item = await env.findItem(cookie, R01, "900101");
  const dismiss = (body: unknown) => env.call("POST", `/api/triage/items/${item.id}/dismiss`, cookie, body);
  for (const body of [{}, { reasonCategory: "" }, { reasonCategory: "   " }, { note: "tanpa kategori" }]) {
    const response = await dismiss(body);
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as { error: string }).error, "Pilih kategori alasan dismiss.");
  }
  assert.equal((await dismiss({ reasonCategory: "tidak_ada" })).status, 400);
  assert.equal((await env.get("/api/triage/items/" + item.id, cookie).then((r) => r.json()) as TriageItemDetailResponse).decision, null);
  const ok = await dismiss({ reasonCategory: "ada_dasar_hukum", note: "Sesuai Perdirjen" });
  assert.equal(ok.status, 201);
  const decision = ((await ok.json()) as { decision: { decision: string; reasonLabel: string; note: string; reviewerName: string } }).decision;
  assert.deepEqual([decision.decision, decision.reasonLabel, decision.note, decision.reviewerName], ["dismiss", "Sudah ada dasar hukum", "Sesuai Perdirjen", "Rani Reviewer"]);
  assert.equal((await dismiss({ reasonCategory: "lainnya" })).status, 409);
  assert.equal((await env.call("POST", `/api/triage/items/${item.id}/confirm`, cookie, { category: "EFISIENSI", text: "Hapus item ini.", expectation: { type: "hapus_item" } })).status, 409);
  assert.equal((await env.database.db.select().from(reviewerDecisions)).length, 1);
  const filtered = await env.list(cookie, "&decision=dismiss");
  assert.deepEqual(filtered.items.map((entry) => entry.id), [item.id]);
  assert.equal((await env.list(cookie)).summary.unreviewedFlaggedItems, 7);
  // Item di-dismiss tidak masuk CHR
  assert.equal((await env.database.db.select().from(chrNotes)).length, 0);
  // Pencabutan dismiss selalu bisa; setelahnya bisa diputuskan lagi.
  assert.equal((await env.call("DELETE", `/api/triage/items/${item.id}/decision`, cookie)).status, 204);
  assert.equal((await env.call("DELETE", `/api/triage/items/${item.id}/decision`, cookie)).status, 404);
  assert.equal((await dismiss({ reasonCategory: "lainnya" })).status, 201);
  const reasons = (await (await env.get("/api/references/dismiss-reasons", cookie)).json()) as { reasons: { code: string }[] };
  assert.equal(reasons.reasons[0].code, "harga_wajar_lokasi");
  env.close();
});

test("konfirmasi: membuat CHR draf dan tepat satu catatan draf per item; tidak ada keputusan ganda; revert hanya selama draf", async () => {
  const env = await setupSeeded();
  const cookie = env.sessions.reviewer.cookie;
  const a = await env.findItem(cookie, R01, "900101");
  const b = await env.findItem(cookie, "Honor satpam dan pengemudi kantor", "900102");
  const body = { category: "EFISIENSI", text: "Alokasi pakaian hari besar tidak esensial.", expectation: { type: "hapus_item" } };
  assert.equal((await env.call("POST", `/api/triage/items/${a.id}/confirm`, cookie, { ...body, text: "x" })).status, 400);
  assert.equal((await env.call("POST", `/api/triage/items/${a.id}/confirm`, cookie, { ...body, expectation: { type: "ganti_akun", to: "12" } })).status, 400);
  const first = await env.call("POST", `/api/triage/items/${a.id}/confirm`, cookie, body);
  assert.equal(first.status, 201);
  const created = (await first.json()) as ConfirmItemResponse;
  assert.equal(created.note.status, "draf");
  assert.equal(created.note.title, R01);
  assert.equal(created.note.workUnitCode, "900101");
  assert.equal(created.note.ruleCode, "R01");
  assert.equal(created.note.number, 1);
  assert.deepEqual([created.chr.status, created.chr.documentNumber, created.chr.organizationUnitName], ["draft", null, "DJCA"]);
  assert.equal(created.decision.chrNote!.id, created.note.id);

  assert.equal((await env.call("POST", `/api/triage/items/${a.id}/confirm`, cookie, body)).status, 409, "tidak ada keputusan ganda");
  const second = (await (await env.call("POST", `/api/triage/items/${b.id}/confirm`, cookie, { category: "AKUN", text: "Gunakan akun 521111.", expectation: { type: "ganti_akun", to: "521111" } })).json()) as ConfirmItemResponse;
  assert.equal(second.chr.id, created.chr.id, "satu CHR per (siklus, eselon I) untuk dua Satker");
  assert.equal(second.note.number, 2);
  assert.equal((await env.database.db.select().from(chrDocuments)).length, 1);
  assert.equal((await env.database.db.select().from(chrNotes)).length, 2);

  // Batas unik: catatan kedua untuk item yang sama ditolak oleh database.
  await assert.rejects(() => env.database.db.insert(chrNotes).values({ ...(async () => undefined)(), id: "dup", chrDocumentId: created.chr.id, rkaItemId: a.id, category: "LAINNYA", text: "x", expectation: { type: "rinci_item" }, createdBy: "usr_admin", createdAt: 1, updatedAt: 1 } as never), /UNIQUE/);

  const list = await env.list(cookie, "&decision=confirm");
  assert.equal(list.pagination.total, 2);
  assert.ok(list.items.every((item) => item.noteStatus === "draf" && item.noteId));
  const detail = (await (await env.get(`/api/triage/items/${a.id}`, cookie)).json()) as TriageItemDetailResponse;
  assert.equal(detail.decision!.chrNote!.id, created.note.id);
  assert.equal(detail.chr!.id, created.chr.id);
  assert.equal(detail.canDecide, true, "keputusan confirm dengan catatan draf masih bisa dicabut");

  // Revert: catatan draf ikut terhapus, item kembali belum ditinjau; CHR tetap.
  assert.equal((await env.call("DELETE", `/api/triage/items/${a.id}/decision`, cookie)).status, 204);
  assert.equal((await env.database.db.select().from(chrNotes)).length, 1);
  assert.equal((await env.list(cookie, "&decision=belum_ditinjau&onlyFlagged=true")).items.some((item) => item.id === a.id), true);
  // Catatan sudah terbit -> tidak bisa dicabut, dan CHR terbit mengunci konfirmasi baru.
  await env.database.db.update(chrNotes).set({ status: "menunggu_revisi" }).where(eq(chrNotes.id, second.note.id));
  const locked = await env.call("DELETE", `/api/triage/items/${b.id}/decision`, cookie);
  assert.equal(locked.status, 409);
  assert.match(((await locked.json()) as { error: string }).error, /sudah terbit/);
  await env.database.db.update(chrDocuments).set({ status: "issued" }).where(eq(chrDocuments.id, created.chr.id));
  const refused = await env.call("POST", `/api/triage/items/${a.id}/confirm`, cookie, body);
  assert.equal(refused.status, 409);
  assert.match(((await refused.json()) as { error: string }).error, /CHR sudah terbit/);

  const actions = (await env.database.db.select({ action: auditLogs.action }).from(auditLogs)).map((row) => row.action);
  for (const action of ["chr.created", "item.confirmed", "item.decision_reverted"]) assert.ok(actions.includes(action), action);
  assert.equal(actions.filter((action) => action === "chr.created").length, 1);
  env.close();
});

test("needs-action, nav-counts, work-units, referensi akun", async () => {
  const env = await setupSeeded();
  const json = async (path: string, cookie: string) => (await (await env.get(path, cookie)).json()) as any;
  const needs = await json("/api/needs-action", env.sessions.reviewer.cookie);
  assert.deepEqual(needs, { count: 8, items: [{ label: "Item kena aturan belum ditinjau", href: "/triage?onlyFlagged=true&decision=belum_ditinjau", count: 8 }] });
  assert.deepEqual(await json("/api/nav-counts", env.sessions.reviewer.cookie), { triageUnreviewed: 8, trackerPending: 0 });
  assert.deepEqual(await json("/api/nav-counts", env.sessions.admin.cookie), { triageUnreviewed: 13, trackerPending: 0 });
  assert.deepEqual(await json("/api/needs-action", env.sessions.leader.cookie), { count: 0, items: [] });
  assert.deepEqual(await json("/api/needs-action", env.sessions.uki.cookie), { count: 0, items: [] });
  assert.equal((await env.get("/api/needs-action?cycleId=tidak-ada", env.sessions.admin.cookie)).status, 404);
  assert.equal((await env.get("/api/needs-action")).status, 401);
  const units = await json("/api/work-units", env.sessions.reviewer.cookie);
  assert.deepEqual(units.workUnits.map((unit: { code: string }) => unit.code), ["900101", "900102", "900103", "900104", "900105"]);
  assert.equal((await env.get("/api/work-units?organizationUnitId=org_90002", env.sessions.reviewer.cookie)).status, 403);
  assert.equal((await json("/api/work-units", env.sessions.admin.cookie)).workUnits.length, 9);
  const accounts = await json("/api/references/accounts?q=5211", env.sessions.reviewer.cookie);
  assert.ok(accounts.accounts.length === 2 && accounts.accounts.every((account: { code: string }) => account.code.startsWith("5211")));
  assert.equal((await json("/api/references/accounts?q=bangunan", env.sessions.reviewer.cookie)).accounts.length, 2);
  const me = await json("/api/auth/me", env.sessions.reviewer.cookie);
  assert.deepEqual([me.user.username, me.user.unitLabel, me.user.scopeOrganizationUnitIds, me.organizationUnits.length], ["reviewer.demo", "Itjen", ["org_90001"], 1]);
  assert.equal((await json("/api/auth/me", env.sessions.uki.cookie)).user.unitLabel, "DJCA");
  assert.deepEqual(await json("/api/auth/me", ""), { user: null, organizationUnits: [] });
  env.close();
});
