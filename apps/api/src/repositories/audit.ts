import { and, asc, count, desc, eq, gte, lte } from "drizzle-orm";
import type { AuditLogFacetsResponse } from "@nirmala/shared";
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

export interface AuditFilter {
  action?: string;
  entityType?: string;
  actorUserId?: string;
  from?: number;
  to?: number;
}

const DAY_MS = 86_400_000;

function auditWhere(filter: AuditFilter) {
  // `to` inklusif; nilai tepat tengah malam UTC (tanggal saja, mis. "2026-11-10") berarti sampai akhir hari itu.
  const to = filter.to !== undefined && filter.to % DAY_MS === 0 ? filter.to + DAY_MS - 1 : filter.to;
  return and(
    filter.action ? eq(auditLogs.action, filter.action) : undefined,
    filter.entityType ? eq(auditLogs.entityType, filter.entityType) : undefined,
    filter.actorUserId ? eq(auditLogs.actorUserId, filter.actorUserId) : undefined,
    filter.from !== undefined ? gte(auditLogs.createdAt, filter.from) : undefined,
    to !== undefined ? lte(auditLogs.createdAt, to) : undefined
  );
}

export async function listAudit(db: Db, options: AuditFilter & { page: number; pageSize: number }) {
  const where = auditWhere(options);
  const [{ total }] = await db.select({ total: count() }).from(auditLogs).where(where);
  const logs = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      detail: auditLogs.detail,
      before: auditLogs.before,
      after: auditLogs.after,
      createdAt: auditLogs.createdAt,
      actorUserId: auditLogs.actorUserId,
      actor: users.displayName
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(options.pageSize)
    .offset((options.page - 1) * options.pageSize);
  return { logs: logs.map((log) => ({ ...log, actor: log.actor ?? "Sistem" })), total };
}

/** Nilai yang pernah muncul, untuk dropdown filter (S12e). */
export async function auditFacets(db: Db): Promise<AuditLogFacetsResponse> {
  const actions = await db.selectDistinct({ value: auditLogs.action }).from(auditLogs).orderBy(asc(auditLogs.action));
  const entityTypes = await db.selectDistinct({ value: auditLogs.entityType }).from(auditLogs).orderBy(asc(auditLogs.entityType));
  const actors = await db.selectDistinct({ id: users.id, name: users.displayName }).from(auditLogs).innerJoin(users, eq(users.id, auditLogs.actorUserId)).orderBy(asc(users.displayName), asc(users.id));
  return { actions: actions.map((row) => row.value), entityTypes: entityTypes.map((row) => row.value), actors };
}
