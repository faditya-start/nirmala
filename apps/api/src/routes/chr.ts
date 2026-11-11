/** Endpoint CHR per eselon I (docs/api-contract.md §4). */
import { and, eq, inArray } from "drizzle-orm";
import { Hono, type Context } from "hono";
import {
  addendumBodySchema, chrListQuerySchema, chrPrintQuerySchema, createChrBodySchema, createNoteBodySchema, recommendationBodySchema, unitResponseBodySchema, updateNoteBodySchema,
  type ChrAddendumResponse, type ChrDetailResponse, type ChrDocumentResponse, type ChrListItemDto, type ChrListResponse, type ChrNoteResponse, type ChrVersionDetailResponse, type ChrVersionListResponse
} from "@nirmala/shared";
import type { Database } from "../db/client.js";
import { chrDocuments, chrNotes, organizationUnits, reviewerDecisions } from "../db/schema.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { canAccessOrganization } from "../middleware/scope.js";
import { recordAudit } from "../repositories/audit.js";
import {
  countByStatus, findChrById, getOrCreateChr, groupNotes, insertVersion, listVersionRows, loadChrDocumentDto, loadDocumentNotes, loadNoteDto, syncChrCompletion, toVersionSummary
} from "../repositories/chr.js";
import { findCycle } from "../repositories/cycles.js";
import { ChrError, assertDraft, buildPrint, chrPermissions, insertNote, issueChr, printConfigFromEnv, type PrintConfig } from "../services/chrService.js";

const FORBIDDEN_ORG = "Anda tidak memiliki akses ke eselon I ini.";

