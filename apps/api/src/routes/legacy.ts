import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";

/**
 * Endpoint prototipe yang belum diporting ke skema MVP. Mengembalikan 501 dengan pesan jelas
 * sampai fase penggantinya selesai (docs/plan.md).
 */
const pending: { prefix: string; phase: string }[] = [
  { prefix: "/api/chr", phase: "Fase 4 (CHR per eselon I)" },
  { prefix: "/api/tracker", phase: "Fase 5 (Smart Tracker)" },
  { prefix: "/api/dashboard", phase: "Fase 6 (Dashboard)" },
  { prefix: "/api/reports", phase: "Fase 6 (Laporan)" }
];

export function legacyRoutes() {
  const routes = new Hono<AppEnv>();
  for (const { prefix, phase } of pending) {
    routes.all(prefix, (context) => context.json({ error: `Endpoint ini sedang dirombak ke skema MVP dan belum tersedia (${phase}).` }, 501));
    routes.all(`${prefix}/*`, (context) => context.json({ error: `Endpoint ini sedang dirombak ke skema MVP dan belum tersedia (${phase}).` }, 501));
  }
  return routes;
}
