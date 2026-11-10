import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { getDatabase } from "./db/client.js";
import { migrate } from "./db/migrate.js";

const production = process.env.NODE_ENV === "production";
if (production && !process.env.SESSION_SECRET) throw new Error("SESSION_SECRET wajib diisi di produksi.");

const port = Number(process.env.API_PORT ?? 8787);
const database = getDatabase();
migrate(database);

const app = createApp({
  database,
  sessionSecret: process.env.SESSION_SECRET ?? "development-only-change-this-secret",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  secureCookies: production
});

serve({ fetch: app.fetch, port });
console.log(`NIRMALA API berjalan di http://localhost:${port}`);
