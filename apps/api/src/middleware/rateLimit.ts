import type { MiddlewareHandler } from "hono";

/**
 * Pembatas laju sederhana di memori (jendela tetap per IP). IP dari `CF-Connecting-IP` (Cloudflare Tunnel),
 * lalu `X-Forwarded-For`; tanpa header, semua permintaan dianggap satu klien.
 */
export function rateLimit({ limit, windowMs }: { limit: number; windowMs: number }): MiddlewareHandler {
  const hits = new Map<string, { windowStart: number; count: number }>();
  return async (context, next) => {
    const now = Date.now();
    const key = context.req.header("cf-connecting-ip") ?? context.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (hits.size > 5000) for (const [entryKey, entry] of hits) if (now - entry.windowStart >= windowMs) hits.delete(entryKey);
    const entry = hits.get(key);
    if (!entry || now - entry.windowStart >= windowMs) hits.set(key, { windowStart: now, count: 1 });
    else if (++entry.count > limit) {
      context.header("Retry-After", String(Math.max(1, Math.ceil((entry.windowStart + windowMs - now) / 1000))));
      return context.json({ error: "Terlalu banyak permintaan. Coba lagi sebentar lagi." }, 429);
    }
    await next();
  };
}
