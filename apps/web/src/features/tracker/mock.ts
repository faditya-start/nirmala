/**
 * Stateful mock for the Smart Tracker and Progres Satker endpoints (docs/api-contract.md section 5).
 * Only loaded with VITE_MOCK=1. All data is synthetic. Actions change the in-memory notes, so the list, the detail
 * and /satker/progress stay consistent: approve, return, justify, accept and bulk approve all move statuses and counts.
 * Role comes from the mock session (`?as=uki|leader|admin`); transitions use `canTransition` from @nirmala/shared.
 */
import {
  approveNoteBodySchema,
  bulkApproveBodySchema,
  canTransition,
  justifyNoteBodySchema,
  returnNoteBodySchema,
  toPagination,
  type BulkApproveResponse,
  type BulkSkipReason,
  type CheckEvidenceDto,
  type CheckResult,
  type ChrNoteDto,
  type Evidence,
  type Expectation,
  type NoteAction,
  type NoteActionPermissionsDto,
  type NoteActionResponse,
  type NoteCategory,
  type NoteNextStep,
  type NoteStatus,
  type Role,
  type TimelineEventDto,
  type TrackerListResponse,
  type TrackerNoteDetailResponse,
  type TrackerNoteRow,
  type TrackerStatus,
  type WorkUnitDto
} from "@nirmala/shared";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api-error";
import { registerMock } from "../../lib/mock";
import { STATUS_TEXT } from "./logic";

const DAY = 86_400_000;
const ORG_A = { id: "org-a", code: "A1", shortName: "Ditjen Contoh A", name: "Direktorat Jenderal Contoh A" };
const ORG_C = { id: "org-c", code: "C1", shortName: "Ditjen Contoh C", name: "Direktorat Jenderal Contoh C" };
const CHR_ID = "chr-a-1";
const CHR_NUMBER = "014/CHR/2026";
const REVIEWER = "Reviewer 01";

