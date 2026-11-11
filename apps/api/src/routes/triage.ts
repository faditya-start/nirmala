import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  confirmItemBodySchema, dismissItemBodySchema, triageDetailQuerySchema, triageListQuerySchema,
  type ConfirmItemResponse, type DismissItemResponse, type TriageItemDetailResponse, type TriageItemRow, type TriageListResponse, type TriageNavigationDto
} from "@nirmala/shared";
import type { Database } from "../db/client.js";
import { chrNotes, dismissReasons, reviewerDecisions, workUnits } from "../db/schema.js";
import { newId } from "../lib/security.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { canAccessOrganization } from "../middleware/scope.js";
import { recordAudit } from "../repositories/audit.js";
import { chrRef, findChrByCycleOrg, getOrCreateChr, loadNoteDto } from "../repositories/chr.js";
import { findCycle } from "../repositories/cycles.js";
import {
  countTriageRows, decisionsByItem, listTriageIds, listTriageRows, notesByItem, resolveScoreConfigId, resolveTriageSnapshots, ruleCodesByItem, toSnapshotInfo, triageSummary
} from "../repositories/triage.js";
import {
  buildConfirmDefaults, buildDecisionDto, buildItemContext, buildPreviousVersion, buildRuleHits, buildSatkerHistory, buildScore, isLatestSnapshot, loadItemRecord, resolveDecision
} from "../services/triageDetail.js";

const FORBIDDEN_ORG = "Anda tidak memiliki akses ke eselon I ini.";
/** Navigasi dihitung dari paling banyak sekian item pertama daftar ber-filter. */
const NAVIGATION_WINDOW = 20_000;

