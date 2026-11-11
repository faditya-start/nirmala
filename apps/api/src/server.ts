import "dotenv/config";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { getDatabase } from "./db/client.js";
import { migrate } from "./db/migrate.js";

const production = process.env.NODE_ENV === "production";
if (production && !process.env.SESSION_SECRET) throw new Error("SESSION_SECRET wajib diisi di produksi.");

const port = Number(process.env.API_PORT ?? 8787);
const database = getDatabase();
migrate(database);

// Produksi: API menyajikan hasil build web (satu proses). Di pengembangan, Vite yang menyajikan web (kecuali WEB_DIST_DIR diisi).
const defaultDist = join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const webDist = process.env.WEB_DIST_DIR ? resolve(process.env.WEB_DIST_DIR) : production ? defaultDist : null;
if (webDist && !existsSync(join(webDist, "index.html"))) console.warn(`Peringatan: ${webDist}/index.html tidak ada. Jalankan \`npm run build\` agar web ikut disajikan.`);

const app = createApp({
  database,
  sessionSecret: process.env.SESSION_SECRET ?? "development-only-change-this-secret",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  secureCookies: production,
  webDist
});

serve({ fetch: app.fetch, port, hostname: process.env.API_HOST ?? (production ? "127.0.0.1" : undefined) });
console.log(`NIRMALA berjalan di http://${production ? "127.0.0.1" : "localhost"}:${port}${webDist ? " (web disajikan)" : ""}`);