function at(daysAgo: number, hour: number, minute: number): number {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

const ISSUED_AT = at(5, 9, 5);
const CREATED_AT = at(6, 14, 20);

const WORK_UNITS: WorkUnitDto[] = Array.from({ length: 8 }, (_, index) => {
  const n = String(index + 1).padStart(2, "0");
  return { id: `wu-${n}`, code: `9100${n}`, name: `Satker Contoh ${n}`, organizationUnitId: ORG_A.id };
});
const workUnit = (n: number) => WORK_UNITS[n - 1];

interface Check {
  evidence: CheckEvidenceDto;
}

interface MockNote {
  id: string;
  number: number;
  workUnitNo: number;
  title: string;
  accountCode: string;
  ruleCode: string;
  category: NoteCategory;
  text: string;
  expectation: Expectation;
  status: NoteStatus;
  justification: string | null;
  closedAt: number | null;
  checks: Check[];
  events: TimelineEventDto[];
  lastMovedAt: number;
  updatedAt: number;
}

function evidence(checkId: string, result: CheckResult, rows: { field: Evidence["fields"][number]["field"]; before: string | number | null; after: string | number | null; expected?: string | number | null }[], note: string | null = null): CheckEvidenceDto {
  return {
    checkId,
    result,
    checkedAt: at(1, 16, 40),
    snapshotVersionNo: 2,
    snapshotLabel: "Revisi",
    rows: rows.map((row) => ({ field: row.field, before: row.before, after: row.after, changed: row.before !== row.after, expected: row.expected ?? null })),
    note
  };
}

function baseEvents(note: { category: NoteCategory }): TimelineEventDto[] {
  return [
    { type: "dibuat", at: CREATED_AT, actorName: REVIEWER, category: note.category, statusAfter: "draf" },
    { type: "terbit", at: ISSUED_AT, actorName: REVIEWER, chrDocumentNumber: CHR_NUMBER, chrVersion: 1, statusAfter: "menunggu_revisi" }
  ];
}

function checkedEvents(note: { category: NoteCategory }, result: CheckResult): TimelineEventDto[] {
  return [...baseEvents(note), { type: "cek", at: at(1, 16, 40), actorName: null, snapshotVersionNo: 2, checkResult: result, statusAfter: "perlu_verifikasi" }];
}

function makeNotes(): MockNote[] {
  const notes: MockNote[] = [];
  const push = (note: Omit<MockNote, "number" | "lastMovedAt" | "updatedAt" | "closedAt"> & { closedAt?: number | null }) => {
    notes.push({ ...note, number: notes.length + 1, closedAt: note.closedAt ?? null, lastMovedAt: note.events[note.events.length - 1].at, updatedAt: note.events[note.events.length - 1].at });
  };

  push({
    id: "note-01",
    workUnitNo: 1,
    title: "Pakaian seragam hari besar",
    accountCode: "521211",
    ruleCode: "R01",
    category: "EFISIENSI",
    text: "Belanja pakaian seragam hari besar tidak termasuk kebutuhan operasional dasar. Hapus dari RKA atau jelaskan dasar kebutuhannya.",
    expectation: { type: "hapus_item" },
    status: "perlu_verifikasi",
    justification: null,
    checks: [{ evidence: evidence("chk-01", "terpenuhi", [{ field: "total_amount", before: 48_600_000, after: null }, { field: "description", before: "Pakaian seragam hari besar", after: null }]) }],
    events: checkedEvents({ category: "EFISIENSI" }, "terpenuhi")
  });
  push({
    id: "note-02",
    workUnitNo: 3,
    title: "Rehabilitasi madrasah desa",
    accountCode: "532111",
    ruleCode: "R05",
    category: "AKUN",
    text: "Rehabilitasi bangunan milik pihak lain dicatat pada akun belanja modal yang salah. Gunakan akun belanja barang untuk diserahkan kepada masyarakat.",
    expectation: { type: "ganti_akun", to: "526113" },
    status: "perlu_verifikasi",
    justification: null,
    checks: [{ evidence: evidence("chk-02", "terpenuhi", [{ field: "account_code", before: "532111", after: "526113", expected: "526113" }, { field: "total_amount", before: 312_000_000, after: 312_000_000 }, { field: "description", before: "Rehabilitasi madrasah desa", after: "Rehabilitasi madrasah desa" }]) }],
    events: checkedEvents({ category: "AKUN" }, "terpenuhi")
  });
  push({
    id: "note-03",
    workUnitNo: 2,
    title: "Outsourcing jasa kebersihan",
    accountCode: "522191",
    ruleCode: "R02",
    category: "AKUN",
    text: "Biaya tenaga outsourcing (satpam, pengemudi, kebersihan) menggunakan akun 521111 sesuai KEP-331/PB/2021 tentang Kodefikasi Segmen Akun pada BAS.",
    expectation: { type: "ganti_akun", to: "521111" },
    status: "perlu_verifikasi",
    justification: null,
    checks: [{ evidence: evidence("chk-03", "belum_terpenuhi", [{ field: "account_code", before: "522191", after: "522191", expected: "521111" }, { field: "total_amount", before: 126_000_000, after: 126_000_000 }, { field: "description", before: "Outsourcing jasa kebersihan", after: "Outsourcing jasa kebersihan" }]) }],
    events: checkedEvents({ category: "AKUN" }, "belum_terpenuhi")
  });
  push({
    id: "note-04",
    workUnitNo: 2,
    title: "Perjalanan dinas koordinasi pusat-daerah",
    accountCode: "524111",
    ruleCode: "R08",
    category: "SATUAN_BIAYA",
    text: "Item ini pernah diblokir; agar dicek kembali kesesuaiannya dengan ketentuan standar biaya sebelum diajukan.",
    expectation: { type: "manual", instruction: "Periksa kesesuaian dengan standar biaya." },
    status: "perlu_verifikasi",
    justification: null,
    checks: [{ evidence: evidence("chk-04", "data_tidak_cukup", [{ field: "blokir_code", before: "BLK-07", after: "BLK-07" }], "Ekspektasi manual tidak bisa dicek otomatis.") }],
    events: checkedEvents({ category: "SATUAN_BIAYA" }, "data_tidak_cukup")
  });
  push({
    id: "note-05",
    workUnitNo: 5,
    title: "Honorarium narasumber kegiatan sosialisasi",
    accountCode: "521115",
    ruleCode: "R03",
    category: "SATUAN_BIAYA",
    text: "Honorarium narasumber melebihi satuan biaya yang berlaku. Turunkan harga satuan sesuai standar.",
    expectation: { type: "turunkan_nilai", maxUnitPrice: 1_700_000 },
    status: "dijustifikasi",
    justification: "Narasumber berasal dari luar daerah dan tarifnya mengikuti kontrak kerja sama yang sudah berjalan.",
    checks: [{ evidence: evidence("chk-05", "belum_terpenuhi", [{ field: "unit_price", before: 2_400_000, after: 2_400_000, expected: 1_700_000 }, { field: "total_amount", before: 14_400_000, after: 14_400_000 }, { field: "quantity", before: 6, after: 6 }]) }],
    events: [
      ...checkedEvents({ category: "SATUAN_BIAYA" }, "belum_terpenuhi"),
      { type: "dijustifikasi", at: at(0, 8, 15), actorName: "PIC UKI 01", reason: "Narasumber berasal dari luar daerah dan tarifnya mengikuti kontrak kerja sama yang sudah berjalan.", statusAfter: "dijustifikasi" }
    ]
  });
  push({
    id: "note-06",
    workUnitNo: 6,
    title: "Belanja jasa konsultan penyusunan rencana induk",
    accountCode: "522151",
    ruleCode: "R04",
    category: "EFISIENSI",
    text: "Belanja jasa konsultan dapat dikerjakan oleh tim internal. Hapus item atau rinci kebutuhan tenaga ahli.",
    expectation: { type: "hapus_item" },
    status: "closed",
    justification: null,
    closedAt: at(0, 11, 20),
    checks: [{ evidence: evidence("chk-06", "terpenuhi", [{ field: "total_amount", before: 85_000_000, after: null }]) }],
    events: [...checkedEvents({ category: "EFISIENSI" }, "terpenuhi"), { type: "disetujui", at: at(0, 11, 20), actorName: REVIEWER, statusAfter: "closed" }]
  });

  // Many notes waiting for the revised snapshot, so the list paginates and long descriptions truncate.
  const extras = ["Sewa kendaraan operasional roda empat", "Belanja alat tulis kantor dan bahan komputer", "Pemeliharaan gedung kantor dan halaman", "Langganan daya dan jasa listrik", "Konsumsi rapat koordinasi bulanan"];
  for (let index = 0; index < 28; index += 1) {
    const n = (index % 5) + 4; // Satker 04..08
    const title =
      index === 3
        ? "Pengadaan peralatan dan mesin untuk pendukung kegiatan pelatihan teknis tingkat lanjut bagi aparatur sipil negara di seluruh wilayah kerja satuan kerja beserta pemeliharaannya"
        : `${extras[index % extras.length]} ${String(index + 1).padStart(2, "0")}`;
    const kind = index % 3;
    const expectation: Expectation = kind === 0 ? { type: "ganti_akun", to: "521211" } : kind === 1 ? { type: "turunkan_nilai", maxTotal: 25_000_000 } : { type: "rinci_item" };
    const category: NoteCategory = kind === 0 ? "AKUN" : kind === 1 ? "SATUAN_BIAYA" : "LAINNYA";
    push({
      id: `note-${String(index + 7).padStart(2, "0")}`,
      workUnitNo: n,
      title,
      accountCode: `5${String(21111 + index * 37).padStart(5, "0")}`,
      ruleCode: kind === 0 ? "R05" : kind === 1 ? "R03" : "R06",
      category,
      text: "Catatan reviu: sesuaikan item ini dengan ekspektasi perubahan yang tertera, lalu ajukan kembali pada snapshot revisi.",
      expectation,
      status: "menunggu_revisi",
      justification: null,
      checks: [],
      events: baseEvents({ category })
    });
  }
  return notes;
}

const state = { notes: makeNotes() };

// ------------------------------------------------------------------ helpers

async function currentRole(): Promise<Role> {
  const result = await api.get<{ user: { role: Role } | null }>("/auth/me", { skipUnauthorized: true });
  if (!result.user) throw new ApiError(401, "Sesi berakhir. Silakan masuk kembali.");
  return result.user.role;
}

function noteOrThrow(id: string): MockNote {
  const note = state.notes.find((item) => item.id === id);
  if (!note) throw new ApiError(404, "Catatan tidak ditemukan.");
  return note;
}

function latestCheck(note: MockNote): Check | null {
  return note.checks[note.checks.length - 1] ?? null;
}

function inScope(orgId: string | undefined): boolean {
  return !orgId || orgId === ORG_A.id;
}

function toRow(note: MockNote): TrackerNoteRow {
  const check = latestCheck(note);
  const status = note.status as TrackerStatus;
  const end = note.closedAt ?? Date.now();
  return {
    id: note.id,
    chrDocumentId: CHR_ID,
    chrDocumentNumber: CHR_NUMBER,
    organizationUnitId: ORG_A.id,
    workUnitId: workUnit(note.workUnitNo).id,
    workUnitName: workUnit(note.workUnitNo).name,
    title: note.title,
    accountCode: note.accountCode,
    ruleCode: note.ruleCode,
    category: note.category,
    expectation: note.expectation,
    status,
    latestCheck: check
      ? {
          result: check.evidence.result,
          checkedAt: check.evidence.checkedAt,
          snapshotVersionNo: check.evidence.snapshotVersionNo,
          evidence: { fields: check.evidence.rows.map((row) => ({ field: row.field, before: row.before, after: row.after })), note: check.evidence.note ?? undefined }
        }
      : null,
    chrIssuedAt: ISSUED_AT,
    ageDays: Math.max(0, Math.floor((end - ISSUED_AT) / DAY)),
    bulkApprovable: note.status === "perlu_verifikasi" && check?.evidence.result === "terpenuhi"
  };
}

function toNoteDto(note: MockNote): ChrNoteDto {
  const wu = workUnit(note.workUnitNo);
  return {
    id: note.id,
    chrDocumentId: CHR_ID,
    number: note.number,
    rkaItemId: `item-${note.id}`,
    workUnitId: wu.id,
    workUnitCode: wu.code,
    workUnitName: wu.name,
    accountCode: note.accountCode,
    title: note.title,
    category: note.category,
    text: note.text,
    expectation: note.expectation,
    status: note.status,
    ruleId: `rule-${note.ruleCode}`,
    ruleCode: note.ruleCode,
    justification: note.justification,
    closedAt: note.closedAt,
    latestCheckResult: latestCheck(note)?.evidence.result ?? null,
    createdByName: REVIEWER,
    createdAt: CREATED_AT,
    updatedAt: note.updatedAt
  };
}

function permissions(note: MockNote, role: Role): NoteActionPermissionsDto {
  return {
    canApprove: canTransition("setujui", note.status, role) !== null,
    canReturn: canTransition("kembalikan", note.status, role) !== null,
    canAcceptJustification: canTransition("terima_justifikasi", note.status, role) !== null && !!note.justification,
    canJustify: canTransition("justifikasi", note.status, role) !== null
  };
}

function nextStep(note: MockNote): NoteNextStep {
  if (note.status === "perlu_verifikasi") return { kind: "keputusan_reviewer" };
  if (note.status === "menunggu_revisi") return { kind: "snapshot_revisi", snapshotVersionNo: (latestCheck(note)?.evidence.snapshotVersionNo ?? 1) + 1 };
  if (note.status === "dijustifikasi") return { kind: "review_justifikasi" };
  return null;
}

function chrCompleted(): boolean {
  return state.notes.every((note) => note.status === "closed");
}

function actorName(role: Role): string {
  return role === "uki" ? "PIC UKI 01" : role === "admin" ? "Admin 01" : REVIEWER;
}

function guard(action: NoteAction, note: MockNote, role: Role, verb: string): NoteStatus {
  const next = canTransition(action, note.status, role);
  if (next) return next;
  const roleAllowed = (["menunggu_revisi", "perlu_verifikasi", "dijustifikasi", "closed", "draf"] as NoteStatus[]).some((from) => canTransition(action, from, role) !== null);
  if (!roleAllowed) throw new ApiError(403, "Anda tidak punya akses untuk tindakan ini.");
  throw new ApiError(409, `Catatan berstatus ${STATUS_TEXT[note.status]} tidak dapat ${verb}.`);
}

function apply(note: MockNote, status: NoteStatus, event: TimelineEventDto): void {
  note.status = status;
  note.events.push(event);
  note.lastMovedAt = event.at;
  note.updatedAt = event.at;
  if (status === "closed") note.closedAt = event.at;
}

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new ApiError(400, result.error.issues[0]?.message ?? "Isian tidak valid.");
  return result.data;
}

