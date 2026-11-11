import { Hono } from "hono";
import type { JobRegistry } from "../jobs/registry.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";

/** `GET /api/jobs/:jobId`: status job asinkron (impor, hitung ulang). Hanya pembuat job atau admin. */
export function jobRoutes(jobs: JobRegistry) {
  const routes = new Hono<AppEnv>();
  routes.get("/:jobId", requireRole(), (context) => {
    const user = context.get("user")!;
    const job = jobs.get(context.req.param("jobId"));
    if (!job) return context.json({ error: "Job tidak ditemukan atau sudah kedaluwarsa." }, 404);
    if (job.ownerUserId !== user.id && user.role !== "admin") return context.json({ error: "Peran Anda tidak memiliki akses ke sumber daya ini." }, 403);
    return context.json(jobs.toDto(job));
  });
  return routes;
}
