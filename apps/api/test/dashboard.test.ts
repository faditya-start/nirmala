import test from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import type { DashboardResponse, NeedsActionResponse, TriageListResponse } from "@nirmala/shared";
import { chrNotes } from "../src/db/schema.ts";
import { setupPhase6 } from "./phase6Helpers.ts";

test("dashboard: validasi, autentikasi, siklus dan eselon I di luar scope", async () => {
  const env = await setupPhase6();
  const { reviewer, leader } = env.sessions;
  assert.equal((await env.get(`/api/dashboard?cycleId=${env.cycleId}`)).status, 401);
  assert.equal((await env.get("/api/dashboard", reviewer.cookie)).status, 400, "cycleId wajib");
  assert.equal((await env.get("/api/dashboard?cycleId=tidak-ada", reviewer.cookie)).status, 404);
  const outside = await env.get(`/api/dashboard?cycleId=${env.cycleId}&organizationUnitId=org_90002`, reviewer.cookie);
  assert.equal(outside.status, 403);
  assert.equal(((await outside.json()) as { error: string }).error, "Anda tidak memiliki akses ke eselon I ini.");
  assert.equal((await env.get(`/api/dashboard?cycleId=${env.cycleId}&organizationUnitId=org_tidak_ada`, leader.cookie)).status, 404);
  env.close();
});

test("dashboard sebelum loop: hanya snapshot Awal, tanpa catatan; siklus baru tanpa snapshot", async () => {
  const env = await setupPhase6();
  const { reviewer, leader, admin } = env.sessions;
  const own = (await env.getJson<DashboardResponse>(`/api/dashboard?cycleId=${env.cycleId}`, reviewer.cookie)).body;
  assert.equal(own.scopeKind, "own");
  assert.deepEqual(own.organizationUnitNames, ["DJCA"]);
  assert.deepEqual(own.organizations.map((org) => org.organizationUnitCode), ["90001"]);
  assert.equal(own.organizations[0].snapshot?.label, "Awal");
  assert.equal(own.organizations[0].satkerCount, 5);
  assert.equal(own.kpis.satkerTotal, 5);
  assert.deepEqual([own.kpis.satkerReady, own.kpis.satkerWithNotes], [0, 0]);
  assert.equal(own.organizations[0].percentClosed, null, "tanpa catatan terbit tidak ada persen");
  assert.deepEqual(own.actions.map((card) => card.kind), ["chr_draf"]);
  assert.equal(own.actions[0].count, 0);
  assert.equal(own.actions[0].lastIssuedChr, null);

  // Siklus tanpa snapshot: pimpinan melihat kedua eselon I sebagai "Belum diimpor".
  const created = await env.call("POST", "/api/cycles", admin.cookie, { fiscalYear: 2027, stage: "pagu" });
  const emptyCycleId = ((await created.json()) as { cycle: { id: string } }).cycle.id;
  const empty = (await env.getJson<DashboardResponse>(`/api/dashboard?cycleId=${emptyCycleId}`, leader.cookie)).body;
  assert.equal(empty.scopeKind, "all");
  assert.equal(empty.dataAsOf, null);
  assert.deepEqual(empty.snapshots, []);
  assert.equal(empty.organizations.length, 2);
  assert.ok(empty.organizations.every((org) => org.snapshot === null && org.itemsFlagged === null && org.notesOpen === null));
  assert.equal(empty.kpis.itemsAnalyzed, 0);
  assert.deepEqual(empty.notesByCategory, { EFISIENSI: 0, SATUAN_BIAYA: 0, AKUN: 0, LAINNYA: 0 });
  env.close();
});