// ------------------------------------------------------------------ list

function statusCounts(notes: MockNote[]): Record<TrackerStatus, number> {
  const counts: Record<TrackerStatus, number> = { menunggu_revisi: 0, perlu_verifikasi: 0, dijustifikasi: 0, closed: 0 };
  for (const note of notes) if (note.status !== "draf") counts[note.status] += 1;
  return counts;
}

registerMock("GET", "/work-units", ({ query }) => ({
  workUnits: query.organizationUnitId && query.organizationUnitId !== ORG_A.id ? [] : WORK_UNITS
}));

registerMock("GET", "/tracker/notes", ({ query }) => {
  const orgId = query.organizationUnitId || undefined;
  const status = (query.status || "perlu_verifikasi") as TrackerStatus;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const scoped = inScope(orgId) ? state.notes : [];
  const base = scoped.filter((note) => (!query.workUnitId || workUnit(note.workUnitNo).id === query.workUnitId) && (!query.category || note.category === query.category));
  const counts = statusCounts(base);

  let rows = base.filter((note) => note.status === status && (!query.checkResult || latestCheck(note)?.evidence.result === query.checkResult)).map(toRow);
  const dir = query.dir === "asc" ? 1 : -1;
  const sort = query.sort || "age";
  rows = rows.sort((a, b) => {
    const left = sort === "satker" ? (a.workUnitName ?? "") : sort === "category" ? a.category : sort === "check" ? (a.latestCheck?.result ?? "") : String(a.ageDays).padStart(6, "0");
    const right = sort === "satker" ? (b.workUnitName ?? "") : sort === "category" ? b.category : sort === "check" ? (b.latestCheck?.result ?? "") : String(b.ageDays).padStart(6, "0");
    return left.localeCompare(right) * dir || a.title.localeCompare(b.title);
  });

  const response: TrackerListResponse = {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: toPagination(page, pageSize, rows.length),
    statusCounts: counts,
    chrDocuments: scoped.length
      ? [{ id: CHR_ID, documentNumber: CHR_NUMBER, organizationUnitId: ORG_A.id, organizationUnitName: ORG_A.shortName, status: chrCompleted() ? "completed" : "issued", issuedAt: ISSUED_AT }]
      : []
  };
  return response;
});

