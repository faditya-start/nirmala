/** Pengguna dan akses eselon I (S12c, docs/api-contract.md §6.4). Semua endpoint hanya untuk admin. */
import { Hono } from "hono";
import { createUserBodySchema, ROLES, setUserActiveBodySchema, setUserScopesBodySchema, updateUserBodySchema } from "@nirmala/shared";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { hashPassword } from "../lib/security.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { recordAudit } from "../repositories/audit.js";
import {
  createUser, deleteUserSessions, existingOrganizationIds, findUserById, findUserByUsername, listUsers, scopeIdsForUser, setUserActive, setUserScopes, updateUserProfile, updateUserRole
} from "../repositories/users.js";

const roleSchema = z.object({ role: z.enum(ROLES) });
const UNKNOWN_ORG = "Eselon I tidak ditemukan.";

export function userRoutes({ db, transaction }: Database) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireRole("admin"));

  const userResponse = async (userId: string) => ({ user: (await listUsers(db, userId))[0] });

  routes.get("/", async (context) => context.json({ users: await listUsers(db) }));

  routes.post("/", async (context) => {
    const actor = context.get("user")!;
    const parsed = createUserBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data user tidak valid." }, 400);
    const body = parsed.data;
    const organizationUnitIds = [...new Set(body.organizationUnitIds)];
    if ((await existingOrganizationIds(db, organizationUnitIds)).size !== organizationUnitIds.length) return context.json({ error: UNKNOWN_ORG }, 400);
    if (await findUserByUsername(db, body.username)) return context.json({ error: "Username sudah digunakan." }, 409);
    const passwordHash = await hashPassword(body.password);
    const id = await transaction(async () => {
      const userId = await createUser(db, { username: body.username, displayName: body.displayName, role: body.role, passwordHash, unitLabel: body.unitLabel ?? null });
      await setUserScopes(db, userId, organizationUnitIds);
      await recordAudit(db, { actorId: actor.id, action: "user.created", entityType: "user", entityId: userId, detail: `User ${body.username} dibuat.`, after: { role: body.role, organizationUnitIds } });
      return userId;
    });
    return context.json({ id }, 201);
  });

  routes.put("/:id", async (context) => {
    const actor = context.get("user")!;
    const parsed = updateUserBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data user tidak valid." }, 400);
    const userId = context.req.param("id");
    if (!(await findUserById(db, userId))) return context.json({ error: "User tidak ditemukan." }, 404);
    const passwordHash = parsed.data.password ? await hashPassword(parsed.data.password) : undefined;
    await transaction(async () => {
      await updateUserProfile(db, userId, { displayName: parsed.data.displayName, ...(passwordHash ? { passwordHash } : {}), ...(parsed.data.unitLabel !== undefined ? { unitLabel: parsed.data.unitLabel } : {}) });
      await recordAudit(db, { actorId: actor.id, action: "user.updated", entityType: "user", entityId: userId, detail: "Profil user diperbarui.", after: { passwordChanged: Boolean(passwordHash) } });
    });
    return context.json({ id: userId, displayName: parsed.data.displayName });
  });

  routes.put("/:id/role", async (context) => {
    const actor = context.get("user")!;
    const parsed = roleSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: "Role tidak valid." }, 400);
    const userId = context.req.param("id");
    const target = await findUserById(db, userId);
    if (!target) return context.json({ error: "User tidak ditemukan." }, 404);
    if (target.id === actor.id && parsed.data.role !== "admin") return context.json({ error: "Admin tidak dapat menurunkan role dirinya sendiri." }, 409);
    await transaction(async () => {
      await updateUserRole(db, userId, parsed.data.role);
      await recordAudit(db, { actorId: actor.id, action: "user.role_changed", entityType: "user", entityId: userId, detail: `Role ${target.role} -> ${parsed.data.role}.`, before: { role: target.role }, after: { role: parsed.data.role } });
    });
    return context.json({ id: userId, role: parsed.data.role });
  });

  routes.put("/:id/scopes", async (context) => {
    const actor = context.get("user")!;
    const parsed = setUserScopesBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data akses tidak valid." }, 400);
    const userId = context.req.param("id");
    const target = await findUserById(db, userId);
    if (!target) return context.json({ error: "User tidak ditemukan." }, 404);
    const organizationUnitIds = [...new Set(parsed.data.organizationUnitIds)];
    if ((await existingOrganizationIds(db, organizationUnitIds)).size !== organizationUnitIds.length) return context.json({ error: UNKNOWN_ORG }, 400);
    await transaction(async () => {
      const before = (await scopeIdsForUser(db, userId)).sort();
      await setUserScopes(db, userId, organizationUnitIds);
      await recordAudit(db, { actorId: actor.id, action: "user.scopes_changed", entityType: "user", entityId: userId, detail: `Akses eselon I ${target.username} diubah (${before.length} -> ${organizationUnitIds.length}).`, before: { organizationUnitIds: before }, after: { organizationUnitIds: [...organizationUnitIds].sort() } });
    });
    return context.json(await userResponse(userId));
  });

  routes.put("/:id/active", async (context) => {
    const actor = context.get("user")!;
    const parsed = setUserActiveBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: "Status aktif tidak valid." }, 400);
    const userId = context.req.param("id");
    const target = await findUserById(db, userId);
    if (!target) return context.json({ error: "User tidak ditemukan." }, 404);
    if (target.id === actor.id && !parsed.data.active) return context.json({ error: "Admin tidak dapat menonaktifkan dirinya sendiri." }, 409);
    if (target.active !== parsed.data.active) {
      await transaction(async () => {
        await setUserActive(db, userId, parsed.data.active);
        if (!parsed.data.active) await deleteUserSessions(db, userId);
        await recordAudit(db, { actorId: actor.id, action: parsed.data.active ? "user.activated" : "user.deactivated", entityType: "user", entityId: userId, detail: `User ${target.username} ${parsed.data.active ? "diaktifkan" : "dinonaktifkan"}.`, before: { active: target.active }, after: { active: parsed.data.active } });
      });
    }
    return context.json(await userResponse(userId));
  });

  return routes;
}