export function chrRoutes(database: Database, printConfig: PrintConfig = printConfigFromEnv()) {
  const { db } = database;
  const routes = new Hono<AppEnv>();

  /** Menjalankan `fn`; `ChrError` menjadi respons galat. */
  const guarded = async (context: Context<AppEnv>, fn: () => Promise<Response>) => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ChrError) return context.json({ error: error.message }, error.status);
      throw error;
    }
  };

  /** CHR dari `:id` dengan pemeriksaan scope; mengembalikan galat 404/403 bila tidak boleh. */
  const loadGuarded = async (context: Context<AppEnv>) => {
    const chr = await findChrById(db, context.req.param("id") ?? "");
    if (!chr) throw new ChrError(404, "CHR tidak ditemukan.");
    if (!canAccessOrganization(context.get("orgScope"), chr.organizationUnitId)) throw new ChrError(403, FORBIDDEN_ORG);
    return chr;
  };

  const parseBody = async <T>(context: Context<AppEnv>, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, fallback: string): Promise<T> => {
    const parsed = schema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) throw new ChrError(400, parsed.error.issues[0]?.message ?? fallback);
    return parsed.data;
  };

  routes.get("/", requireRole(), (context) => guarded(context, async () => {
    const parsed = chrListQuerySchema.safeParse(context.req.query());
    if (!parsed.success) throw new ChrError(400, parsed.error.issues[0]?.message ?? "Filter tidak valid.");
    const query = parsed.data;
    const scope = context.get("orgScope");
    if (!(await findCycle(db, query.cycleId))) throw new ChrError(404, "Siklus tidak ditemukan.");
    if (query.organizationUnitId && !canAccessOrganization(scope, query.organizationUnitId)) throw new ChrError(403, FORBIDDEN_ORG);

    const empty = scope !== null && scope.length === 0;
    const allUnits = empty ? [] : await db.select({ id: organizationUnits.id, code: organizationUnits.code, shortName: organizationUnits.shortName, name: organizationUnits.name })
      .from(organizationUnits).where(scope === null ? undefined : inArray(organizationUnits.id, scope));
    const wanted = allUnits.filter((unit) => !query.organizationUnitId || unit.id === query.organizationUnitId);
    const documents = wanted.length
      ? await db.select().from(chrDocuments).where(and(eq(chrDocuments.cycleId, query.cycleId), inArray(chrDocuments.organizationUnitId, wanted.map((unit) => unit.id))))
      : [];
    const noteRows = documents.length
      ? await db.select({ chrId: chrNotes.chrDocumentId, status: chrNotes.status }).from(chrNotes).where(inArray(chrNotes.chrDocumentId, documents.map((document) => document.id)))
      : [];
    const unitOf = new Map(wanted.map((unit) => [unit.id, unit]));
    const items: ChrListItemDto[] = documents
      .filter((document) => !query.status || document.status === query.status)
      .map((document) => {
        const notes = noteRows.filter((row) => row.chrId === document.id);
        const unit = unitOf.get(document.organizationUnitId)!;
        return {
          id: document.id, cycleId: document.cycleId, organizationUnitId: unit.id, organizationUnitCode: unit.code, organizationUnitName: unit.shortName,
          status: document.status, documentNumber: document.documentNumber, notesByStatus: countByStatus(notes), notesTotal: notes.length,
          issuedAt: document.issuedAt, completedAt: document.completedAt, updatedAt: document.updatedAt
        };
      })
      .sort((a, b) => a.organizationUnitCode.localeCompare(b.organizationUnitCode));
    const withDocument = new Set(documents.map((document) => document.organizationUnitId));
    const body: ChrListResponse = {
      items,
      organizationUnitsWithoutChr: wanted.filter((unit) => !withDocument.has(unit.id)).sort((a, b) => a.code.localeCompare(b.code)).map(({ id, code, shortName, name }) => ({ id, code, shortName, name }))
    };
    return context.json(body);
  }));

  routes.post("/", requireRole("reviewer", "admin"), (context) => guarded(context, async () => {
    const actor = context.get("user")!;
    const body = await parseBody(context, createChrBodySchema, "Data CHR tidak valid.");
    const cycle = await findCycle(db, body.cycleId);
    if (!cycle) throw new ChrError(404, "Siklus tidak ditemukan.");
    const [unit] = await db.select({ id: organizationUnits.id, shortName: organizationUnits.shortName }).from(organizationUnits).where(eq(organizationUnits.id, body.organizationUnitId)).limit(1);
    if (!unit) throw new ChrError(404, "Eselon I tidak ditemukan.");
    if (!canAccessOrganization(context.get("orgScope"), unit.id)) throw new ChrError(403, FORBIDDEN_ORG);
    const existing = await db.select({ id: chrDocuments.id }).from(chrDocuments).where(and(eq(chrDocuments.cycleId, cycle.id), eq(chrDocuments.organizationUnitId, unit.id))).limit(1);
    if (!existing.length && cycle.status !== "aktif") throw new ChrError(409, "Siklus sudah selesai; CHR baru tidak dapat dibuat.");
    const result = await database.transaction(async () => {
      const { chr, created } = await getOrCreateChr(db, { cycleId: cycle.id, organizationUnitId: unit.id, createdBy: actor.id });
      if (created) await recordAudit(db, { actorId: actor.id, action: "chr.created", entityType: "chr_document", entityId: chr.id, detail: `CHR ${unit.shortName} dibuat (draf).`, after: { status: "draft" } });
      return { id: chr.id, created };
    });
    return context.json({ document: await loadChrDocumentDto(db, result.id) } satisfies ChrDocumentResponse, result.created ? 201 : 200);
  }));

  routes.get("/:id", requireRole(), (context) => guarded(context, async () => {
    const chr = await loadGuarded(context);
    const [document, notes, versionRows] = await Promise.all([loadChrDocumentDto(db, chr.id), loadDocumentNotes(db, chr.id), listVersionRows(db, chr.id)]);
    const notesByStatus = countByStatus(notes);
    const body: ChrDetailResponse = {
      document, groups: groupNotes(notes), notesByStatus, notesTotal: notes.length,
      versions: versionRows.map((row) => toVersionSummary(row, row.createdByName ?? "")),
      permissions: chrPermissions(context.get("user")!.role, chr.status, notesByStatus.draf)
    };
    return context.json(body);
  }));

  // ------------------------------------------------------------------ Catatan dan rekomendasi (draf; reviewer, admin)

  routes.post("/:id/notes", requireRole("reviewer", "admin"), (context) => guarded(context, async () => {
    const actor = context.get("user")!;
    const chr = await loadGuarded(context);
    const body = await parseBody(context, createNoteBodySchema, "Data catatan tidak valid.");
    assertDraft(chr);
    const noteId = await database.transaction(async () => {
      const fresh = await findChrById(db, chr.id);
      assertDraft(fresh!);
      const id = await insertNote(db, fresh!, body, actor, "editor");
      await recordAudit(db, {
        actorId: actor.id, action: "chr.note_created", entityType: "chr_note", entityId: id, detail: `Catatan ditambahkan ke CHR ${chrLabel(chr)} (draf).`,
        after: { chrId: chr.id, category: body.category, expectation: body.expectation, rkaItemId: body.rkaItemId ?? null, text: body.text }
      });
      return id;
    });
    return context.json({ note: await loadNoteDto(db, noteId) } satisfies ChrNoteResponse, 201);
  }));

  routes.patch("/:id/notes/:noteId", requireRole("reviewer", "admin"), (context) => guarded(context, async () => {
    const actor = context.get("user")!;
    const chr = await loadGuarded(context);
    const body = await parseBody(context, updateNoteBodySchema, "Tidak ada perubahan yang dikirim.");
    assertDraft(chr);
    await database.transaction(async () => {
      assertDraft((await findChrById(db, chr.id))!);
      const [note] = await db.select().from(chrNotes).where(and(eq(chrNotes.id, context.req.param("noteId") ?? ""), eq(chrNotes.chrDocumentId, chr.id))).limit(1);
      if (!note) throw new ChrError(404, "Catatan tidak ditemukan.");
      if (note.status !== "draf") throw new ChrError(409, LOCKED_NOTE);
      const patch = { category: body.category ?? note.category, text: body.text ?? note.text, expectation: body.expectation ?? note.expectation, title: body.title ?? note.title };
      await db.update(chrNotes).set({ ...patch, updatedAt: Date.now() }).where(eq(chrNotes.id, note.id));
      await recordAudit(db, {
        actorId: actor.id, action: "chr.note_updated", entityType: "chr_note", entityId: note.id, detail: `Catatan CHR ${chrLabel(chr)} diubah.`,
        before: { category: note.category, text: note.text, expectation: note.expectation, title: note.title }, after: patch
      });
    });
    return context.json({ note: await loadNoteDto(db, context.req.param("noteId") ?? "") } satisfies ChrNoteResponse);
  }));

  routes.delete("/:id/notes/:noteId", requireRole("reviewer", "admin"), (context) => guarded(context, async () => {
    const actor = context.get("user")!;
    const chr = await loadGuarded(context);
    assertDraft(chr);
    await database.transaction(async () => {
      assertDraft((await findChrById(db, chr.id))!);
      const [note] = await db.select().from(chrNotes).where(and(eq(chrNotes.id, context.req.param("noteId") ?? ""), eq(chrNotes.chrDocumentId, chr.id))).limit(1);
      if (!note) throw new ChrError(404, "Catatan tidak ditemukan.");
      if (note.status !== "draf") throw new ChrError(409, LOCKED_NOTE);
      await db.delete(chrNotes).where(eq(chrNotes.id, note.id));
      if (note.rkaItemId) await db.delete(reviewerDecisions).where(and(eq(reviewerDecisions.rkaItemId, note.rkaItemId), eq(reviewerDecisions.decision, "confirm")));
      await recordAudit(db, {
        actorId: actor.id, action: "chr.note_deleted", entityType: "chr_note", entityId: note.id, detail: `Catatan dihapus dari CHR ${chrLabel(chr)} (draf).`,
        before: { category: note.category, text: note.text, expectation: note.expectation, title: note.title, rkaItemId: note.rkaItemId }
      });
    });
    return context.body(null, 204);
  }));

  routes.put("/:id/recommendation", requireRole("reviewer", "admin"), (context) => guarded(context, async () => {
    const actor = context.get("user")!;
    const chr = await loadGuarded(context);
    const body = await parseBody(context, recommendationBodySchema, "Rekomendasi tidak valid.");
    assertDraft(chr);
    await database.transaction(async () => {
      const fresh = (await findChrById(db, chr.id))!;
      assertDraft(fresh);
      const next = body.recommendation === "" ? null : body.recommendation;
      await db.update(chrDocuments).set({ recommendation: next, updatedAt: Date.now() }).where(eq(chrDocuments.id, chr.id));
      await recordAudit(db, { actorId: actor.id, action: "chr.recommendation_updated", entityType: "chr_document", entityId: chr.id, detail: `Rekomendasi CHR ${chrLabel(chr)} diperbarui (draf).`, before: { recommendation: fresh.recommendation }, after: { recommendation: next } });
    });
    return context.json({ document: await loadChrDocumentDto(db, chr.id) } satisfies ChrDocumentResponse);
  }));

  // ------------------------------------------------------------------ Terbit, tanggapan, adendum

  routes.post("/:id/issue", requireRole("reviewer", "admin"), (context) => guarded(context, async () => {
    const actor = context.get("user")!;
    const chr = await loadGuarded(context);
    const result = await database.transaction(() => issueChr(db, chr.id, actor));
    return context.json(result);
  }));

  routes.put("/:id/unit-response", requireRole("uki", "admin"), (context) => guarded(context, async () => {
    const actor = context.get("user")!;
    const chr = await loadGuarded(context);
    const body = await parseBody(context, unitResponseBodySchema, "Tanggapan tidak valid.");
    if (chr.status === "draft") throw new ChrError(409, "Tanggapan baru bisa diisi setelah CHR terbit.");
    await database.transaction(async () => {
      const fresh = (await findChrById(db, chr.id))!;
      if (fresh.status === "draft") throw new ChrError(409, "Tanggapan baru bisa diisi setelah CHR terbit.");
      const now = Date.now();
      await db.update(chrDocuments).set({ unitResponse: body.unitResponse, unitResponseBy: actor.id, unitResponseAt: now, updatedAt: now }).where(eq(chrDocuments.id, chr.id));
      await recordAudit(db, {
        actorId: actor.id, action: "chr.unit_response_updated", entityType: "chr_document", entityId: chr.id, detail: `Tanggapan eselon I untuk CHR ${chrLabel(chr)} ${fresh.unitResponse ? "diperbarui" : "diisi"}.`,
        before: { unitResponse: fresh.unitResponse }, after: { unitResponse: body.unitResponse }
      });
    });
    return context.json({ document: await loadChrDocumentDto(db, chr.id) } satisfies ChrDocumentResponse);
  }));

  routes.post("/:id/addendum", requireRole("reviewer", "admin"), (context) => guarded(context, async () => {
    const actor = context.get("user")!;
    const chr = await loadGuarded(context);
    const body = await parseBody(context, addendumBodySchema, "Data adendum tidak valid.");
    if (chr.status === "draft") throw new ChrError(409, "CHR masih draf; ubah langsung tanpa adendum.");
    const result = await database.transaction(async () => {
      const fresh = (await findChrById(db, chr.id))!;
      if (fresh.status === "draft") throw new ChrError(409, "CHR masih draf; ubah langsung tanpa adendum.");
      const noteIds: string[] = [];
      for (const note of body.notes) noteIds.push(await insertNote(db, fresh, note, actor, "adendum"));
      const recommendation = body.recommendation === undefined ? fresh.recommendation : body.recommendation === "" ? null : body.recommendation;
      await db.update(chrDocuments).set({ recommendation, updatedAt: Date.now() }).where(eq(chrDocuments.id, chr.id));
      await syncChrCompletion(db, chr.id, actor.id); // catatan baru yang belum closed mengembalikan `completed` ke `issued`
      const version = await insertVersion(db, { chrId: chr.id, reason: "adendum", addendumReason: body.reason, createdBy: actor.id });
      await recordAudit(db, {
        actorId: actor.id, action: "chr.addendum_added", entityType: "chr_document", entityId: chr.id, detail: `Adendum CHR ${chrLabel(chr)} (versi ${version.versionNumber}): ${body.reason}`,
        before: { recommendation: fresh.recommendation, status: fresh.status }, after: { recommendation, version: version.versionNumber, noteIds, reason: body.reason }
      });
      return { version, notesAdded: noteIds.length };
    });
    return context.json({ document: await loadChrDocumentDto(db, chr.id), version: result.version, notesAdded: result.notesAdded } satisfies ChrAddendumResponse, 201);
  }));

  // ------------------------------------------------------------------ Versi dan cetak

  routes.get("/:id/versions", requireRole(), (context) => guarded(context, async () => {
    const chr = await loadGuarded(context);
    const rows = await listVersionRows(db, chr.id);
    return context.json({ versions: rows.map((row) => toVersionSummary(row, row.createdByName ?? "")) } satisfies ChrVersionListResponse);
  }));

  routes.get("/:id/versions/:versionNumber", requireRole(), (context) => guarded(context, async () => {
    const chr = await loadGuarded(context);
    const number = Number(context.req.param("versionNumber"));
    const row = Number.isInteger(number) ? (await listVersionRows(db, chr.id)).find((entry) => entry.versionNumber === number) : undefined;
    if (!row) throw new ChrError(404, "Versi CHR tidak ditemukan.");
    return context.json({ version: toVersionSummary(row, row.createdByName ?? ""), snapshot: row.snapshot } as unknown as ChrVersionDetailResponse);
  }));

  routes.get("/:id/print", requireRole(), (context) => guarded(context, async () => {
    const chr = await loadGuarded(context);
    const parsed = chrPrintQuerySchema.safeParse(context.req.query());
    if (!parsed.success) throw new ChrError(400, parsed.error.issues[0]?.message ?? "Versi tidak valid.");
    return context.json(await buildPrint(db, chr.id, parsed.data.version, printConfig));
  }));

  return routes;
}

const LOCKED_NOTE = "Catatan sudah terbit dan terkunci. Gunakan adendum.";
/** Label dokumen di pesan audit. */
const chrLabel = (chr: { documentNumber: string | null; id: string }) => chr.documentNumber ?? chr.id;
