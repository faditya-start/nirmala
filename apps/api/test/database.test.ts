import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createMigratedDatabase, migrate } from "../src/db/migrate.ts";
import { seedMasterData } from "../src/db/seed.ts";
import { auditLogs, organizationUnits, rules } from "../src/db/schema.ts";
import { recordAudit } from "../src/repositories/audit.ts";
import { setup } from "./helpers.ts";

test("UPDATE dan DELETE pada audit_logs ditolak oleh trigger", async () => {
  const { database, close } = await setup();
  await recordAudit(database.db, { actorId: null, action: "test.event", entityType: "test", entityId: "1", detail: "uji", before: { a: 1 }, after: { a: 2 } });

  await assert.rejects(() => database.db.update(auditLogs).set({ detail: "diubah" }).where(eq(auditLogs.action, "test.event")), /append-only/);
  await assert.rejects(() => database.db.delete(auditLogs).where(eq(auditLogs.action, "test.event")), /append-only/);

  const [row] = await database.db.select().from(auditLogs).where(eq(auditLogs.action, "test.event"));
  assert.equal(row.detail, "uji");
  assert.deepEqual(row.after, { a: 2 });
  close();
});

test("migrasi idempoten dan seed master data idempoten", async () => {
  const database = createMigratedDatabase();
  assert.deepEqual(migrate(database), []);
  await seedMasterData(database);
  await seedMasterData(database);
  assert.equal((await database.db.select().from(organizationUnits)).length, 2);
  const seeded = await database.db.select().from(rules);
  assert.deepEqual(seeded.map((rule) => rule.code).sort(), ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08"]);
  database.close();
});

test("foreign key aktif: baris yatim ditolak", async () => {
  const database = createMigratedDatabase();
  await assert.rejects(() => database.db.insert(organizationUnits).values({ id: "x", code: "1", shortName: "x", name: "x", createdAt: 1 }).then(async () => {
    const { workUnits } = await import("../src/db/schema.ts");
    return database.db.insert(workUnits).values({ id: "w", organizationUnitId: "tidak-ada", code: "123456", name: "w", createdAt: 1 });
  }), /FOREIGN KEY/);
  database.close();
});

test("transaksi di-rollback saat melempar dan tidak menelan query konteks lain", async () => {
  const database = createMigratedDatabase();
  const insert = (id: string) => database.db.insert(organizationUnits).values({ id, code: id, shortName: id, name: id, createdAt: 1 });

  await assert.rejects(() => database.transaction(async () => { await insert("a"); throw new Error("batal"); }), /batal/);
  assert.equal((await database.db.select().from(organizationUnits)).length, 0);

  // Query di luar transaksi yang berjalan bersamaan menunggu, lalu tercatat sendiri (tidak ikut rollback).
  const failing = database.transaction(async () => { await insert("b"); await new Promise((resolve) => setTimeout(resolve, 20)); throw new Error("batal"); }).catch(() => undefined);
  const outside = (async () => { await new Promise((resolve) => setTimeout(resolve, 5)); await insert("c"); })();
  await Promise.all([failing, outside]);
  const codes = (await database.db.select().from(organizationUnits)).map((unit) => unit.id);
  assert.deepEqual(codes, ["c"]);

  const result = await database.transaction(async () => { await insert("d"); return 42; });
  assert.equal(result, 42);
  assert.equal((await database.db.select().from(organizationUnits)).length, 2);
  database.close();
});

test("database prototipe lama terdeteksi dengan pesan jelas", async () => {
  const { createDatabase } = await import("../src/db/client.ts");
  const legacy = createDatabase(":memory:");
  legacy.sqlite.exec("CREATE TABLE users (id TEXT PRIMARY KEY)");
  assert.throws(() => migrate(legacy), /Database lama/);
  legacy.close();
});
