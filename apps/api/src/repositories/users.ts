import { asc, eq } from "drizzle-orm";
import type { Role } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { sessions, userScopes, users } from "../db/schema.js";
import { newId } from "../lib/security.js";

export async function findUserByUsername(db: Db, username: string) {
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return user;
}

export async function findUserById(db: Db, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user;
}

export async function listUsers(db: Db) {
  return db.select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role, createdAt: users.createdAt }).from(users).orderBy(asc(users.displayName));
}

export async function createUser(db: Db, input: { username: string; displayName: string; role: Role; passwordHash: string; id?: string }) {
  const id = input.id ?? newId("user");
  await db.insert(users).values({ id, username: input.username, displayName: input.displayName, role: input.role, passwordHash: input.passwordHash, createdAt: Date.now() });
  return id;
}

export async function updateUserProfile(db: Db, userId: string, patch: { displayName: string; passwordHash?: string }) {
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
    .select({ id: users.id, name: users.displayName, role: users.role, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return row && row.expiresAt > now ? { id: row.id, name: row.name, role: row.role } : undefined;
}
