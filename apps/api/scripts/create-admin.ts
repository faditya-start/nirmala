/**
 * Membuat atau mereset akun admin produksi (tanpa seed demo). Kata sandi dari variabel lingkungan, bukan argumen
 * (supaya tidak tersimpan di riwayat shell):
 *
 *   ADMIN_PASSWORD='...' npm run create-admin -w @nirmala/api -- <username> "<Nama tampilan>"
 */
import "dotenv/config";
import { getDatabase } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import { ensureAdmin } from "../src/services/bootstrapAdmin.js";

const [username, displayName] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD;
if (!username || !displayName || !password) {
  console.error('Pemakaian: ADMIN_PASSWORD=\'...\' npm run create-admin -w @nirmala/api -- <username> "<Nama tampilan>"');
  process.exit(1);
}
const database = getDatabase();
migrate(database);
try {
  const result = await ensureAdmin(database, { username, displayName, password });
  console.log(result === "created" ? `Admin ${username} dibuat.` : `Admin ${username} sudah ada: kata sandi diganti dan akun diaktifkan.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
database.close();
