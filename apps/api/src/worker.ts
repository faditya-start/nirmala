import { Hono } from "hono";

type WorkerEnv = { DB: unknown; WEB_ORIGIN?: string };
const app = new Hono<{ Bindings: WorkerEnv }>();

app.get("/api/health", (context) => context.json({ status: "ok", service: "nirmala-api-worker", timestamp: new Date().toISOString() }));
app.all("*", (context) => context.json({ error: "Cloudflare Worker adapter belum diaktifkan untuk workflow Node.js lokal. Gunakan npm run dev sampai adapter D1 selesai." }, 501));

export default app;