export function triageRoutes(database: Database) {
  const { db } = database;
  const routes = new Hono<AppEnv>();

  routes.get("/items", requireRole(), async (context) => {
    const parsed = triageListQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Filter tidak valid." }, 400);
    const query = parsed.data;
    const scope = context.get("orgScope");
    if (!(await findCycle(db, query.cycleId))) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    if (query.organizationUnitId && !canAccessOrganization(scope, query.organizationUnitId)) return context.json({ error: FORBIDDEN_ORG }, 403);
    if (query.workUnitId) {
      const [workUnit] = await db.select({ organizationUnitId: workUnits.organizationUnitId }).from(workUnits).where(eq(workUnits.id, query.workUnitId)).limit(1);
      if (!workUnit) return context.json({ error: "Satker tidak ditemukan." }, 404);
      if (query.organizationUnitId && workUnit.organizationUnitId !== query.organizationUnitId) return context.json({ error: "Satker bukan bagian dari eselon I yang dipilih." }, 400);
      if (!canAccessOrganization(scope, workUnit.organizationUnitId)) return context.json({ error: FORBIDDEN_ORG }, 403);
    }

    const { snapshots, documentIds } = await resolveTriageSnapshots(db, query.cycleId, scope, query.organizationUnitId);
    const scoreConfigId = await resolveScoreConfigId(db, documentIds);
    const options = { filter: query, documentIds, scoreConfigId, sort: query.sort, dir: query.dir };
    const rows = await listTriageRows(db, options, { limit: query.pageSize, offset: (query.page - 1) * query.pageSize });
    const total = await countTriageRows(db, query, documentIds);

    const previousIds = rows.flatMap((row) => (row.changeType === "tetap" && row.previousItemId ? [row.previousItemId] : []));
    const ids = rows.map((row) => row.id);
    const [codes, decisions, notes] = await Promise.all([ruleCodesByItem(db, ids), decisionsByItem(db, [...ids, ...previousIds]), notesByItem(db, [...ids, ...previousIds])]);
    const organizationOf = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot.organizationUnitId]));

    const items: TriageItemRow[] = rows.map((row) => {
      const own = decisions.get(row.id);
      const inheritedFrom = !own && row.changeType === "tetap" && row.previousItemId ? row.previousItemId : null;
      const decision = own ?? (inheritedFrom ? decisions.get(inheritedFrom) : undefined);
      const note = decision?.decision === "confirm" ? notes.get(decision.rkaItemId) : undefined;
      return {
        id: row.id, documentId: row.documentId, organizationUnitId: organizationOf.get(row.documentId) ?? "", workUnitId: row.workUnitId, workUnitCode: row.workUnitCode, workUnitName: row.workUnitName,
        accountCode: row.accountCode, description: row.description, totalAmount: row.totalAmount, ruleCodes: codes.get(row.id) ?? [], score: row.score,
        riskCategory: row.category as TriageItemRow["riskCategory"], changeType: row.changeType, decision: decision?.decision ?? "belum_ditinjau", decisionInherited: Boolean(decision && inheritedFrom),
        noteId: note?.id ?? null, noteStatus: note?.status ?? null
      };
    });

    const body: TriageListResponse = {
      items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
      snapshots: snapshots.map(toSnapshotInfo), summary: await triageSummary(db, documentIds, query.workUnitId, scoreConfigId)
    };
    return context.json(body);
  });

  routes.get("/items/:id", requireRole(), async (context) => {
    const user = context.get("user")!;
    const scope = context.get("orgScope");
    const record = await loadItemRecord(db, context.req.param("id"));
    if (!record) return context.json({ error: "Item tidak ditemukan." }, 404);
    if (!canAccessOrganization(scope, record.document.organizationUnitId)) return context.json({ error: FORBIDDEN_ORG }, 403);
    const rawQuery = context.req.query();
    const parsed = triageDetailQuerySchema.safeParse(rawQuery);
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Filter tidak valid." }, 400);

    const { item, document } = record;
    const [itemContext, { score, peer }, ruleHits, satkerHistory, previousVersion, decision, chr] = await Promise.all([
      buildItemContext(db, record), buildScore(db, item.id, item.unitPrice), buildRuleHits(db, item.id), buildSatkerHistory(db, record.workUnit),
      buildPreviousVersion(db, item), resolveDecision(db, item), findChrByCycleOrg(db, document.cycleId, document.organizationUnitId)
    ]);
    const latest = await isLatestSnapshot(db, document);
    const canWrite = user.role === "reviewer" || user.role === "admin";
    let canDecide = false;
    if (canWrite && latest) {
      if (!decision) canDecide = true;
      else if (!decision.inherited) {
        const [note] = decision.row.decision === "confirm" ? await db.select({ status: chrNotes.status }).from(chrNotes).where(eq(chrNotes.rkaItemId, item.id)).limit(1) : [];
        canDecide = decision.row.decision === "dismiss" || note?.status === "draf"; // masih bisa dicabut
      }
    }

    let navigation: TriageNavigationDto | null = null;
    if (Object.keys(rawQuery).length > 0) {
      const filter = { ...parsed.data, cycleId: parsed.data.cycleId ?? document.cycleId };
      if (!filter.organizationUnitId || canAccessOrganization(scope, filter.organizationUnitId)) {
        const { documentIds } = await resolveTriageSnapshots(db, filter.cycleId, scope, filter.organizationUnitId);
        const scoreConfigId = await resolveScoreConfigId(db, documentIds);
        const ids = await listTriageIds(db, { filter, documentIds, scoreConfigId, sort: parsed.data.sort, dir: parsed.data.dir }, NAVIGATION_WINDOW);
        const index = ids.indexOf(item.id);
        if (index >= 0) navigation = { position: index + 1, total: await countTriageRows(db, filter, documentIds), previousItemId: ids[index - 1] ?? null, nextItemId: ids[index + 1] ?? null };
      }
    }

    const body: TriageItemDetailResponse = {
      item: itemContext, score, ruleHits, peer, satkerHistory, previousVersion,
      decision: decision ? await buildDecisionDto(db, decision) : null,
      confirmDefaults: buildConfirmDefaults(ruleHits), chr: chr ? await chrRef(db, chr) : null, canDecide, navigation
    };
    return context.json(body);
  });

  // ------------------------------------------------------------------ Keputusan (reviewer, admin)

  /** Item + pemeriksaan scope; mengembalikan respons galat atau catatan item. */
  const guardItem = async (context: { req: { param(name: string): string }; get(key: "orgScope"): string[] | null; json(body: unknown, status: 403 | 404): Response }) => {
    const record = await loadItemRecord(db, context.req.param("id"));
    if (!record) return { error: context.json({ error: "Item tidak ditemukan." }, 404) };
    if (!canAccessOrganization(context.get("orgScope"), record.document.organizationUnitId)) return { error: context.json({ error: FORBIDDEN_ORG }, 403) };
    return { record };
  };

  /** 409 bila item sudah diputuskan (sendiri atau diwarisi), siklus selesai, atau bukan dari snapshot terbaru. */
  const checkDecidable = async (record: NonNullable<Awaited<ReturnType<typeof guardItem>>["record"]>): Promise<string | null> => {
    if (await resolveDecision(db, record.item)) return "Item ini sudah ditinjau.";
    const cycle = await findCycle(db, record.document.cycleId);
    if (cycle?.status !== "aktif") return "Siklus sudah selesai; keputusan baru tidak diterima.";
    if (!(await isLatestSnapshot(db, record.document))) return "Item berasal dari snapshot lama.";
    return null;
  };

  routes.post("/items/:id/confirm", requireRole("reviewer", "admin"), async (context) => {
    const actor = context.get("user")!;
    const guarded = await guardItem(context);
    if (!guarded.record) return guarded.error;
    const record = guarded.record;
    const parsed = confirmItemBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data konfirmasi tidak valid." }, 400);
    const conflict = await checkDecidable(record);
    if (conflict) return context.json({ error: conflict }, 409);
    const existingChr = await findChrByCycleOrg(db, record.document.cycleId, record.document.organizationUnitId);
    if (existingChr && existingChr.status !== "draft") return context.json({ error: "CHR sudah terbit dan terkunci. Gunakan adendum untuk menambah catatan." }, 409);

    const hits = await buildRuleHits(db, record.item.id);
    const sourceRule = hits.length ? hits[0] : null;
    const result = await database.transaction(async () => {
      const { chr, created } = await getOrCreateChr(db, { cycleId: record.document.cycleId, organizationUnitId: record.document.organizationUnitId, createdBy: actor.id });
      if (created) await recordAudit(db, { actorId: actor.id, action: "chr.created", entityType: "chr_document", entityId: chr.id, detail: `CHR ${record.organizationUnitName} dibuat (draf) dari konfirmasi item.`, after: { status: "draft" } });
      const now = Date.now();
      const decisionId = newId("decision");
      const noteId = newId("note");
      await db.insert(reviewerDecisions).values({ id: decisionId, rkaItemId: record.item.id, reviewerUserId: actor.id, decision: "confirm", reasonCategory: null, note: null, createdAt: now });
      await db.insert(chrNotes).values({
        id: noteId, chrDocumentId: chr.id, rkaItemId: record.item.id, itemKey: record.item.itemKey, workUnitId: record.item.workUnitId, ruleId: sourceRule?.ruleId ?? null,
        title: record.item.description, category: parsed.data.category, text: parsed.data.text, expectation: parsed.data.expectation, status: "draf", createdBy: actor.id, createdAt: now, updatedAt: now
      });
      await recordAudit(db, {
        actorId: actor.id, action: "item.confirmed", entityType: "rka_item", entityId: record.item.id, detail: `Item "${record.item.description}" dikonfirmasi; catatan draf masuk CHR ${record.organizationUnitName}.`,
        after: { decision: "confirm", noteId, chrId: chr.id, category: parsed.data.category, expectation: parsed.data.expectation }
      });
      return { chr, noteId };
    });

    const decision = await resolveDecision(db, record.item);
    const body: ConfirmItemResponse = { decision: await buildDecisionDto(db, decision!), note: await loadNoteDto(db, result.noteId), chr: await chrRef(db, result.chr) };
    return context.json(body, 201);
  });

  routes.post("/items/:id/dismiss", requireRole("reviewer", "admin"), async (context) => {
    const actor = context.get("user")!;
    const guarded = await guardItem(context);
    if (!guarded.record) return guarded.error;
    const record = guarded.record;
    const parsed = dismissItemBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: "Pilih kategori alasan dismiss." }, 400);
    const [reason] = await db.select().from(dismissReasons).where(and(eq(dismissReasons.code, parsed.data.reasonCategory), eq(dismissReasons.active, true))).limit(1);
    if (!reason) return context.json({ error: "Kategori alasan dismiss tidak dikenal atau tidak aktif." }, 400);
    const conflict = await checkDecidable(record);
    if (conflict) return context.json({ error: conflict }, 409);

    await database.transaction(async () => {
      await db.insert(reviewerDecisions).values({ id: newId("decision"), rkaItemId: record.item.id, reviewerUserId: actor.id, decision: "dismiss", reasonCategory: reason.code, note: parsed.data.note?.trim() || null, createdAt: Date.now() });
      await recordAudit(db, {
        actorId: actor.id, action: "item.dismissed", entityType: "rka_item", entityId: record.item.id, detail: `Item "${record.item.description}" di-dismiss: ${reason.label}.`,
        after: { decision: "dismiss", reasonCategory: reason.code, note: parsed.data.note?.trim() || null }
      });
    });
    const decision = await resolveDecision(db, record.item);
    return context.json({ decision: await buildDecisionDto(db, decision!) } satisfies DismissItemResponse, 201);
  });

  routes.delete("/items/:id/decision", requireRole("reviewer", "admin"), async (context) => {
    const actor = context.get("user")!;
    const guarded = await guardItem(context);
    if (!guarded.record) return guarded.error;
    const record = guarded.record;
    const [own] = await db.select().from(reviewerDecisions).where(eq(reviewerDecisions.rkaItemId, record.item.id)).limit(1);
    if (!own) return context.json({ error: "Item ini tidak punya keputusan sendiri yang bisa dicabut." }, 404);
    const [note] = own.decision === "confirm" ? await db.select().from(chrNotes).where(eq(chrNotes.rkaItemId, record.item.id)).limit(1) : [];
    if (note && note.status !== "draf") return context.json({ error: "Catatan sudah terbit; keputusan tidak bisa dicabut." }, 409);

    await database.transaction(async () => {
      if (note) await db.delete(chrNotes).where(eq(chrNotes.id, note.id));
      await db.delete(reviewerDecisions).where(eq(reviewerDecisions.id, own.id));
      await recordAudit(db, {
        actorId: actor.id, action: "item.decision_reverted", entityType: "rka_item", entityId: record.item.id, detail: `Keputusan ${own.decision} untuk item "${record.item.description}" dicabut.`,
        before: { decision: own.decision, reasonCategory: own.reasonCategory, note: own.note, chrNoteId: note?.id ?? null, noteText: note?.text ?? null }
      });
    });
    return context.body(null, 204);
  });

  return routes;
}
