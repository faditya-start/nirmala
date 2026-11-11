/**
 * Cadangan berkas SQLite (online, aman saat API berjalan). Dijalankan harian oleh timer systemd (deploy/).
 * Variabel: DATABASE_PATH (default ./nirmala.sqlite), BACKUP_DIR (default ./backups), BACKUP_KEEP_DAYS (default 14).
 * Atau argumen: `npm run backup -w @nirmala/api -- --dir /var/backups/nirmala --keep 30`.
 */
import "dotenv/config";
import { createBackup } from "../src/backup.js";

const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const keepDays = Number(option("--keep") ?? process.env.BACKUP_KEEP_DAYS ?? 14);
if (!Number.isFinite(keepDays) || keepDays < 1) { console.error("--keep / BACKUP_KEEP_DAYS harus bilangan >= 1."); process.exit(1); }

const result = createBackup({ databasePath: process.env.DATABASE_PATH ?? "./nirmala.sqlite", directory: option("--dir") ?? process.env.BACKUP_DIR ?? "./backups", keepDays });
console.log(`Cadangan dibuat: ${result.file}${result.removed.length ? `; ${result.removed.length} cadangan lama dihapus` : ""}.`);