test("dashboard per peran pada loop demo; angka konsisten dengan triage, tracker, dan needs-action", async () => {
  const env = await setupPhase6();
  const { reviewer, uki, leader, admin } = env.sessions;
  await env.runLoop();
  const url = `/api/dashboard?cycleId=${env.cycleId}`;

  // --- Reviewer (eselon I sendiri)
  const rev = (await env.getJson<DashboardResponse>(url, reviewer.cookie)).body;
  assert.equal(rev.scopeKind, "own");
  assert.deepEqual(rev.organizations.map((org) => org.organizationUnitCode), ["90001"]);
  const triage = await env.json<TriageListResponse>(await env.get(`/api/triage/items?cycleId=${env.cycleId}`, reviewer.cookie));
  assert.equal(rev.kpis.itemsAnalyzed, triage.summary.analyzedItems);
  assert.equal(rev.kpis.itemsFlagged, triage.summary.flaggedItems);
  assert.equal(rev.organizations[0].itemsFlagged, triage.summary.flaggedItems);
  assert.equal(rev.organizations[0].snapshot?.label, "Revisi");
  assert.deepEqual(rev.snapshots.map((snapshot) => [snapshot.organizationUnitName, snapshot.versionNo]), [["DJCA", 2]]);

  const tracker = await env.trackerNotes(reviewer.cookie);
  assert.equal(rev.notesByStatus.perlu_verifikasi, tracker.statusCounts.perlu_verifikasi);
  assert.equal(rev.organizations[0].notesIssued, tracker.pagination.total);
  assert.equal(rev.organizations[0].notesClosed, 0);
  assert.equal(rev.organizations[0].notesOpen, tracker.pagination.total);
  assert.equal(rev.organizations[0].percentClosed, 0);
  assert.equal(rev.organizations[0].chrStatus, "issued");
  assert.match(rev.organizations[0].chrDocumentNumber ?? "", /^CHR\/90001\/2026\/alokasi\/\d{3}$/);
  assert.deepEqual(rev.chrDocumentNumbers, [rev.organizations[0].chrDocumentNumber]);
  assert.equal(Object.values(rev.notesByCategory).reduce((a, b) => a + b, 0), tracker.pagination.total);

  const needs = await env.json<NeedsActionResponse>(await env.get(`/api/needs-action?cycleId=${env.cycleId}`, reviewer.cookie));
  const verifyCard = rev.actions.find((card) => card.kind === "perlu_verifikasi")!;
  assert.equal(verifyCard.count, needs.items.find((item) => item.href.includes("perlu_verifikasi"))!.count);
  assert.equal(verifyCard.href, "/tracker?status=perlu_verifikasi");
  assert.ok(verifyCard.oldestNote && verifyCard.oldestNote.waitingDays >= 0 && verifyCard.oldestNote.latestCheckResult);
  const draftCard = rev.actions.find((card) => card.kind === "chr_draf")!;
  assert.equal(draftCard.count, 0);
  assert.equal(draftCard.lastIssuedChr?.documentNumber, rev.organizations[0].chrDocumentNumber);
  assert.deepEqual(rev.actions.map((card) => card.kind), ["perlu_verifikasi", "chr_draf"]);

  // --- Satker siap diajukan: setujui semua catatan satu Satker lewat API.
  const bySatker = new Map<string, string[]>();
  for (const row of tracker.items) bySatker.set(row.workUnitId ?? "", [...(bySatker.get(row.workUnitId ?? "") ?? []), row.id]);
  const [satkerId, ids] = [...bySatker.entries()][0];
  for (const id of ids) assert.equal((await env.call("POST", `/api/tracker/notes/${id}/approve`, reviewer.cookie, {})).status, 200, satkerId);
  const after = (await env.getJson<DashboardResponse>(url, reviewer.cookie)).body;
  assert.equal(after.kpis.satkerReady, 1);
  assert.equal(after.kpis.satkerWithNotes, bySatker.size);
  assert.equal(after.organizations[0].notesClosed, ids.length);
  assert.equal(after.organizations[0].notesOpen, tracker.pagination.total - ids.length);
  assert.equal(after.organizations[0].percentClosed, Math.round((ids.length / tracker.pagination.total) * 100));
  assert.equal(after.notesByStatus.closed, ids.length);

  // --- UKI: kartu berbasis tindak lanjut, bukan kartu reviewer.
  const ukiBoard = (await env.getJson<DashboardResponse>(url, uki.cookie)).body;
  assert.equal(ukiBoard.scopeKind, "own");
  const ukiKinds = ukiBoard.actions.map((card) => card.kind);
  assert.ok(!ukiKinds.includes("perlu_verifikasi") && !ukiKinds.includes("chr_draf"));
  assert.ok(ukiKinds.includes("belum_terpenuhi") && ukiKinds.includes("tanggapan_belum_diisi"));
  const ukiNeeds = await env.json<NeedsActionResponse>(await env.get(`/api/needs-action?cycleId=${env.cycleId}`, uki.cookie));
  assert.equal(ukiBoard.actions.find((card) => card.kind === "belum_terpenuhi")!.count, ukiNeeds.items.find((item) => /status=perlu_verifikasi/.test(item.href))!.count);
  assert.equal(ukiBoard.actions.find((card) => card.kind === "tanggapan_belum_diisi")!.count, 1);

  // --- Pimpinan dan admin: semua eselon I; pimpinan tidak punya kartu tindakan.
  const lead = (await env.getJson<DashboardResponse>(url, leader.cookie)).body;
  assert.equal(lead.scopeKind, "all");
  assert.deepEqual(lead.organizations.map((org) => org.organizationUnitCode), ["90001", "90002"]);
  assert.deepEqual(lead.actions, []);
  assert.equal(lead.organizations.reduce((sum, org) => sum + org.notesIssued, 0), Object.values((await env.trackerNotes(admin.cookie)).statusCounts).reduce((a, b) => a + b, 0));
  assert.equal(lead.kpis.satkerTotal, 9);
  assert.equal(lead.notesByStatus.closed, ids.length);
  assert.deepEqual(lead.organizationUnitNames, ["DJCA", "DJCB"]);
  const adm = (await env.getJson<DashboardResponse>(url, admin.cookie)).body;
  assert.equal(adm.scopeKind, "all");
  assert.ok(adm.actions.some((card) => card.kind === "perlu_verifikasi"));
  const filtered = (await env.getJson<DashboardResponse>(`${url}&organizationUnitId=org_90002`, leader.cookie)).body;
  assert.deepEqual(filtered.organizations.map((org) => org.organizationUnitCode), ["90002"]);
  assert.equal(filtered.scopeKind, "all");
  env.close();
});