// ------------------------------------------------------------------ detail and actions

registerMock("GET", "/tracker/notes/:id", async ({ params }) => {
  const role = await currentRole();
  const note = noteOrThrow(params.id);
  const evidences = note.checks.map((check) => check.evidence);
  const latest = evidences[evidences.length - 1] ?? null;
  const response: TrackerNoteDetailResponse = {
    note: toNoteDto(note),
    chrDocumentNumber: CHR_NUMBER,
    chrIssuedAt: ISSUED_AT,
    organizationUnitId: ORG_A.id,
    latestEvidence: latest,
    previousEvidence: evidences.slice(0, -1).reverse(),
    timeline: note.events,
    nextStep: nextStep(note),
    permissions: permissions(note, role),
    workUnitName: workUnit(note.workUnitNo).name
  };
  return response;
});

registerMock("POST", "/tracker/notes/:id/approve", async ({ params, body }) => {
  const role = await currentRole();
  const note = noteOrThrow(params.id);
  const parsed = parse(approveNoteBodySchema, body);
  const next = guard("setujui", note, role, "disetujui");
  apply(note, next, { type: "disetujui", at: Date.now(), actorName: actorName(role), reason: parsed.note ?? null, statusAfter: next });
  const response: NoteActionResponse = { note: toNoteDto(note), chrCompleted: chrCompleted() };
  return response;
});

