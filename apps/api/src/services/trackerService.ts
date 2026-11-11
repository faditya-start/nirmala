/**
 * Aksi dan detail Smart Tracker (docs/api-contract.md §5). Fungsi tulis dipanggil di dalam `database.transaction` oleh route.
 *
 * Aturan keras: sistem tidak pernah menutup catatan. Setiap perubahan status di sini lewat `canTransition(aksi, status, peran)`
 * dengan peran pengguna nyata; `closed` hanya tercapai lewat `setujui` dan `terima_justifikasi` (reviewer/admin).
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  canTransition,
  type BulkApproveResponse, type BulkSkipReason, type CheckEvidenceDto, type NoteAction, type NoteActionPermissionsDto, type NoteActionResponse,
  type NoteNextStep, type NoteStatus, type Role, type TimelineEventDto, type TrackerNoteDetailResponse
} from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { auditLogs, chrNotes, rkaDocuments, users } from "../db/schema.js";
import { canAccessOrganization } from "../middleware/scope.js";
import { recordAudit } from "../repositories/audit.js";
import { listVersionRows, loadNoteDto, syncChrCompletion } from "../repositories/chr.js";
import { findNoteRecord, findNoteRecords, listChecks, markLatestCheck, type CheckRecord, type TrackerNoteRecord } from "../repositories/tracker.js";

export class TrackerError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409, message: string) { super(message); }
}

export const FORBIDDEN_ORG = "Anda tidak memiliki akses ke eselon I ini.";
export const NOTE_STATUS_LABEL: Record<NoteStatus, string> = {
  draf: "Draf", menunggu_revisi: "Menunggu Revisi", perlu_verifikasi: "Perlu Verifikasi", dijustifikasi: "Dijustifikasi", closed: "Closed"
};

export interface TrackerActor { id: string; role: Role }

/** Catatan terbit yang boleh diakses `scope`. Catatan `draf` tidak pernah tampil di tracker (404). */
export async function loadAccessibleNote(db: Db, noteId: string, scope: string[] | null): Promise<TrackerNoteRecord> {
  const record = await findNoteRecord(db, noteId);
  if (!record || record.note.status === "draf" || record.chr.status === "draft") throw new TrackerError(404, "Catatan tidak ditemukan.");
  if (!canAccessOrganization(scope, record.chr.organizationUnitId)) throw new TrackerError(403, FORBIDDEN_ORG);
  return record;
}

function requireTransition(action: NoteAction, status: NoteStatus, role: Role, verb: string): NoteStatus {
  const next = canTransition(action, status, role);
  if (!next) throw new TrackerError(409, `Catatan berstatus ${NOTE_STATUS_LABEL[status]} tidak dapat ${verb}.`);
  return next;
}

async function finish(db: Db, record: TrackerNoteRecord, actor: TrackerActor): Promise<NoteActionResponse> {
  const sync = await syncChrCompletion(db, record.chr.id, actor.id);
  return { note: await loadNoteDto(db, record.note.id), chrCompleted: sync.justCompleted };
}

/** Menutup catatan atas keputusan pengguna. Tidak ada pemanggil lain yang mengubah status ke `closed`. */
async function closeNote(db: Db, record: TrackerNoteRecord, actor: TrackerActor, action: "setujui" | "terima_justifikasi", noteText: string | null, detail: string, auditAction: "note.approved" | "note.justification_accepted") {
  const { note } = record;
  const next = requireTransition(action, note.status, actor.role, action === "setujui" ? "disetujui" : "diterima justifikasinya");
  if (next !== "closed") throw new TrackerError(409, "Transisi tidak valid.");
  const now = Date.now();
  await db.update(chrNotes).set({ status: "closed", closedBy: actor.id, closedAt: now, updatedAt: now }).where(eq(chrNotes.id, note.id));
  if (action === "setujui") await markLatestCheck(db, note.id, "setujui", actor.id, noteText, now);
  await recordAudit(db, {
    actorId: actor.id, action: auditAction, entityType: "chr_note", entityId: note.id, detail,
    before: { status: note.status }, after: { status: "closed", note: noteText, chrDocumentId: record.chr.id }
  });
}

export async function approveNote(db: Db, noteId: string, scope: string[] | null, actor: TrackerActor, noteText?: string): Promise<NoteActionResponse> {
  const record = await loadAccessibleNote(db, noteId, scope);
  await closeNote(db, record, actor, "setujui", noteText ?? null, `Catatan "${record.note.title ?? record.note.id}" disetujui dan ditutup.`, "note.approved");
  return finish(db, record, actor);
}

export async function acceptJustification(db: Db, noteId: string, scope: string[] | null, actor: TrackerActor, noteText?: string): Promise<NoteActionResponse> {
  const record = await loadAccessibleNote(db, noteId, scope);
  requireTransition("terima_justifikasi", record.note.status, actor.role, "diterima justifikasinya");
  if (!record.note.justification?.trim()) throw new TrackerError(409, "Justifikasi belum diisi.");
  await closeNote(db, record, actor, "terima_justifikasi", noteText ?? null, `Justifikasi Satker untuk catatan "${record.note.title ?? record.note.id}" diterima; catatan ditutup.`, "note.justification_accepted");
  return finish(db, record, actor);
}

