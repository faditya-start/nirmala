import { Hono } from "hono";
import { z } from "zod";
import { ROLES } from "@nirmala/shared";
import type { Database } from "../db/client.js";
import { hashPassword } from "../lib/security.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { recordAudit } from "../repositories/audit.js";
import { createUser, findUserById, findUserByUsername, listUsers, updateUserProfile, updateUserRole } from "../repositories/users.js";

const createSchema = z.object({ username: z.string().trim().min(3).max(100), displayName: z.string().trim().min(2).max(150), role: z.enum(ROLES), password: z.string().min(12).max(200) });
const profileSchema = z.object({ displayName: z.string().trim().min(2).max(150), password: z.string().min(12).max(200).optional() });
const roleSchema = z.object({ role: z.enum(ROLES) });

export function userRoutes({ db }: Database) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireRole("admin"));

  routes.get("/", async (context) => context.json({ users: await listUsers(db) }));

  routes.post("/", async (context) => {
    const actor = context.get("user")!;
    const parsed = createSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data user tidak valid." }, 400);
    if (await findUserByUsername(db, parsed.data.username)) return context.json({ error: "Username sudah digunakan." }, 409);
    const id = await createUser(db, { username: parsed.data.username, displayName: parsed.data.displayName, role: parsed.data.role, passwordHash: await hashPassword(parsed.data.password) });
    await recordAudit(db, { actorId: actor.id, action: "user.created", entityType: "user", entityId: id, detail: `User ${parsed.data.username} dibuat.` });
    return context.json({ id }, 201);
  });

  routes.put("/:id", async (context) => {
    const actor = context.get("user")!;
    const parsed = profileSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data user tidak valid." }, 400);
    const userId = context.req.param("id");
    if (!(await findUserById(db, userId))) return context.json({ error: "User tidak ditemukan." }, 404);
    await updateUserProfile(db, userId, { displayName: parsed.data.displayName, ...(parsed.data.password ? { passwordHash: await hashPassword(parsed.data.password) } : {}) });
    await recordAudit(db, { actorId: actor.id, action: "user.updated", entityType: "user", entityId: userId, detail: "Profil user diperbarui." });
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
    await updateUserRole(db, userId, parsed.data.role);
    await recordAudit(db, { actorId: actor.id, action: "user.role_changed", entityType: "user", entityId: userId, detail: `Role ${target.role} -> ${parsed.data.role}.`, before: { role: target.role }, after: { role: parsed.data.role } });
    return context.json({ id: userId, role: parsed.data.role });
  });

  return routes;
}
