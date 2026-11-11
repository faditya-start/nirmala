/**
 * Menyiapkan database produksi: migrasi + master data nyata (akun BAS, alasan dismiss, katalog aturan, bobot skor).
 * TANPA eselon I fiktif dan TANPA akun demo (kata sandi demo publik di repo). Idempoten.
 * Lanjutkan dengan `create-admin` lalu `import:private -- --production` (docs/deploy.md).
 */
import "dotenv/config";
import { getDatabase } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import { seedMasterData } from "../src/db/seed.js";

const database = getDatabase();
const applied = migrate(database);
await seedMasterData(database, { demo: false });
console.log(`Database produksi siap${applied.length ? ` (migrasi diterapkan: ${applied.length})` : ""}. Buat admin dengan: npm run create-admin -w @nirmala/api -- <username> "<Nama>".`);
database.close();
