import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import type { AuditLogFacetsResponse, AuditLogListResponse, DashboardResponse, UserAdminDto, UserListResponse, UserResponse } from "@nirmala/shared";
import { auditLogs, sessions, userScopes } from "../src/db/schema.ts";
import { DEMO, setupSeeded } from "./helpers.ts";

const password = "Sandi-uji-123456";

async function env() {
  const e = await setupSeeded();
  const json = async <T>(response: Response) => (await response.json()) as T;
  const create = async (body: Record<string, unknown>) => e.call("POST", "/api/users", e.sessions.admin.cookie, { password, displayName: "Pengguna Uji", ...body });
  return { ...e, json, create, admin: e.sessions.admin.cookie };
}

test("pengguna: daftar S12c memuat active, unitLabel, eselon I dan allOrganizations", async () => {
  const e = await env();
  const { users } = await e.json<UserListResponse>(await e.get("/api/users", e.admin));
  const byName = Object.fromEntries(users.map((user) => [user.username, user]));
  assert.deepEqual(users.map((user) => user.displayName), [...users.map((user) => user.displayName)].sort((a, b) => a.localeCompare(b)));
  assert.deepEqual([byName["reviewer.demo"].active, byName["reviewer.demo"].unitLabel, byName["reviewer.demo"].organizationUnitIds, byName["reviewer.demo"].allOrganizations], [true, "Itjen", ["org_90001"], false]);
  assert.deepEqual(byName["reviewer.demo"].organizationUnits, [{ id: "org_90001", code: "90001", shortName: "DJCA", name: "Direktorat Jenderal Contoh A (fiktif)" }]);
  assert.deepEqual([byName["pimpinan.demo"].allOrganizations, byName["pimpinan.demo"].organizationUnitIds, byName["admin.demo"].allOrganizations], [true, [], true]);
  assert.equal(typeof byName["uki.demo"].createdAt, "number");
  e.close();
});

test("pengguna: peran admin saja untuk semua endpoint admin tambahan (401/403)", async () => {
  const e = await env();
  const created = await e.json<{ id: string }>(await e.create({ username: "target.uji", role: "reviewer", organizationUnitIds: ["org_90001"] }));
  const calls: [string, string, unknown?][] = [
    ["GET", "/api/users"], ["POST", "/api/users", { username: "x.uji", displayName: "X Uji", role: "leader", password }],
    ["PUT", `/api/users/${created.id}`, { displayName: "Nama Baru" }], ["PUT", `/api/users/${created.id}/role`, { role: "uki" }],
    ["PUT", `/api/users/${created.id}/scopes`, { organizationUnitIds: [] }], ["PUT", `/api/users/${created.id}/active`, { active: false }],
    ["GET", "/api/audit-logs"], ["GET", "/api/audit-logs/facets"]
  ];
  for (const [method, path, body] of calls) {
    assert.equal((await e.call(method, path, undefined, body)).status, 401, `${method} ${path}`);
    for (const role of ["reviewer", "uki", "leader"] as const) assert.equal((await e.call(method, path, e.sessions[role].cookie, body)).status, 403, `${role} ${method} ${path}`);
  }
  e.close();
});