test("dashboard: catatan draf ikut dihitung (A20), tidak masuk catatan terbit", async () => {
  const env = await setupPhase6();
  const { reviewer, leader } = env.sessions;
  const item = await env.findItem(reviewer.cookie, "Pengadaan kaos seragam peringatan HUT Kemerdekaan 17 Agustus", "900101");
  const confirmed = await env.call("POST", `/api/triage/items/${item.id}/confirm`, reviewer.cookie, { category: "EFISIENSI", text: "Pengadaan kaos tidak esensial.", expectation: { type: "hapus_item" } });
  assert.equal(confirmed.status, 201);
  const board = (await env.getJson<DashboardResponse>(`/api/dashboard?cycleId=${env.cycleId}`, leader.cookie)).body;
  assert.equal(board.notesByStatus.draf, 1);
  assert.equal(board.notesByCategory.EFISIENSI, 1);
  const row = board.organizations.find((org) => org.organizationUnitCode === "90001")!;
  assert.deepEqual([row.notesDraft, row.notesIssued, row.percentClosed, row.chrStatus], [1, 0, null, "draft"]);
  assert.deepEqual(board.chrDocumentNumbers, []);
  const reviewerBoard = (await env.getJson<DashboardResponse>(`/api/dashboard?cycleId=${env.cycleId}`, reviewer.cookie)).body;
  const draftCard = reviewerBoard.actions.find((card) => card.kind === "chr_draf")!;
  assert.equal(draftCard.count, 1);
  assert.match(draftCard.href, /^\/chr\/chr_/);
  assert.equal(await env.database.db.$count(chrNotes, and(eq(chrNotes.status, "draf"))), 1);
  env.close();
});

