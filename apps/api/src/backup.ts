/** Cadangan harian berkas SQLite dengan retensi N hari (docs/deploy.md). */
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { backupDatabase } from "./db/client.js";

const BACKUP_PATTERN = /^nirmala-\d{8}-\d{6}\.sqlite$/;
const DAY_MS = 86_400_000;

export interface BackupOptions {
  databasePath: string;
  directory: string;
  /** Cadangan yang lebih tua dari sekian hari dihapus (default 14). */
  keepDays?: number;
  now?: Date;
}

export interface BackupResult { file: string; removed: string[] }

const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

/** Membuat `nirmala-YYYYMMDD-HHMMSS.sqlite` (UTC) lalu menghapus cadangan yang kedaluwarsa. Hanya berkas yang namanya cocok pola yang disentuh. */
export function createBackup({ databasePath, directory, keepDays = 14, now = new Date() }: BackupOptions): BackupResult {
  if (databasePath === ":memory:") throw new Error("Database :memory: tidak dapat dicadangkan.");
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `nirmala-${stamp(now)}.sqlite`);
  backupDatabase(databasePath, file);
  return { file, removed: pruneBackups(directory, keepDays, now) };
}

export function pruneBackups(directory: string, keepDays: number, now = new Date()): string[] {
  const removed: string[] = [];
  for (const name of readdirSync(directory)) {
    if (!BACKUP_PATTERN.test(name)) continue;
    const path = join(directory, name);
    if (now.getTime() - statSync(path).mtimeMs > keepDays * DAY_MS) { unlinkSync(path); removed.push(name); }
  }
  return removed;
}