test("pengguna: buat dengan akses eselon I, aturan peran, galat, dan audit", async () => {
  const e = await env();
  const bad = await e.create({ username: "tanpa.eselon", role: "reviewer" });
  assert.equal(bad.status, 400);
  assert.equal((await e.json<{ error: string }>(bad)).error, "Pilih minimal satu eselon I untuk peran ini.");
  assert.equal((await e.create({ username: "uki.kosong", role: "uki", organizationUnitIds: [] })).status, 400);
  const unknown = await e.create({ username: "eselon.salah", role: "uki", organizationUnitIds: ["org_tidak_ada"] });
  assert.equal(unknown.status, 400);
  assert.equal((await e.json<{ error: string }>(unknown)).error, "Eselon I tidak ditemukan.");
  assert.equal((await e.create({ username: "pendek", role: "leader", password: "pendek" })).status, 400);
  assert.equal((await e.create({ username: "reviewer.demo", role: "leader" })).status, 409, "username dipakai");

  const ok = await e.create({ username: "reviewer.dua", role: "reviewer", unitLabel: "Biro Keuangan", organizationUnitIds: ["org_90001", "org_90002", "org_90001"] });
  assert.equal(ok.status, 201);
  const { id } = await e.json<{ id: string }>(ok);
  const leader = await e.create({ username: "pimpinan.dua", role: "leader" });
  assert.equal(leader.status, 201, "leader/admin boleh tanpa eselon I");

  const { users } = await e.json<UserListResponse>(await e.get("/api/users", e.admin));
  const created = users.find((user) => user.id === id)!;
  assert.deepEqual([created.unitLabel, created.active, created.organizationUnitIds.sort()], ["Biro Keuangan", true, ["org_90001", "org_90002"]]);
  const login = await e.login("reviewer.dua", password);
  assert.equal(login.response.status, 200);
  const audit = (await e.database.db.select().from(auditLogs).where(eq(auditLogs.entityId, id)))[0];
  assert.deepEqual([audit.action, audit.entityType, audit.actorUserId], ["user.created", "user", "usr_admin"]);
  e.close();
});

test("pengguna: ubah profil (unitLabel) dan peran tetap berfungsi; audit per mutasi", async () => {
  const e = await env();
  const { id } = await e.json<{ id: string }>(await e.create({ username: "profil.uji", role: "uki", organizationUnitIds: ["org_90001"] }));
  const put = await e.call("PUT", `/api/users/${id}`, e.admin, { displayName: "Nama Baru", unitLabel: "Itjen" });
  assert.deepEqual(await e.json(put), { id, displayName: "Nama Baru" });
  assert.equal((await e.call("PUT", `/api/users/${id}`, e.admin, { displayName: "N" })).status, 400);
  assert.equal((await e.call("PUT", "/api/users/tidak-ada", e.admin, { displayName: "Nama Baru" })).status, 404);
  const updated = (await e.json<UserListResponse>(await e.get("/api/users", e.admin))).users.find((user) => user.id === id)!;
  assert.deepEqual([updated.displayName, updated.unitLabel], ["Nama Baru", "Itjen"]);
  assert.equal((await e.call("PUT", `/api/users/${id}/role`, e.admin, { role: "reviewer" })).status, 200);
  assert.equal((await e.call("PUT", "/api/users/usr_admin/role", e.admin, { role: "leader" })).status, 409);
  const actions = (await e.database.db.select().from(auditLogs).where(eq(auditLogs.entityId, id))).map((row) => row.action).sort();
  assert.deepEqual(actions, ["user.created", "user.role_changed", "user.updated"]);
  e.close();
});