export async function returnNote(db: Db, noteId: string, scope: string[] | null, actor: TrackerActor, reason: string): Promise<NoteActionResponse> {
  const record = await loadAccessibleNote(db, noteId, scope);
  const next = requireTransition("kembalikan", record.note.status, actor.role, "dikembalikan");
  const now = Date.now();
  await db.update(chrNotes).set({ status: next, updatedAt: now }).where(eq(chrNotes.id, record.note.id));
  await markLatestCheck(db, record.note.id, "kembalikan", actor.id, reason, now);
  await recordAudit(db, {
    actorId: actor.id, action: "note.returned", entityType: "chr_note", entityId: record.note.id, detail: `Catatan "${record.note.title ?? record.note.id}" dikembalikan ke Satker.`,
    before: { status: record.note.status }, after: { status: next, reason, chrDocumentId: record.chr.id }
  });
  return finish(db, record, actor);
}

export async function justifyNote(db: Db, noteId: string, scope: string[] | null, actor: TrackerActor, justification: string): Promise<NoteActionResponse> {
  const record = await loadAccessibleNote(db, noteId, scope);
  const next = requireTransition("justifikasi", record.note.status, actor.role, "dijustifikasi");
  const now = Date.now();
  await db.update(chrNotes).set({ status: next, justification, justifiedBy: actor.id, updatedAt: now }).where(eq(chrNotes.id, record.note.id));
  await recordAudit(db, {
    actorId: actor.id, action: "note.justified", entityType: "chr_note", entityId: record.note.id, detail: `Satker mengisi justifikasi untuk catatan "${record.note.title ?? record.note.id}".`,
    before: { status: record.note.status }, after: { status: next, justification, chrDocumentId: record.chr.id }
  });
  return finish(db, record, actor);
}

/**
 * Setujui massal: hanya catatan `perlu_verifikasi` dengan hasil cek terakhir `terpenuhi` dalam scope. Sisanya dilaporkan di `skipped`.
 * Dipicu eksplisit oleh pengguna reviewer/admin dengan daftar id; bukan penutupan oleh sistem.
 */
export async function bulkApprove(db: Db, noteIds: string[], scope: string[] | null, actor: TrackerActor, noteText?: string): Promise<BulkApproveResponse> {
  const ids = [...new Set(noteIds)];
  const records = await findNoteRecords(db, ids);
  const approvable = [...records.values()].filter((entry) => entry.note.status === "perlu_verifikasi" && canAccessOrganization(scope, entry.chr.organizationUnitId)).map((entry) => entry.note.id);
  const latest = new Map<string, CheckRecord>();
  for (const check of await listChecks(db, approvable)) if (!latest.has(check.noteId)) latest.set(check.noteId, check);

  const approvedNoteIds: string[] = [];
  const skipped: { noteId: string; reason: BulkSkipReason }[] = [];
  const touchedChrs: string[] = [];
  for (const id of ids) {
    const record = records.get(id);
    if (!record || record.note.status === "draf" || record.chr.status === "draft") { skipped.push({ noteId: id, reason: "tidak_ditemukan" }); continue; }
    if (!canAccessOrganization(scope, record.chr.organizationUnitId)) { skipped.push({ noteId: id, reason: "tidak_ada_akses" }); continue; }
    if (record.note.status !== "perlu_verifikasi") { skipped.push({ noteId: id, reason: "bukan_perlu_verifikasi" }); continue; }
    if (latest.get(id)?.result !== "terpenuhi") { skipped.push({ noteId: id, reason: "belum_terpenuhi" }); continue; }
    await closeNote(db, record, actor, "setujui", noteText ?? null, `Catatan "${record.note.title ?? record.note.id}" disetujui massal (hasil cek terpenuhi).`, "note.approved");
    approvedNoteIds.push(id);
    if (!touchedChrs.includes(record.chr.id)) touchedChrs.push(record.chr.id);
  }
  const completedChrIds: string[] = [];
  for (const chrId of touchedChrs) if ((await syncChrCompletion(db, chrId, actor.id)).justCompleted) completedChrIds.push(chrId);
  return { approvedNoteIds, skipped, completedChrIds };
}

// ---------------------------------------------------------------- Detail (S9)

function toEvidenceDto(check: CheckRecord): CheckEvidenceDto {
  return {
    checkId: check.id, result: check.result, checkedAt: check.checkedAt, snapshotVersionNo: check.snapshotVersionNo, snapshotLabel: check.snapshotLabel,
    rows: check.evidence.fields.map((entry) => ({ field: entry.field, before: entry.before, after: entry.after, changed: entry.before !== entry.after, expected: entry.expected ?? null })),
    note: check.evidence.note ?? null
  };
}

