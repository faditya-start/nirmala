/** Membuat (atau mereset) akun admin produksi tanpa seed demo. Dipakai `scripts/create-admin.ts`. */
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { users } from "../db/schema.js";
import { hashPassword } from "../lib/security.js";
import { recordAudit } from "../repositories/audit.js";
import { createUser } from "../repositories/users.js";

export const MIN_ADMIN_PASSWORD_LENGTH = 12;

/** `created`: akun baru; `updated`: akun sudah ada, kata sandi diganti, peran dipastikan admin dan akun diaktifkan. Audit atas nama Sistem. */
export async function ensureAdmin(database: Database, input: { username: string; displayName: string; password: string }): Promise<"created" | "updated"> {
  const { db } = database;
  if (input.password.length < MIN_ADMIN_PASSWORD_LENGTH) throw new Error(`Kata sandi minimal ${MIN_ADMIN_PASSWORD_LENGTH} karakter.`);
  if (input.username.trim().length < 3) throw new Error("Username minimal 3 karakter.");
  const passwordHash = await hashPassword(input.password);
  return database.transaction(async () => {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1);
    if (existing) {
      await db.update(users).set({ passwordHash, role: "admin", active: true, displayName: input.displayName }).where(eq(users.id, existing.id));
      await recordAudit(db, { actorId: null, action: "user.updated", entityType: "user", entityId: existing.id, detail: `Akun admin ${input.username} direset lewat skrip create-admin.`, after: { role: "admin", passwordChanged: true } });
      return "updated" as const;
    }
    const id = await createUser(db, { username: input.username, displayName: input.displayName, role: "admin", passwordHash, unitLabel: null });
    await recordAudit(db, { actorId: null, action: "user.created", entityType: "user", entityId: id, detail: `Akun admin ${input.username} dibuat lewat skrip create-admin.`, after: { role: "admin" } });
    return "created" as const;
  });
}
