import { asc, eq, inArray } from "drizzle-orm";
import { GLOBAL_SCOPE_ROLES, type OrganizationUnitDto, type Role, type UserAdminDto } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { organizationUnits, sessions, userScopes, users } from "../db/schema.js";
import { newId } from "../lib/security.js";

export async function findUserByUsername(db: Db, username: string) {
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return user;
}

export async function findUserById(db: Db, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user;
}

const userColumns = { id: users.id, username: users.username, displayName: users.displayName, role: users.role, active: users.active, unitLabel: users.unitLabel, createdAt: users.createdAt };

/** Pengguna untuk S12c (`UserAdminDto`): termasuk eselon I di `user_scopes`. `userId` mengambil satu pengguna. */
export async function listUsers(db: Db, userId?: string): Promise<UserAdminDto[]> {
  const rows = await (userId ? db.select(userColumns).from(users).where(eq(users.id, userId)) : db.select(userColumns).from(users)).orderBy(asc(users.displayName), asc(users.id));
  if (rows.length === 0) return [];
  const scopeRows = await db.select({ userId: userScopes.userId, id: organizationUnits.id, code: organizationUnits.code, shortName: organizationUnits.shortName, name: organizationUnits.name })
    .from(userScopes).innerJoin(organizationUnits, eq(organizationUnits.id, userScopes.organizationUnitId))
    .where(userId ? eq(userScopes.userId, userId) : undefined).orderBy(asc(organizationUnits.code));
  const byUser = new Map<string, OrganizationUnitDto[]>();
  for (const row of scopeRows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), { id: row.id, code: row.code, shortName: row.shortName, name: row.name }]);
  return rows.map((row) => {
    const all = GLOBAL_SCOPE_ROLES.includes(row.role);
    const units = all ? [] : (byUser.get(row.id) ?? []);
    return { ...row, organizationUnitIds: units.map((unit) => unit.id), organizationUnits: units, allOrganizations: all };
  });
}

export async function createUser(db: Db, input: { username: string; displayName: string; role: Role; passwordHash: string; unitLabel?: string | null; id?: string }) {
  const id = input.id ?? newId("user");
  await db.insert(users).values({ id, username: input.username, displayName: input.displayName, role: input.role, passwordHash: input.passwordHash, unitLabel: input.unitLabel ?? null, createdAt: Date.now() });
  return id;
}

export async function setUserActive(db: Db, userId: string, active: boolean) {
  await db.update(users).set({ active }).where(eq(users.id, userId));
}

export async function deleteUserSessions(db: Db, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Id eselon I yang benar-benar ada (untuk validasi `organizationUnitIds`). */
export async function existingOrganizationIds(db: Db, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  return new Set((await db.select({ id: organizationUnits.id }).from(organizationUnits).where(inArray(organizationUnits.id, ids))).map((row) => row.id));
}

export async function updateUserProfile(db: Db, userId: string, patch: { displayName: string; passwordHash?: string; unitLabel?: string | null }) {
  await db.update(users).set(patch).where(eq(users.id, userId));
}

export async function updateUserRole(db: Db, userId: string, role: Role) {
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function setUserScopes(db: Db, userId: string, organizationUnitIds: string[]) {
  await db.delete(userScopes).where(eq(userScopes.userId, userId));
  if (organizationUnitIds.length) await db.insert(userScopes).values(organizationUnitIds.map((organizationUnitId) => ({ userId, organizationUnitId })));
}

export async function scopeIdsForUser(db: Db, userId: string) {
  const rows = await db.select({ id: userScopes.organizationUnitId }).from(userScopes).where(eq(userScopes.userId, userId));
  return rows.map((row) => row.id);
}

export async function createSession(db: Db, userId: string, lifetimeMs: number) {
  const id = newId("session");
  const now = Date.now();
  await db.insert(sessions).values({ id, userId, expiresAt: now + lifetimeMs, createdAt: now });
  return id;
}

export async function deleteSession(db: Db, sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function findSessionUser(db: Db, sessionId: string, now: number) {
  const [row] = await db
    .select({ id: users.id, name: users.displayName, role: users.role, active: users.active, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return row && row.active && row.expiresAt > now ? { id: row.id, name: row.name, role: row.role } : undefined;
}
