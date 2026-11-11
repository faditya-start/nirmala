import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.ts";
import { createBackup, pruneBackups } from "../src/backup.ts";
import { createDatabase } from "../src/db/client.ts";
import { createMigratedDatabase } from "../src/db/migrate.ts";
import { seedMasterData } from "../src/db/seed.ts";
import { users } from "../src/db/schema.ts";

function fakeDist() {
  const dir = mkdtempSync(join(tmpdir(), "nirmala-dist-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>NIRMALA</title><div id=root></div>");
  writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log('app');");
  writeFileSync(join(dir, "assets", "app-abc123.css"), "body{margin:0}");
  writeFileSync(join(dir, "favicon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  return dir;
}

async function appWith(options: { webDist?: string | null; secureCookies?: boolean } = {}) {
  const database = createMigratedDatabase();
  await seedMasterData(database);
  const app = createApp({ database, sessionSecret: "test-secret", ...options });
  return { app, database };
}

test("produksi satu proses: berkas statis, fallback SPA, /api tidak pernah jatuh ke index.html", async () => {
  const dist = fakeDist();
  const { app, database } = await appWith({ webDist: dist });

  const root = await app.request("/");
  assert.equal(root.status, 200);
  assert.match(root.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await root.text(), /id=root/);
  assert.equal(root.headers.get("cache-control"), "no-cache", "index.html tidak boleh di-cache lama");
  assert.match(root.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  assert.equal(root.headers.get("x-content-type-options"), "nosniff");
  assert.equal(root.headers.get("x-frame-options"), "DENY");
  assert.equal(root.headers.get("strict-transport-security"), null, "HSTS hanya bila secureCookies (produksi)");

  // Rute SPA tanpa berkas -> index.html.
  for (const path of ["/triage", "/chr/abc123", "/transparansi?cycle=1"]) {
    const response = await app.request(path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /id=root/, path);
  }

  // Aset berhash di-cache lama dengan tipe yang benar; berkas lain no-cache + ETag, 304 pada If-None-Match.
  const js = await app.request("/assets/app-abc123.js");
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type") ?? "", /javascript/);
  assert.equal(js.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.match((await app.request("/assets/app-abc123.css")).headers.get("content-type") ?? "", /text\/css/);
  const icon = await app.request("/favicon.svg");
  assert.equal(icon.headers.get("content-type"), "image/svg+xml");
  assert.equal(icon.headers.get("cache-control"), "no-cache");
  const etag = icon.headers.get("etag")!;
  assert.equal((await app.request("/favicon.svg", { headers: { "if-none-match": etag } })).status, 304);
  assert.equal(await (await app.request("/favicon.svg", { method: "HEAD" })).text(), "");

  // Berkas beraksen yang tidak ada -> 404 (bukan HTML), tanpa fallback.
  const missing = await app.request("/assets/hilang.js");
  assert.equal(missing.status, 404);
  assert.doesNotMatch(await missing.text(), /id=root/);

  // /api menang: JSON untuk rute nyata, JSON 404 untuk rute tidak dikenal, tidak pernah index.html.
  const health = await app.request("/api/health");
  assert.equal(health.status, 200);
  assert.equal(((await health.json()) as { status: string }).status, "ok");
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.equal(health.headers.get("content-security-policy"), null);
  for (const path of ["/api/tidak-ada", "/api", "/api/public/transparency/summary"]) {
    const response = await app.request(path);
    assert.equal(response.status, 404, path);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/, path);
  }
  assert.equal((await app.request("/api/users")).status, 401, "rute terproteksi tetap menjawab 401, bukan HTML");

  // Metode selain GET/HEAD tidak dilayani sebagai SPA.
  assert.equal((await app.request("/triage", { method: "POST" })).status, 404);

  // Path traversal ditolak.
  for (const path of ["/..%2f..%2fetc%2fpasswd", "/%2e%2e/%2e%2e/etc/passwd", "/assets/..%2f..%2f..%2fpackage.json"]) {
    const response = await app.request(path);
    const text = await response.text();
    assert.ok([400, 404].includes(response.status) || text.includes("id=root"), path);
    assert.doesNotMatch(text, /root:|"name"/, path);
  }
  database.close();
  rmSync(dist, { recursive: true });
});

test("tanpa webDist API murni (pengembangan): rute non-/api 404, HSTS aktif di mode aman", async () => {
  const { app, database } = await appWith();
  assert.equal((await app.request("/")).status, 404);
  const secure = await appWith({ secureCookies: true });
  assert.match((await secure.app.request("/api/health")).headers.get("strict-transport-security") ?? "", /max-age=/);
  database.close(); secure.database.close();
});

test("dist tanpa index.html: pesan jelas, bukan crash", async () => {
  const empty = mkdtempSync(join(tmpdir(), "nirmala-empty-"));
  const { app, database } = await appWith({ webDist: empty });
  const response = await app.request("/triage");
  assert.equal(response.status, 404);
  assert.match(await response.text(), /belum dibangun/);
  database.close();
  rmSync(empty, { recursive: true });
});

test("cadangan SQLite: salinan konsisten dapat dibuka, retensi menghapus yang lama saja", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nirmala-backup-"));
  const dbPath = join(dir, "nirmala.sqlite");
  const live = createMigratedDatabase(dbPath);
  await seedMasterData(live);

  const backupDir = join(dir, "backups");
  mkdirSync(backupDir);
  // Cadangan lama + berkas lain di folder yang sama.
  const old = join(backupDir, "nirmala-20200101-000000.sqlite");
  writeFileSync(old, "lama");
  utimesSync(old, new Date("2020-01-01"), new Date("2020-01-01"));
  const unrelated = join(backupDir, "catatan.txt");
  writeFileSync(unrelated, "jangan dihapus");
  utimesSync(unrelated, new Date("2020-01-01"), new Date("2020-01-01"));

  const result = createBackup({ databasePath: dbPath, directory: backupDir, keepDays: 14, now: new Date("2026-11-11T03:04:05Z") });
  assert.equal(result.file, join(backupDir, "nirmala-20261111-030405.sqlite"));
  assert.deepEqual(result.removed, ["nirmala-20200101-000000.sqlite"]);
  assert.ok(!existsSync(old) && existsSync(unrelated), "hanya berkas cadangan yang kedaluwarsa dihapus");

  // Database yang sedang dipakai tetap bisa ditulis, dan salinan berisi data pada saat dicadangkan.
  const restored = createDatabase(result.file);
  assert.equal((await restored.db.select().from(users)).length, 4);
  await live.db.insert(users).values({ id: "usr_baru", username: "baru", displayName: "Baru", role: "reviewer", passwordHash: "x", createdAt: Date.now() });
  assert.equal((await restored.db.select().from(users)).length, 4, "cadangan tidak berubah oleh penulisan berikutnya");
  restored.close();

  assert.throws(() => createBackup({ databasePath: ":memory:", directory: backupDir }), /:memory:/);
  assert.deepEqual(pruneBackups(backupDir, 14, new Date("2026-11-11")), [], "pruneBackups idempoten");
  live.close();
  rmSync(dir, { recursive: true });
});

test("tidak ada sisa endpoint 501 / konstanta publik lama", () => {
  assert.ok(!existsSync(new URL("../src/publicData.ts", import.meta.url)));
  assert.ok(!existsSync(new URL("../src/routes/legacy.ts", import.meta.url)));
  assert.doesNotMatch(readFileSync(new URL("../src/app.ts", import.meta.url), "utf8"), /legacy|501|publicTransparency/);
});

test("bootstrap produksi: master data nyata tanpa akun demo/eselon I fiktif; create-admin membuat admin yang bisa masuk; idempoten", async () => {
  const { ensureAdmin } = await import("../src/services/bootstrapAdmin.ts");
  const { organizationUnits, riskConfig, rules, userScopes, auditLogs } = await import("../src/db/schema.ts");
  const database = createMigratedDatabase();
  await seedMasterData(database, { demo: false });
  await seedMasterData(database, { demo: false });
  const { db } = database;
  assert.equal((await db.select().from(users)).length, 0, "tanpa akun demo");
  assert.equal((await db.select().from(organizationUnits)).length, 0, "tanpa eselon I fiktif");
  assert.equal((await db.select().from(userScopes)).length, 0);
  assert.equal((await db.select().from(rules)).length, 8);
  const [config] = await db.select().from(riskConfig);
  assert.equal(config.createdBy, null);

  await assert.rejects(ensureAdmin(database, { username: "admin.nyata", displayName: "Admin Nyata", password: "pendek" }), /minimal 12/);
  assert.equal(await ensureAdmin(database, { username: "admin.nyata", displayName: "Admin Nyata", password: "Sandi-produksi-1" }), "created");
  const app = createApp({ database, sessionSecret: "test-secret" });
  const login = (password: string) => app.request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin.nyata", password }) });
  assert.equal((await login("Sandi-produksi-1")).status, 200);
  assert.equal(await ensureAdmin(database, { username: "admin.nyata", displayName: "Admin Nyata", password: "Sandi-baru-12345" }), "updated");
  assert.equal((await login("Sandi-produksi-1")).status, 401);
  assert.equal((await login("Sandi-baru-12345")).status, 200);
  assert.deepEqual((await db.select().from(auditLogs)).filter((row) => row.action.startsWith("user.")).map((row) => [row.action, row.actorUserId]), [["user.created", null], ["user.updated", null]]);
  database.close();
});
