/**
 * Halaman publik (P2, docs/api-contract.md §6.3). Tanpa sesi dan tanpa cookie; HANYA membaca `public_metrics`
 * (+ `review_cycles` untuk daftar siklus). Batas laju per IP dan cache publik 5 menit.
 */
import { Hono } from "hono";
import { publicTransparencyQuerySchema } from "@nirmala/shared";
import type { Database } from "../db/client.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { buildPublicTransparency, listPublicCycles } from "../services/publicMetrics.js";

export interface PublicOptions {
  minNotes: number;
  synthetic: boolean;
  /** Permintaan per menit per IP. */
  ratePerMinute: number;
}

const CACHE_CONTROL = "public, max-age=300";

export function publicRoutes({ db }: Database, options: PublicOptions) {
  const routes = new Hono();
  routes.use("*", rateLimit({ limit: options.ratePerMinute, windowMs: 60_000 }));
  routes.use("*", async (context, next) => {
    await next();
    context.res.headers.delete("set-cookie");
    context.header("Cache-Control", context.res.status === 200 ? CACHE_CONTROL : "no-store");
  });

  routes.get("/cycles", async (context) => context.json(await listPublicCycles(db)));

  routes.get("/transparency", async (context) => {
    const parsed = publicTransparencyQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Parameter tidak valid." }, 400);
    const result = await buildPublicTransparency(db, parsed.data.cycleId, options.minNotes, options.synthetic);
    return result ? context.json(result) : context.json({ error: "Siklus tidak ditemukan." }, 404);
  });

  return routes;
}