test("PUT /api/users/:id/scopes: mengganti daftar, 400 eselon I tidak ada, 404, audit before/after, berpengaruh pada akses", async () => {
  const e = await env();
  const reviewer = e.sessions.reviewer;
  const url = "/api/users/usr_reviewer/scopes";
  const dash = async () => (await e.json<DashboardResponse>(await e.get(`/api/dashboard?cycleId=${e.cycleId}`, reviewer.cookie)));
  assert.deepEqual((await dash()).organizations.map((org) => org.organizationUnitCode), ["90001"]);

  assert.equal((await e.call("PUT", url, e.admin, { organizationUnitIds: ["org_tidak_ada"] })).status, 400);
  assert.equal((await e.call("PUT", url, e.admin, {})).status, 400);
  assert.equal((await e.call("PUT", "/api/users/tidak-ada/scopes", e.admin, { organizationUnitIds: [] })).status, 404);
  assert.equal((await e.database.db.select().from(userScopes).where(eq(userScopes.userId, "usr_reviewer"))).length, 1, "galat tidak mengubah apa pun");

  const result = await e.json<UserResponse>(await e.call("PUT", url, e.admin, { organizationUnitIds: ["org_90002", "org_90002"] }));
  assert.deepEqual(result.user.organizationUnitIds, ["org_90002"]);
  assert.deepEqual(result.user.organizationUnits.map((unit) => unit.shortName), ["DJCB"]);
  assert.deepEqual((await dash()).organizations.map((org) => org.organizationUnitCode), ["90002"], "scope baru langsung berlaku");
  assert.equal((await e.get(`/api/dashboard?cycleId=${e.cycleId}&organizationUnitId=org_90001`, reviewer.cookie)).status, 403);

  const audit = (await e.database.db.select().from(auditLogs).where(eq(auditLogs.action, "user.scopes_changed")))[0];
  assert.deepEqual([audit.entityId, audit.actorUserId, audit.before, audit.after], ["usr_reviewer", "usr_admin", { organizationUnitIds: ["org_90001"] }, { organizationUnitIds: ["org_90002"] }]);

  // Daftar kosong = tidak melihat apa pun (hasil kosong, bukan galat).
  assert.equal((await e.call("PUT", url, e.admin, { organizationUnitIds: [] })).status, 200);
  const none = await dash();
  assert.deepEqual([none.organizations, none.snapshots, none.kpis.itemsAnalyzed], [[], [], 0]);

  // Pengguna leader: disimpan tetapi tidak berpengaruh (tetap melihat semua).
  const leaderScopes = await e.json<UserResponse>(await e.call("PUT", "/api/users/usr_leader/scopes", e.admin, { organizationUnitIds: ["org_90001"] }));
  assert.deepEqual([leaderScopes.user.allOrganizations, leaderScopes.user.organizationUnitIds], [true, []]);
  assert.equal((await e.json<DashboardResponse>(await e.get(`/api/dashboard?cycleId=${e.cycleId}`, e.sessions.leader.cookie))).organizations.length, 2);
  e.close();
});

test("PUT /api/users/:id/active: nonaktif menghapus sesi dan menolak masuk; diri sendiri 409; idempoten; audit", async () => {
  const e = await env();
  const { reviewer } = e.sessions;
  assert.equal((await e.get("/api/auth/me", reviewer.cookie)).status, 200);
  assert.ok((await e.database.db.select().from(sessions).where(eq(sessions.userId, "usr_reviewer"))).length > 0);

  const self = await e.call("PUT", "/api/users/usr_admin/active", e.admin, { active: false });
  assert.equal(self.status, 409);
  assert.equal((await e.json<{ error: string }>(self)).error, "Admin tidak dapat menonaktifkan dirinya sendiri.");
  assert.equal((await e.call("PUT", "/api/users/usr_admin/active", e.admin, { active: true })).status, 200, "mengaktifkan diri sendiri tidak dilarang");
  assert.equal((await e.call("PUT", "/api/users/usr_reviewer/active", e.admin, { active: "tidak" })).status, 400);
  assert.equal((await e.call("PUT", "/api/users/tidak-ada/active", e.admin, { active: false })).status, 404);

  const off = await e.json<UserResponse>(await e.call("PUT", "/api/users/usr_reviewer/active", e.admin, { active: false }));
  assert.equal(off.user.active, false);
  assert.equal((await e.database.db.select().from(sessions).where(eq(sessions.userId, "usr_reviewer"))).length, 0, "semua sesi dihapus");
  assert.equal((await e.get("/api/dashboard?cycleId=x", reviewer.cookie)).status, 401, "sesi lama tidak berlaku");
  assert.equal((await e.login(...DEMO.reviewer)).response.status, 401, "tidak bisa masuk");
  assert.equal((await e.call("PUT", "/api/users/usr_reviewer/active", e.admin, { active: false })).status, 200);
  assert.equal((await e.database.db.select().from(auditLogs).where(eq(auditLogs.action, "user.deactivated"))).length, 1, "tanpa perubahan tidak ada audit baru");

  const on = await e.json<UserResponse>(await e.call("PUT", "/api/users/usr_reviewer/active", e.admin, { active: true }));
  assert.equal(on.user.active, true);
  assert.equal((await e.login(...DEMO.reviewer)).response.status, 200);
  const audits = await e.database.db.select().from(auditLogs).where(eq(auditLogs.entityId, "usr_reviewer"));
  const row = audits.find((entry) => entry.action === "user.activated")!;
  assert.deepEqual([row.before, row.after], [{ active: false }, { active: true }]);
  e.close();
});

