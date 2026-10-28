import { createRequire } from "node:module";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

type Statement = { run(...values: unknown[]): unknown; get(...values: unknown[]): Record<string, unknown> | undefined; all(...values: unknown[]): Record<string, unknown>[] };
type Database = { exec(sql: string): void; prepare(sql: string): Statement; close(): void };
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => Database };
const scrypt = promisify(scryptCallback);
const databasePath = process.env.DATABASE_PATH ?? "./nirmala.sqlite";
let database: Database | undefined;

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('reviewer','leader','admin')), password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS organization_units (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS work_units (id TEXT PRIMARY KEY, organization_unit_id TEXT NOT NULL REFERENCES organization_units(id), code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rka_documents (id TEXT PRIMARY KEY, fiscal_year INTEGER NOT NULL, organization_unit_id TEXT NOT NULL REFERENCES organization_units(id), work_unit_id TEXT NOT NULL REFERENCES work_units(id), revision_number INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rka_items (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES rka_documents(id), bas_code TEXT NOT NULL, program TEXT NOT NULL, activity TEXT NOT NULL, description TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT NOT NULL, unit_price INTEGER NOT NULL, total_amount INTEGER NOT NULL, evaluation_status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS price_references (id TEXT PRIMARY KEY, fiscal_year INTEGER NOT NULL, item_name TEXT NOT NULL, unit TEXT NOT NULL, reference_price INTEGER NOT NULL, source_name TEXT NOT NULL, is_synthetic INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS risk_assessments (id TEXT PRIMARY KEY, rka_item_id TEXT NOT NULL UNIQUE REFERENCES rka_items(id), score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100), category TEXT NOT NULL CHECK(category IN ('low','medium','high')), engine_version TEXT NOT NULL, data_completeness TEXT NOT NULL, assessed_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor_user_id TEXT REFERENCES users(id), action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL);
`;

export function db() { if (!database) { database = new DatabaseSync(databasePath); database.exec(schema); } return database; }
export function id(prefix: string) { return `${prefix}_${randomBytes(12).toString("hex")}`; }
export async function hashPassword(password: string) { const salt = randomBytes(16).toString("hex"); const derived = await scrypt(password, salt, 64) as Buffer; return `${salt}:${derived.toString("hex")}`; }
export async function verifyPassword(password: string, stored: string) { const [salt, expected] = stored.split(":"); if (!salt || !expected) return false; const derived = await scrypt(password, salt, 64) as Buffer; const expectedBuffer = Buffer.from(expected, "hex"); return expectedBuffer.length === derived.length && timingSafeEqual(expectedBuffer, derived); }

export async function seedDatabase() {
  const conn = db(); const count = conn.prepare("SELECT COUNT(*) AS count FROM users").get()!.count as number; if (count) return;
  const now = Date.now();
  const accounts = [["usr_reviewer", "reviewer.demo", "Rani Reviewer", "reviewer", "Review123!"], ["usr_leader", "pimpinan.demo", "Pandu Pimpinan", "leader", "Pimpin123!"], ["usr_admin", "admin.demo", "Ayu Admin", "admin", "Admin123!"]] as const;
  for (const [userId, username, name, role, password] of accounts) conn.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)").run(userId, username, name, role, await hashPassword(password), now);
  conn.prepare("INSERT INTO organization_units VALUES (?, ?, ?, ?)").run("org_pembangunan", "ORG-01", "Organisasi Pembangunan Sintetis", now);
  conn.prepare("INSERT INTO work_units VALUES (?, ?, ?, ?, ?)").run("satker_infra", "org_pembangunan", "SAT-01", "Satuan Kerja Infrastruktur Sintetis", now);
  conn.prepare("INSERT INTO rka_documents VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("rka_2026_demo", 2026, "org_pembangunan", "satker_infra", 0, "submitted", now, now);
  conn.prepare("INSERT INTO rka_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("item_demo_high", "rka_2026_demo", "521211", "Program Infrastruktur Sintetis", "Pemeliharaan", "Pengadaan perangkat survei sintetis", 10, "unit", 25000000, 250000000, "pending", now, now);
  conn.prepare("INSERT INTO price_references VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("price_demo", 2026, "Perangkat survei sintetis", "unit", 18000000, "Referensi pasar sintetis", 1, now);
  conn.prepare("INSERT INTO risk_assessments VALUES (?, ?, ?, ?, ?, ?, ?)").run("assessment_demo_high", "item_demo_high", 82, "high", "rules-v1", "sufficient", now);
  conn.prepare("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?, ?)").run("audit_seed", "usr_admin", "seed.created", "dataset", "demo", "Dataset demo sintetis diinisialisasi.", now);
}
