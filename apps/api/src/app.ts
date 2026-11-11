import { Hono } from "hono";
import { cors } from "hono/cors";
import type { HealthResponse } from "@nirmala/shared";
import type { Database } from "./db/client.js";
import { createSessionSigner, loadUser, type AppEnv } from "./middleware/auth.js";
import { loadScope } from "./middleware/scope.js";
import { publicTransparency } from "./publicData.js";
import { JobRegistry } from "./jobs/registry.js";
import { adminRoutes } from "./routes/admin.js";
import { auditLogRoutes } from "./routes/auditLogs.js";
import { authRoutes } from "./routes/auth.js";
import { cycleRoutes } from "./routes/cycles.js";
import { jobRoutes } from "./routes/jobs.js";
import { legacyRoutes } from "./routes/legacy.js";
import { organizationUnitRoutes } from "./routes/organizationUnits.js";
import { shellRoutes } from "./routes/shell.js";
import { snapshotRoutes } from "./routes/snapshots.js";
import { triageRoutes } from "./routes/triage.js";
import { userRoutes } from "./routes/users.js";
import { detectionHooks } from "./services/detectionPipeline.js";
import type { IngestHooks } from "./ingest/ingestService.js";

export interface AppOptions {
  database: Database;
  sessionSecret: string;
  webOrigin?: string;
  secureCookies?: boolean;
  /** Registri job asinkron (default: baru per aplikasi). */
  jobs?: JobRegistry;
  /** Hook impor (default: deteksi aturan + skor Fase 3). */
  hooks?: IngestHooks;
}

export function createApp({ database, sessionSecret, webOrigin = "http://localhost:5173", secureCookies = false, jobs = new JobRegistry(), hooks = detectionHooks() }: AppOptions) {
  const signer = createSessionSigner(sessionSecret);
  const app = new Hono<AppEnv>();

  app.use("*", cors({ origin: webOrigin, credentials: true }));
  app.use("*", async (context, next) => {
    await next();
    context.header("X-Content-Type-Options", "nosniff");
    context.header("X-Frame-Options", "DENY");
    context.header("Referrer-Policy", "same-origin");
  });
  app.use("/api/*", loadUser(database.db, signer));
  app.use("/api/*", loadScope(database.db));

  app.get("/api/health", (context) => context.json({ status: "ok", service: "nirmala-api", timestamp: new Date().toISOString() } satisfies HealthResponse));
  app.route("/api/auth", authRoutes(database.db, signer, secureCookies));
  app.route("/api/users", userRoutes(database));
  app.route("/api/organization-units", organizationUnitRoutes(database));
  app.route("/api/cycles", cycleRoutes(database));
  app.route("/api/cycles", snapshotRoutes(database, jobs, hooks));
  app.route("/api/jobs", jobRoutes(jobs));
  app.route("/api/triage", triageRoutes(database));
  app.route("/api/admin", adminRoutes(database, jobs));
  app.route("/api", shellRoutes(database));
  app.route("/api/audit-logs", auditLogRoutes(database));

  // Halaman publik masih memakai konstanta sintetis sampai Fase 6 (public_metrics).
  app.get("/api/public/transparency/summary", (context) => context.json({ synthetic: publicTransparency.synthetic, disclaimer: publicTransparency.disclaimer, summary: publicTransparency.summary }));
  app.get("/api/public/transparency/trends", (context) => context.json({ synthetic: publicTransparency.synthetic, disclaimer: publicTransparency.disclaimer, trends: publicTransparency.trends }));

  app.route("/", legacyRoutes());
  return app;
}