export function notePermissions(role: Role, status: NoteStatus, justification: string | null): NoteActionPermissionsDto {
  return {
    canApprove: canTransition("setujui", status, role) !== null,
    canReturn: canTransition("kembalikan", status, role) !== null,
    canAcceptJustification: canTransition("terima_justifikasi", status, role) !== null && Boolean(justification?.trim()),
    canJustify: canTransition("justifikasi", status, role) !== null
  };
}

const AUDIT_EVENT: Record<string, { type: TimelineEventDto["type"]; status: NoteStatus; key: string }> = {
  "note.returned": { type: "dikembalikan", status: "menunggu_revisi", key: "reason" },
  "note.justified": { type: "dijustifikasi", status: "dijustifikasi", key: "justification" },
  "note.justification_accepted": { type: "justifikasi_diterima", status: "closed", key: "note" },
  "note.approved": { type: "disetujui", status: "closed", key: "note" }
};

async function buildTimeline(db: Db, record: TrackerNoteRecord, checks: CheckRecord[]): Promise<TimelineEventDto[]> {
  const { note, chr } = record;
  const [creator] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, note.createdBy)).limit(1);
  const events: TimelineEventDto[] = [{ type: "dibuat", at: note.createdAt, actorName: creator?.name ?? null, category: note.category, statusAfter: "draf" }];

  // Versi CHR pertama yang memuat catatan ini: v1 = terbit, selebihnya adendum.
  const versions = await listVersionRows(db, chr.id);
  const containing = versions.find((version) => (version.snapshot as { notes?: { id: string }[] }).notes?.some((entry) => entry.id === note.id));
  const [issuer] = chr.issuedBy ? await db.select({ name: users.displayName }).from(users).where(eq(users.id, chr.issuedBy)).limit(1) : [];
  if (containing && containing.reason === "adendum") {
    events.push({ type: "adendum", at: containing.createdAt, actorName: containing.createdByName ?? null, chrDocumentNumber: chr.documentNumber, chrVersion: containing.versionNumber, statusAfter: "menunggu_revisi" });
  } else if (chr.issuedAt !== null) {
    events.push({ type: "terbit", at: chr.issuedAt, actorName: issuer?.name ?? null, chrDocumentNumber: chr.documentNumber, chrVersion: containing?.versionNumber ?? 1, statusAfter: "menunggu_revisi" });
  }

  for (const check of [...checks].reverse()) {
    events.push({ type: "cek", at: check.checkedAt, actorName: null, snapshotVersionNo: check.snapshotVersionNo, checkResult: check.result, statusAfter: "perlu_verifikasi" });
  }

  const audits = await db.select({ action: auditLogs.action, after: auditLogs.after, createdAt: auditLogs.createdAt, actorName: users.displayName }).from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(and(eq(auditLogs.entityType, "chr_note"), eq(auditLogs.entityId, note.id), inArray(auditLogs.action, Object.keys(AUDIT_EVENT)))).orderBy(asc(auditLogs.createdAt));
  for (const audit of audits) {
    const mapping = AUDIT_EVENT[audit.action];
    const reason = (audit.after as Record<string, unknown> | null)?.[mapping.key];
    events.push({ type: mapping.type, at: audit.createdAt, actorName: audit.actorName ?? null, reason: typeof reason === "string" ? reason : null, statusAfter: mapping.status });
  }
  return events.sort((a, b) => a.at - b.at);
}

async function nextStepFor(db: Db, record: TrackerNoteRecord): Promise<NoteNextStep> {
  switch (record.note.status) {
    case "perlu_verifikasi": return { kind: "keputusan_reviewer" };
    case "dijustifikasi": return { kind: "review_justifikasi" };
    case "menunggu_revisi": {
      const documents = await db.select({ versionNo: rkaDocuments.versionNo }).from(rkaDocuments)
        .where(and(eq(rkaDocuments.cycleId, record.chr.cycleId), eq(rkaDocuments.organizationUnitId, record.chr.organizationUnitId)));
      return { kind: "snapshot_revisi", snapshotVersionNo: Math.max(1, ...documents.map((document) => document.versionNo)) + 1 };
    }
    default: return null;
  }
}

export async function buildNoteDetail(db: Db, noteId: string, scope: string[] | null, role: Role): Promise<TrackerNoteDetailResponse> {
  const record = await loadAccessibleNote(db, noteId, scope);
  const checks = await listChecks(db, [noteId]);
  const dto = await loadNoteDto(db, noteId);
  return {
    note: dto, chrDocumentNumber: record.chr.documentNumber, chrIssuedAt: record.chr.issuedAt, organizationUnitId: record.chr.organizationUnitId,
    latestEvidence: checks[0] ? toEvidenceDto(checks[0]) : null, previousEvidence: checks.slice(1).map(toEvidenceDto),
    timeline: await buildTimeline(db, record, checks), nextStep: await nextStepFor(db, record),
    permissions: notePermissions(role, record.note.status, record.note.justification), workUnitName: dto.workUnitName
  };
}