registerMock("POST", "/tracker/notes/:id/return", async ({ params, body }) => {
  const role = await currentRole();
  const note = noteOrThrow(params.id);
  const guarded = guard("kembalikan", note, role, "dikembalikan");
  const parsed = parse(returnNoteBodySchema, body);
  apply(note, guarded, { type: "dikembalikan", at: Date.now(), actorName: actorName(role), reason: parsed.reason, statusAfter: guarded });
  const response: NoteActionResponse = { note: toNoteDto(note), chrCompleted: false };
  return response;
});

registerMock("POST", "/tracker/notes/:id/justify", async ({ params, body }) => {
  const role = await currentRole();
  const note = noteOrThrow(params.id);
  const guarded = guard("justifikasi", note, role, "dijustifikasi");
  const parsed = parse(justifyNoteBodySchema, body);
  note.justification = parsed.justification;
  apply(note, guarded, { type: "dijustifikasi", at: Date.now(), actorName: actorName(role), reason: parsed.justification, statusAfter: guarded });
  const response: NoteActionResponse = { note: toNoteDto(note), chrCompleted: false };
  return response;
});

registerMock("POST", "/tracker/notes/:id/accept-justification", async ({ params, body }) => {
  const role = await currentRole();
  const note = noteOrThrow(params.id);
  const parsed = parse(approveNoteBodySchema, body);
  const guarded = guard("terima_justifikasi", note, role, "diterima justifikasinya");
  apply(note, guarded, { type: "justifikasi_diterima", at: Date.now(), actorName: actorName(role), reason: parsed.note ?? null, statusAfter: guarded });
  const response: NoteActionResponse = { note: toNoteDto(note), chrCompleted: chrCompleted() };
  return response;
});

