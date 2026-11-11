/**
 * Menyajikan hasil build web (`apps/web/dist`) dari proses API yang sama (produksi, satu proses).
 * - berkas statis dengan Content-Type benar; `/assets/*` (nama berhash Vite) di-cache lama, selain itu `no-cache` + ETag;
 * - rute non-`/api` tanpa berkas (rute SPA) -> `index.html`; berkas beraksen yang tidak ada -> 404 (bukan HTML);
 * - tidak pernah menyentuh `/api/*` dan tidak keluar dari folder dist (path traversal ditolak).
 */
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { MiddlewareHandler } from "hono";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".map": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json"
};

/** Kebijakan keamanan konten untuk SPA yang disajikan sendiri (tanpa skrip inline). */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data:", "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"
].join("; ");

async function fileInfo(path: string) {
  try {
    const info = await stat(path);
    return info.isFile() ? info : null;
  } catch { return null; }
}

export function serveWebApp(distDir: string): MiddlewareHandler {
  const root = resolve(distDir);
  return async (context, next) => {
    const method = context.req.method;
    const path = context.req.path;
    if ((method !== "GET" && method !== "HEAD") || path === "/api" || path.startsWith("/api/")) return next();

    let relative: string;
    try { relative = normalize(decodeURIComponent(path)); } catch { return context.text("Permintaan tidak valid.", 400); }
    const target = resolve(join(root, relative));
    if (target !== root && !target.startsWith(root + sep)) return context.text("Permintaan tidak valid.", 400);

    let file = target === root ? null : await fileInfo(target);
    let filePath = target;
    if (!file) {
      if (extname(path)) return context.text("Berkas tidak ditemukan.", 404);
      filePath = join(root, "index.html"); // rute SPA
      file = await fileInfo(filePath);
      if (!file) return context.text("Aplikasi web belum dibangun (apps/web/dist tidak ada).", 404);
    }

    const type = TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
    const immutable = path.startsWith("/assets/") && filePath === target;
    const etag = `W/"${file.size}-${Math.floor(file.mtimeMs)}"`;
    const headers = new Headers({ "Content-Type": type, "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache", ETag: etag, "Content-Length": String(file.size) });
    if (context.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": headers.get("Cache-Control")! } });
    return new Response(method === "HEAD" ? null : await readFile(filePath), { status: 200, headers });
  };
}
