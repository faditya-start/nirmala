import { Hono } from "hono";
import { cors } from "hono/cors";
import type { HealthResponse } from "@nirmala/shared";
import type { Database } from "./db/client.js";
import { createSessionSigner, loadUser, type AppEnv } from "./middleware/auth.js";
import { loadScope } from "./middleware/scope.js";
import { JobRegistry } from "./jobs/registry.js";
import { adminRoutes } from "./routes/admin.js";
import { auditLogRoutes } from "./routes/auditLogs.js";
import { authRoutes } from "./routes/auth.js";
import { chrRoutes } from "./routes/chr.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { publicRoutes } from "./routes/public.js";
import { reportRoutes } from "./routes/reports.js";
import { cycleRoutes } from "./routes/cycles.js";
import { jobRoutes } from "./routes/jobs.js";
import { organizationUnitRoutes } from "./routes/organizationUnits.js";
import { satkerRoutes } from "./routes/satker.js";
import { shellRoutes } from "./routes/shell.js";
import { snapshotRoutes } from "./routes/snapshots.js";
import { trackerRoutes } from "./routes/tracker.js";
import { triageRoutes } from "./routes/triage.js";
import { userRoutes } from "./routes/users.js";
import { importHooks } from "./services/importHooks.js";
import type { IngestHooks } from "./ingest/ingestService.js";
import { CONTENT_SECURITY_POLICY, serveWebApp } from "./staticFiles.js";
import { PUBLIC_MIN_NOTES_DEFAULT } from "@nirmala/shared";
import { printConfigFromEnv, type PrintConfig } from "./services/chrService.js";

export interface AppOptions {
  database: Database;
  sessionSecret: string;
  webOrigin?: string;
  secureCookies?: boolean;
  /** Registri job asinkron (default: baru per aplikasi). */
  jobs?: JobRegistry;
  /** Hook impor (default: deteksi aturan + skor Fase 3, lalu cek tindak lanjut Fase 5). */
  hooks?: IngestHooks;
  /** Kop dan penandatangan cetak CHR (default: variabel lingkungan `PRINT_*`). */
  print?: PrintConfig;
  /** Folder hasil build web yang disajikan dari proses ini (produksi satu proses). Kosong = hanya API. */
  webDist?: string | null;
  /** Ambang penggabungan eselon I di agregat publik (default `PUBLIC_MIN_NOTES`, lalu 5). */
  publicMinNotes?: number;
  /** Menandai data publik sebagai sintetis (default `PUBLIC_DATA_SYNTHETIC=true`). */
  publicSynthetic?: boolean;
  /** Batas permintaan per menit per IP untuk `/api/public/*` (default 60). */
  publicRatePerMinute?: number;
}

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function createApp({ database, sessionSecret, webOrigin = "http://localhost:5173", secureCookies = false, jobs = new JobRegistry(), hooks = importHooks(), print = printConfigFromEnv(), webDist = null, publicMinNotes = positiveInt(process.env.PUBLIC_MIN_NOTES, PUBLIC_MIN_NOTES_DEFAULT), publicSynthetic = process.env.PUBLIC_DATA_SYNTHETIC === "true", publicRatePerMinute = 60 }: AppOptions) {
  const signer = createSessionSigner(sessionSecret);
  const app = new Hono<AppEnv>();

  app.use("*", cors({ origin: webOrigin, credentials: true }));
  app.use("*", async (context, next) => {
    await next();
    context.header("X-Content-Type-Options", "nosniff");
    context.header("X-Frame-Options", "DENY");
    context.header("Referrer-Policy", "same-origin");
    context.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    context.header("Cross-Origin-Opener-Policy", "same-origin");
    if (secureCookies) context.header("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    if (!context.req.path.startsWith("/api/")) context.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    // Respons API bersifat privat; rute publik menetapkan Cache-Control sendiri.
    if (context.req.path.startsWith("/api/") && !context.res.headers.has("Cache-Control")) context.header("Cache-Control", "no-store");
  });
  app.use("/api/*", loadUser(database.db, signer));
  app.use("/api/*", loadScope(database.db));

  app.get("/api/health", (context) => context.json({ status: "ok", service: "nirmala-api", timestamp: new Date().toISOString() } satisfies HealthResponse));
  app.route("/api/auth", authRoutes(database.db, signer, secureCookies));
  app.route("/api/users", userRoutes(database));
  app.route("/api/organization-units", organizationUnitRoutes(database));
  app.route("/api/cycles", cycleRoutes(database, { minNotes: publicMinNotes }));
  app.route("/api/cycles", snapshotRoutes(database, jobs, hooks));
  app.route("/api/jobs", jobRoutes(jobs));
  app.route("/api/triage", triageRoutes(database));
  app.route("/api/chr", chrRoutes(database, print));
  app.route("/api/tracker", trackerRoutes(database));
  app.route("/api/satker", satkerRoutes(database));
  app.route("/api/admin", adminRoutes(database, jobs));
  app.route("/api", shellRoutes(database));
  app.route("/api/audit-logs", auditLogRoutes(database));
  app.route("/api/dashboard", dashboardRoutes(database));
  app.route("/api/reports", reportRoutes(database));
  app.route("/api/public", publicRoutes(database, { minNotes: publicMinNotes, synthetic: publicSynthetic, ratePerMinute: publicRatePerMinute }));

  if (webDist) app.use("*", serveWebApp(webDist));
  app.notFound((context) => (context.req.path === "/api" || context.req.path.startsWith("/api/") ? context.json({ error: "Endpoint tidak ditemukan." }, 404) : context.text("Tidak ditemukan.", 404)));
  return app;
}
