import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Role, SessionUser } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { findSessionUser } from "../repositories/users.js";

export const SESSION_COOKIE = "nirmala_session";
export const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

export type AppEnv = { Variables: { user: SessionUser | null; orgScope: string[] | null } };

export function createSessionSigner(secret: string) {
  const sign = (value: string) => createHmac("sha256", secret).update(value).digest("base64url");
  return {
    encode: (sessionId: string) => `${sessionId}.${sign(sessionId)}`,
    verify(value?: string) {
      if (!value) return null;
      const [sessionId, signature] = value.split(".");
      if (!sessionId || !signature) return null;
      const expected = sign(sessionId);
      return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? sessionId : null;
    }
  };
}
export type SessionSigner = ReturnType<typeof createSessionSigner>;

/** Membaca cookie sesi dan mengisi `c.var.user` (null jika tidak ada / kedaluwarsa). */
export function loadUser(db: Db, signer: SessionSigner): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const sessionId = signer.verify(getCookie(context, SESSION_COOKIE));
    context.set("user", sessionId ? (await findSessionUser(db, sessionId, Date.now())) ?? null : null);
    await next();
  };
}

/** 401 jika belum masuk, 403 jika peran tidak termasuk `roles` (kosong = semua peran). */
export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const user = context.get("user");
    if (!user) return context.json({ error: "Silakan masuk untuk melanjutkan." }, 401);
    if (roles.length && !roles.includes(user.role)) return context.json({ error: "Peran Anda tidak memiliki akses ke sumber daya ini." }, 403);
    await next();
  };
}

export function setSessionCookie(context: Context, value: string, secure: boolean) {
  setCookie(context, SESSION_COOKIE, value, { httpOnly: true, sameSite: "Lax", secure, path: "/", maxAge: SESSION_LIFETIME_MS / 1000 });
}

export function clearSessionCookie(context: Context) {
  deleteCookie(context, SESSION_COOKIE, { path: "/" });
}