registerMock("POST", "/tracker/notes/bulk-approve", async ({ body }) => {
  const role = await currentRole();
  if (canTransition("setujui", "perlu_verifikasi", role) === null) throw new ApiError(403, "Anda tidak punya akses untuk tindakan ini.");
  const parsed = parse(bulkApproveBodySchema, body);
  const approvedNoteIds: string[] = [];
  const skipped: BulkApproveResponse["skipped"] = [];
  for (const noteId of parsed.noteIds) {
    const note = state.notes.find((item) => item.id === noteId);
    let reason: BulkSkipReason | null = null;
    if (!note) reason = "tidak_ditemukan";
    else if (note.status !== "perlu_verifikasi") reason = "bukan_perlu_verifikasi";
    else if (latestCheck(note)?.evidence.result !== "terpenuhi") reason = "belum_terpenuhi";
    if (reason || !note) {
      skipped.push({ noteId, reason: reason ?? "tidak_ditemukan" });
      continue;
    }
    apply(note, "closed", { type: "disetujui", at: Date.now(), actorName: actorName(role), reason: "Setujui massal", statusAfter: "closed" });
    approvedNoteIds.push(noteId);
  }
  const response: BulkApproveResponse = { approvedNoteIds, skipped, completedChrIds: approvedNoteIds.length > 0 && chrCompleted() ? [CHR_ID] : [] };
  return response;
});

// Shared with features/satker/mock.ts so progress is computed from the same in-memory notes.
export const mockShared = { state, ORG_A, ORG_C, CHR_ID, CHR_NUMBER, WORK_UNITS, workUnit, latestCheck, chrCompleted };
