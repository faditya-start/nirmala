import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { HealthResponse, SessionUser } from "@nirmala/shared";

const port = Number(process.env.API_PORT ?? 8787);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

const app = new Hono();

app.use("*", cors({ origin: webOrigin, credentials: true }));

app.get("/api/health", (context) => {
  const response: HealthResponse = {
    status: "ok",
    service: "nirmala-api",
    timestamp: new Date().toISOString()
  };
  return context.json(response);
});

app.get("/api/auth/me", (context) => {
  const user: SessionUser | null = null;
  return context.json({ user });
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

app.post("/api/auth/login", async (context) => {
  const parsed = loginSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    return context.json({ error: "Username dan password wajib diisi." }, 400);
  }

  return context.json(
    {
      error:
        "Autentikasi belum diaktifkan pada fase fondasi. Endpoint ini sudah disiapkan untuk cookie session."
    },
    501
  );
});

app.notFound((context) => context.json({ error: "Endpoint tidak ditemukan." }, 404));

serve({ fetch: app.fetch, port });
console.log(`NIRMALA API listening on http://localhost:${port}`);
