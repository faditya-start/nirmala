import type { MiddlewareHandler } from "hono";
import { GLOBAL_SCOPE_ROLES } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { scopeIdsForUser } from "../repositories/users.js";
import type { AppEnv } from "./auth.js";

/**
 * Mengisi `c.var.orgScope`: `null` = semua eselon I (Pimpinan, Admin);
 * selain itu daftar id eselon I dari `user_scopes`. Jalankan setelah `loadUser`.
 */
export function loadScope(db: Db): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const user = context.get("user");
    if (!user) context.set("orgScope", []);
    else context.set("orgScope", GLOBAL_SCOPE_ROLES.includes(user.role) ? null : await scopeIdsForUser(db, user.id));
    await next();
  };
}

export function canAccessOrganization(scope: string[] | null, organizationUnitId: string) {
  return scope === null || scope.includes(organizationUnitId);
}
