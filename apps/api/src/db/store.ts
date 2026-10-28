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
CREATE TABLE IF NOT EXISTS reviewer_decisions (id TEXT PRIMARY KEY, rka_item_id TEXT NOT NULL UNIQUE REFERENCES rka_items(id), reviewer_user_id TEXT NOT NULL REFERENCES users(id), decision TEXT NOT NULL CHECK(decision IN ('confirmed','false_positive')), reason TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS reviewer_decisions_reviewer_idx ON reviewer_decisions(reviewer_user_id);
CREATE TABLE IF NOT EXISTS chr_documents (id TEXT PRIMARY KEY, rka_item_id TEXT NOT NULL UNIQUE REFERENCES rka_items(id), document_number TEXT UNIQUE, title TEXT NOT NULL, findings TEXT NOT NULL, recommendation TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','issued')), created_by_user_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, issued_at INTEGER);
CREATE INDEX IF NOT EXISTS chr_documents_status_idx ON chr_documents(status);
CREATE TABLE IF NOT EXISTS chr_versions (id TEXT PRIMARY KEY, chr_id TEXT NOT NULL REFERENCES chr_documents(id), version_number INTEGER NOT NULL, title TEXT NOT NULL, findings TEXT NOT NULL, recommendation TEXT NOT NULL, created_by_user_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, UNIQUE(chr_id, version_number));
CREATE TABLE IF NOT EXISTS follow_up_tasks (id TEXT PRIMARY KEY, chr_id TEXT NOT NULL UNIQUE REFERENCES chr_documents(id), status TEXT NOT NULL CHECK(status IN ('awaiting_revision','needs_follow_up','resolved','closed')), last_check_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, closed_at INTEGER);
CREATE INDEX IF NOT EXISTS follow_up_tasks_status_idx ON follow_up_tasks(status);
CREATE TABLE IF NOT EXISTS rka_revisions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES follow_up_tasks(id), revision_number INTEGER NOT NULL, proposed_unit_price INTEGER NOT NULL, note TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(task_id, revision_number));
CREATE TABLE IF NOT EXISTS tracker_checks (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES follow_up_tasks(id), revision_id TEXT NOT NULL REFERENCES rka_revisions(id), result TEXT NOT NULL CHECK(result IN ('compliant','not_compliant')), reason TEXT NOT NULL, checked_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS tracker_checks_task_idx ON tracker_checks(task_id);
CREATE TABLE IF NOT EXISTS integration_logs (id TEXT PRIMARY KEY, chr_id TEXT NOT NULL REFERENCES chr_documents(id), status TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS integration_logs_chr_idx ON integration_logs(chr_id);
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor_user_id TEXT REFERENCES users(id), action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS risk_config (id TEXT PRIMARY KEY, version TEXT NOT NULL, weights_json TEXT NOT NULL, thresholds_json TEXT NOT NULL, updated_by_user_id TEXT REFERENCES users(id), updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS historical_findings (id TEXT PRIMARY KEY, rka_item_id TEXT NOT NULL REFERENCES rka_items(id), finding_year INTEGER NOT NULL, category TEXT NOT NULL, summary TEXT NOT NULL, reference TEXT NOT NULL, similarity REAL, limitation TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS historical_findings_item_idx ON historical_findings(rka_item_id);
`;

export function db() { if (!database) { database = new DatabaseSync(databasePath); database.exec(schema); } return database; }
function ensureColumn(connection: Database, table: string, column: string, definition: string) {
  const columns = connection.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => entry.name === column)) connection.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
function ensureWorkflowColumns(connection: Database) {
  ensureColumn(connection, "rka_revisions", "proposed_description", "TEXT");
  ensureColumn(connection, "rka_revisions", "proposed_quantity", "REAL");
  ensureColumn(connection, "rka_revisions", "proposed_unit", "TEXT");
  ensureColumn(connection, "rka_revisions", "proposed_total_amount", "INTEGER");
  ensureColumn(connection, "integration_logs", "attempt", "INTEGER NOT NULL DEFAULT 1");
}
export function id(prefix: string) { return `${prefix}_${randomBytes(12).toString("hex")}`; }
export async function hashPassword(password: string) { const salt = randomBytes(16).toString("hex"); const derived = await scrypt(password, salt, 64) as Buffer; return `${salt}:${derived.toString("hex")}`; }
export async function verifyPassword(password: string, stored: string) { const [salt, expected] = stored.split(":"); if (!salt || !expected) return false; const derived = await scrypt(password, salt, 64) as Buffer; const expectedBuffer = Buffer.from(expected, "hex"); return expectedBuffer.length === derived.length && timingSafeEqual(expectedBuffer, derived); }

export async function seedDatabase() {
  const conn = db(); ensureWorkflowColumns(conn); const count = conn.prepare("SELECT COUNT(*) AS count FROM users").get()!.count as number; if (count) { await ensureExpandedDemoData(conn); return; }
  const now = Date.now();
  const accounts = [["usr_reviewer", "reviewer.demo", "Rani Reviewer", "reviewer", "Review123!"], ["usr_leader", "pimpinan.demo", "Pandu Pimpinan", "leader", "Pimpin123!"], ["usr_admin", "admin.demo", "Ayu Admin", "admin", "Admin123!"]] as const;
  for (const [userId, username, name, role, password] of accounts) conn.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)").run(userId, username, name, role, await hashPassword(password), now);
  conn.prepare("INSERT INTO organization_units VALUES (?, ?, ?, ?)").run("org_pembangunan", "ORG-01", "Organisasi Pembangunan Sintetis", now);
  conn.prepare("INSERT INTO work_units VALUES (?, ?, ?, ?, ?)").run("satker_infra", "org_pembangunan", "SAT-01", "Satuan Kerja Infrastruktur Sintetis", now);
  conn.prepare("INSERT INTO rka_documents VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("rka_2026_demo", 2026, "org_pembangunan", "satker_infra", 0, "submitted", now, now);
  conn.prepare("INSERT INTO rka_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("item_demo_high", "rka_2026_demo", "521211", "Program Infrastruktur Sintetis", "Pemeliharaan", "Pengadaan perangkat survei sintetis", 10, "unit", 25000000, 250000000, "pending", now, now);
  conn.prepare("INSERT INTO price_references VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("price_demo", 2026, "Perangkat survei sintetis", "unit", 18000000, "Referensi pasar sintetis", 1, now);
  conn.prepare("INSERT INTO risk_assessments VALUES (?, ?, ?, ?, ?, ?, ?)").run("assessment_demo_high", "item_demo_high", 82, "high", "rules-v1", "sufficient", now);
  conn.prepare("INSERT INTO risk_config VALUES (?, ?, ?, ?, ?, ?)").run("risk-config-default", "rules-v2", JSON.stringify({ price_variance: 35, bas_alignment: 25, historical_similarity: 20, description_quality: 10, revision_pattern: 10 }), JSON.stringify({ medium: 35, high: 70 }), "usr_admin", now);
  conn.prepare("INSERT INTO historical_findings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("finding_demo_high", "item_demo_high", 2024, "Kewajaran harga", "Nilai satuan berada di atas rentang pembanding sintetis.", "TEMUAN-SIM-2024-01", 72, "Kesetaraan spesifikasi belum diverifikasi.", now);
  conn.prepare("INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?, ?)").run("audit_seed", "usr_admin", "seed.created", "dataset", "demo", "Dataset demo sintetis diinisialisasi.", now);
  await ensureExpandedDemoData(conn);
}

async function ensureExpandedDemoData(conn: Database) {
  const now = Date.now();
  const rows = [
    ["item_demo_medium", 52, "medium", "Uraian kegiatan pelatihan teknis", "unit", 12000000, 11000000],
    ["item_demo_low", 18, "low", "Layanan pemeliharaan jaringan kantor", "paket", 5000000, 5000000],
    ["item_demo_incomplete", 44, "medium", "Jasa", "paket", 9000000, 6000000]
  ] as const;
  for (const [itemId, score, category, description, unit, unitPrice, referencePrice] of rows) {
    if (conn.prepare("SELECT id FROM rka_items WHERE id=?").get(itemId)) continue;
    const documentId = `${itemId}_doc`;
    conn.prepare("INSERT OR IGNORE INTO rka_documents VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(documentId, 2026, "org_pembangunan", "satker_infra", 0, "submitted", now, now);
    conn.prepare("INSERT INTO rka_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(itemId, documentId, "521211", "Program Demo Sintetis", "Kegiatan Demo", description, 1, unit, unitPrice, unitPrice, "pending", now, now);
    conn.prepare("INSERT INTO price_references VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(`${itemId}_price`, 2026, description, unit, referencePrice, "Referensi pasar sintetis", 1, now);
    conn.prepare("INSERT INTO risk_assessments VALUES (?, ?, ?, ?, ?, ?, ?)").run(`${itemId}_assessment`, itemId, score, category, "rules-v2", category === "medium" && itemId.endsWith("incomplete") ? "partial" : "sufficient", now);
  }
}
