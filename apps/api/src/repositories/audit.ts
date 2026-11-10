import { count, desc, eq, like } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { auditLogs, users } from "../db/schema.js";
import { newId } from "../lib/security.js";

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
  before?: unknown;
  after?: unknown;
}

export async function recordAudit(db: Db, entry: AuditEntry) {
  await db.insert(auditLogs).values({
    id: newId("audit"),
    actorUserId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    detail: entry.detail,
    before: entry.before ?? null,
    after: entry.after ?? null,
    createdAt: Date.now()
  });
}

export async function listAudit(db: Db, options: { action?: string; page: number; pageSize: number }) {
  const where = options.action ? like(auditLogs.action, `%${options.action}%`) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(auditLogs).where(where);
  const logs = await db
    .select({
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      detail: auditLogs.detail,
      before: auditLogs.before,
      after: auditLogs.after,
      createdAt: auditLogs.createdAt,
      actor: users.displayName
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(options.pageSize)
    .offset((options.page - 1) * options.pageSize);
  return { logs: logs.map((log) => ({ ...log, actor: log.actor ?? "Sistem" })), total };
}
