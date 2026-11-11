import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, getDatabase, type Database } from "./client.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
const BREAKPOINT = "--> statement-breakpoint";

interface Journal { entries: { idx: number; tag: string }[] }

/**
 * Menerapkan migrasi di `apps/api/drizzle` sesuai `meta/_journal.json`, sekali per tag.
 * Pengganti `drizzle-kit migrate` karena API memakai `node:sqlite` (tidak ada driver bawaan).
 * Mengembalikan tag yang baru diterapkan.
 */
export function migrate(database: Database): string[] {
  const { sqlite } = database;
  assertNotLegacyDatabase(sqlite);
  sqlite.exec("CREATE TABLE IF NOT EXISTS __nirmala_migrations (tag TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const applied = new Set(readTags(sqlite));
  const journal = JSON.parse(readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8")) as Journal;
  const done: string[] = [];
  for (const entry of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
    if (applied.has(entry.tag)) continue;
    const statements = readFileSync(join(migrationsDir, `${entry.tag}.sql`), "utf8").split(BREAKPOINT).map((part) => part.trim()).filter(Boolean);
    sqlite.exec("BEGIN");
    try {
      for (const statement of statements) sqlite.exec(statement);
      sqlite.prepare("INSERT INTO __nirmala_migrations (tag, applied_at) VALUES (?, ?)").run(entry.tag, Date.now());
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw new Error(`Migrasi ${entry.tag} gagal: ${error instanceof Error ? error.message : String(error)}`);
    }
    done.push(entry.tag);
  }
  return done;
}

/** Database prototipe lama (skema sebelum Fase 1) tidak bisa dimigrasi baris per baris; datanya sintetis dan dibuang. */
function assertNotLegacyDatabase(sqlite: Database["sqlite"]) {
  const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((row) => row.name);
  if (tables.includes("users") && !tables.includes("__nirmala_migrations")) {
    throw new Error("Database lama (skema prototipe) terdeteksi. Hapus berkas SQLite-nya (termasuk -wal dan -shm), lalu jalankan `npm run db:migrate && npm run db:seed`.");
  }
}

function readTags(sqlite: Database["sqlite"]) {
  const statement = sqlite.prepare("SELECT tag FROM __nirmala_migrations");
  return (statement.all() as { tag: string }[]).map((row) => row.tag);
}

/** Database SQLite baru dengan seluruh migrasi diterapkan. Untuk test. */
export function createMigratedDatabase(path = ":memory:") {
  const database = createDatabase(path);
  migrate(database);
  return database;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await import("dotenv/config");
  const applied = migrate(getDatabase());
  console.log(applied.length ? `Migrasi diterapkan: ${applied.join(", ")}` : "Database sudah mutakhir.");
}