test("audit log: filter action cocok persis, entityType, aktor, rentang waktu (inklusif), entri memuat id dan actorUserId, facets", async () => {
  const e = await env();
  const created = await e.json<{ id: string }>(await e.create({ username: "audit.uji", role: "leader" }));
  await e.call("PUT", `/api/users/${created.id}/active`, e.admin, { active: false });
  await e.call("PUT", `/api/users/${created.id}/scopes`, e.admin, { organizationUnitIds: [] });
  const list = async (query = "") => e.json<AuditLogListResponse>(await e.get(`/api/audit-logs${query}`, e.admin));

  const all = await list("?pageSize=100");
  assert.ok(all.pagination.total >= 4 && all.logs.length === all.pagination.total);
  const first = all.logs[0];
  assert.deepEqual(Object.keys(first).sort(), ["action", "actor", "actorUserId", "after", "before", "createdAt", "detail", "entityId", "entityType", "id"]);
  assert.ok(first.id.startsWith("audit_"));
  assert.ok(all.logs.every((log, index) => index === 0 || all.logs[index - 1].createdAt >= log.createdAt), "terbaru di atas");

  // Aksi cocok persis (bukan "mengandung").
  assert.equal((await list("?action=user")).pagination.total, 0);
  assert.equal((await list("?action=created")).pagination.total, 0);
  const deactivated = await list("?action=user.deactivated");
  assert.deepEqual(deactivated.logs.map((log) => [log.action, log.entityId, log.actorUserId, log.actor]), [["user.deactivated", created.id, "usr_admin", "Ayu Admin"]]);
  assert.equal((await list("?action=")).pagination.total, all.pagination.total, "query kosong = tidak dikirim");
  assert.ok((await list("?entityType=user")).logs.every((log) => log.entityType === "user"));
  assert.equal((await list("?entityType=user&action=user.created")).pagination.total, 1);
  assert.equal((await list("?actorUserId=usr_reviewer")).pagination.total, (await e.database.db.select().from(auditLogs).where(eq(auditLogs.actorUserId, "usr_reviewer"))).length);
  assert.ok((await list("?actorUserId=usr_admin")).pagination.total >= 3);

  // Rentang waktu: `to` inklusif; tanggal saja berarti sampai akhir hari itu.
  const at = first.createdAt;
  assert.equal((await list(`?from=${at}&to=${at}`)).pagination.total >= 1, true);
  assert.equal((await list(`?from=${at + 1}`)).pagination.total, 0);
  assert.equal((await list(`?to=${at - 10 * 86_400_000}`)).pagination.total, 0);
  const day = new Date(at).toISOString().slice(0, 10);
  assert.equal((await list(`?from=${day}&to=${day}`)).pagination.total, all.pagination.total, "satu hari penuh");
  assert.equal((await e.get("/api/audit-logs?from=bukan-tanggal", e.admin)).status, 400);

  // Halaman.
  const page = await list("?pageSize=2&page=2");
  assert.deepEqual([page.logs.length, page.pagination.page, page.pagination.pageSize, page.pagination.totalPages], [2, 2, 2, Math.ceil(all.pagination.total / 2)]);
  assert.equal((await e.get("/api/audit-logs?pageSize=1000", e.admin)).status, 400);

  // Facets: hanya nilai yang pernah muncul.
  const facets = await e.json<AuditLogFacetsResponse>(await e.get("/api/audit-logs/facets", e.admin));
  assert.ok(facets.actions.includes("user.created") && facets.actions.includes("user.deactivated") && facets.actions.includes("snapshot.imported"));
  assert.ok(!facets.actions.includes("chr.issued"), "aksi yang belum pernah terjadi tidak ada");
  assert.deepEqual(facets.actions, [...facets.actions].sort());
  assert.ok(facets.entityTypes.includes("user") && facets.entityTypes.includes("rka_document"));
  assert.ok(facets.actors.some((actor) => actor.id === "usr_admin" && actor.name === "Ayu Admin"));
  assert.ok(!facets.actors.some((actor) => actor.id === created.id), "pengguna yang belum pernah beraksi tidak muncul");
  e.close();
});
