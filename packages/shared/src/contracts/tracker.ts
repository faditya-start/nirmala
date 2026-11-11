/**
 * Smart Tracker. Layar: S8 (daftar, dialog setujui massal, state kosong), S9 (detail catatan: reviewer, PIC UKI, hasil cek
 * "data tidak cukup").
 *
 * ATURAN KERAS: sistem tidak pernah menutup catatan. Hasil cek otomatis hanya usulan. Perubahan ke `closed` hanya lewat aksi
 * `setujui` atau `terima_justifikasi` oleh pengguna berperan reviewer/admin (lihat NOTE_TRANSITIONS).
 */
import { z } from "zod";
import type {
  CheckResult, ChrStatus, Evidence, Expectation, NoteCategory, NoteStatus, Role
} from "../base.js";
import { CHECK_RESULTS, NOTE_CATEGORIES } from "../base.js";
import { idSchema, optionalIdSchema, paginationQuerySchema, sortDirectionSchema, type Paginated } from "./common.js";
import type { ChrNoteDto } from "./chr.js";

// ---------------------------------------------------------------- Mesin status catatan

export const NOTE_ACTIONS = [
  "konfirmasi", "terbitkan", "adendum_tambah", "cek_otomatis", "setujui", "kembalikan", "justifikasi", "terima_justifikasi"
] as const;
export type NoteAction = (typeof NOTE_ACTIONS)[number];

export interface NoteTransition {
  action: NoteAction;
  /** Status asal. `null` = catatan baru (belum ada). */
  from: readonly (NoteStatus | null)[];
  to: NoteStatus;
  /** Aktor: peran pengguna, atau `sistem` untuk pekerjaan otomatis (tanpa pengguna). */
  actors: readonly (Role | "sistem")[];
  /** Pembatasan tambahan yang dicek API. */
  guard: string;
}

/**
 * Satu-satunya tabel transisi status catatan. API dan UI memakai tabel ini (lihat `canTransition`).
 * `closed` hanya bisa dicapai lewat `setujui` dan `terima_justifikasi`; keduanya tidak boleh dilakukan `sistem`.
 * Peran `leader` tidak punya aksi apa pun (baca saja). `admin` boleh semua aksi reviewer/UKI di semua eselon I.
 */
export const NOTE_TRANSITIONS: readonly NoteTransition[] = [
  { action: "konfirmasi", from: [null], to: "draf", actors: ["reviewer", "admin"], guard: "CHR eselon I berstatus draft; item belum diputuskan." },
  { action: "terbitkan", from: ["draf"], to: "menunggu_revisi", actors: ["reviewer", "admin"], guard: "Dilakukan serentak untuk semua catatan draf saat CHR diterbitkan (minimal satu catatan)." },
  { action: "adendum_tambah", from: [null], to: "menunggu_revisi", actors: ["reviewer", "admin"], guard: "CHR berstatus issued/completed; catatan masuk lewat adendum." },
  { action: "cek_otomatis", from: ["menunggu_revisi"], to: "perlu_verifikasi", actors: ["sistem"], guard: "Terjadi saat snapshot revisi eselon I diimpor; menambah baris follow_up_checks. Catatan perlu_verifikasi yang dicek ulang tetap perlu_verifikasi." },
  { action: "setujui", from: ["perlu_verifikasi"], to: "closed", actors: ["reviewer", "admin"], guard: "Boleh walau hasil cek bukan terpenuhi (keputusan reviewer); dicatat di audit log." },
  { action: "kembalikan", from: ["perlu_verifikasi", "dijustifikasi"], to: "menunggu_revisi", actors: ["reviewer", "admin"], guard: "Alasan wajib (min. 5 karakter)." },
  { action: "justifikasi", from: ["menunggu_revisi", "perlu_verifikasi"], to: "dijustifikasi", actors: ["uki", "admin"], guard: "Alasan Satker wajib (min. 10 karakter); UKI hanya untuk eselon I miliknya." },
  { action: "terima_justifikasi", from: ["dijustifikasi"], to: "closed", actors: ["reviewer", "admin"], guard: "Justifikasi sudah terisi." }
] as const;

/** Hasil transisi untuk (aksi, status asal, peran); null bila tidak boleh. */
export function canTransition(action: NoteAction, from: NoteStatus | null, role: Role | "sistem"): NoteStatus | null {
  const transition = NOTE_TRANSITIONS.find((item) => item.action === action);
  if (!transition || !transition.actors.includes(role) || !transition.from.includes(from)) return null;
  return transition.to;
}

// ---------------------------------------------------------------- Daftar (S8)

/** Tab status Smart Tracker (tanpa `draf`: catatan draf belum terbit dan tidak tampil di tracker). */
export const TRACKER_STATUSES = ["menunggu_revisi", "perlu_verifikasi", "dijustifikasi", "closed"] as const;
export type TrackerStatus = (typeof TRACKER_STATUSES)[number];

export const TRACKER_SORTS = ["age", "satker", "category", "check"] as const;
export type TrackerSort = (typeof TRACKER_SORTS)[number];

export const trackerListQuerySchema = paginationQuerySchema.extend({
  cycleId: idSchema,
  status: z.enum(TRACKER_STATUSES).default("perlu_verifikasi"),
  organizationUnitId: optionalIdSchema,
  workUnitId: optionalIdSchema,
  category: z.enum(NOTE_CATEGORIES).optional(),
  /** Tambahan: hasil cek terakhir (mis. hanya `terpenuhi` untuk persiapan setujui massal). */
  checkResult: z.enum(CHECK_RESULTS).optional(),
  /** Default `age` menurun = catatan paling lama menunggu di atas. */
  sort: z.enum(TRACKER_SORTS).default("age"),
  dir: sortDirectionSchema.default("desc")
});
export type TrackerListQuery = z.infer<typeof trackerListQuerySchema>;

export interface TrackerCheckDto {
  result: CheckResult;
  checkedAt: number;
  /** Versi snapshot yang dicek (mis. 2). */
  snapshotVersionNo: number;
  evidence: Evidence;
}

export interface TrackerNoteRow {
  id: string;
  chrDocumentId: string;
  chrDocumentNumber: string | null;
  organizationUnitId: string;
  workUnitId: string | null;
  workUnitName: string | null;
  /** Uraian item / judul catatan. */
  title: string;
  /** Akun item saat ini (snapshot terakhir yang dicek, atau snapshot dasar catatan). */
  accountCode: string | null;
  ruleCode: string | null;
  category: NoteCategory;
  expectation: Expectation;
  status: TrackerStatus;
  /** null bila belum pernah dicek. */
  latestCheck: TrackerCheckDto | null;
  /** Tanggal CHR diterbitkan; patokan umur. */
  chrIssuedAt: number;
  /** Hari penuh sejak `chrIssuedAt` (sampai `closedAt` bila sudah closed). */
  ageDays: number;
  /** true bila `status = perlu_verifikasi` dan hasil cek terakhir `terpenuhi` (dapat ikut setujui massal). */
  bulkApprovable: boolean;
}

export interface TrackerChrContext {
  id: string;
  documentNumber: string | null;
  organizationUnitId: string;
  organizationUnitName: string;
  status: ChrStatus;
  issuedAt: number | null;
}

export interface TrackerListResponse extends Paginated<TrackerNoteRow> {
  /** Jumlah catatan per tab, memakai filter eselon I / Satker / kategori yang sama (tab lain tetap dihitung). */
  statusCounts: Record<TrackerStatus, number>;
  /** CHR terbit milik eselon I yang tercakup (subjudul "CHR 014/..." dan catatan "umur dihitung sejak CHR terbit"). */
  chrDocuments: TrackerChrContext[];
}

// ---------------------------------------------------------------- Setujui massal

/** `POST /api/tracker/notes/bulk-approve`. Hanya catatan `perlu_verifikasi` dengan hasil cek terakhir `terpenuhi` yang diproses. */
export const bulkApproveBodySchema = z.object({
  noteIds: z.array(idSchema).min(1).max(500),
  note: z.string().trim().max(1000).optional()
});
export type BulkApproveBody = z.infer<typeof bulkApproveBodySchema>;

export const BULK_SKIP_REASONS = ["tidak_ditemukan", "tidak_ada_akses", "bukan_perlu_verifikasi", "belum_terpenuhi"] as const;
export type BulkSkipReason = (typeof BULK_SKIP_REASONS)[number];

export interface BulkApproveResponse {
  approvedNoteIds: string[];
  skipped: { noteId: string; reason: BulkSkipReason }[];
  /** CHR yang menjadi `completed` karena penutupan ini. */
  completedChrIds: string[];
}

// ---------------------------------------------------------------- Detail (S9)

/** Satu baris kartu bukti: nilai sebelum -> sesudah. */
export interface EvidenceRowDto {
  field: Evidence["fields"][number]["field"];
  before: string | number | null;
  after: string | number | null;
  /** `before !== after`. */
  changed: boolean;
  /** Nilai yang diharapkan ekspektasi untuk field ini (mis. akun tujuan 521111); null bila tidak berlaku. */
  expected: string | number | null;
}

export interface CheckEvidenceDto {
  checkId: string;
  result: CheckResult;
  checkedAt: number;
  snapshotVersionNo: number;
  snapshotLabel: string;
  rows: EvidenceRowDto[];
  /** Catatan engine (mis. ekspektasi manual tidak bisa dicek otomatis). */
  note: string | null;
}

export const TIMELINE_EVENT_TYPES = [
  "dibuat", "terbit", "adendum", "cek", "dikembalikan", "dijustifikasi", "justifikasi_diterima", "disetujui"
] as const;
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

/** Timeline dibangun dari `chr_notes`, `chr_documents.issued_at`, `follow_up_checks`, dan `audit_logs` (entity `chr_note`). Urut naik menurut waktu. */
export interface TimelineEventDto {
  type: TimelineEventType;
  at: number;
  /** null = Sistem. */
  actorName: string | null;
  /** `dibuat`: kategori saat dibuat. */
  category?: NoteCategory;
  /** `terbit` / `adendum`: nomor CHR dan versi. */
  chrDocumentNumber?: string | null;
  chrVersion?: number;
  /** `cek`: versi snapshot dan hasilnya. */
  snapshotVersionNo?: number;
  checkResult?: CheckResult;
  /** `dikembalikan` / `dijustifikasi` / `justifikasi_diterima` / `disetujui`: teks alasan atau catatan. */
  reason?: string | null;
  /** Status catatan setelah peristiwa. */
  statusAfter: NoteStatus;
}

/** Penanda "langkah berikutnya" (titik kosong di ujung timeline). */
export type NoteNextStep =
  | { kind: "keputusan_reviewer" }
  | { kind: "snapshot_revisi"; snapshotVersionNo: number }
  | { kind: "review_justifikasi" }
  | null;

export interface NoteActionPermissionsDto {
  canApprove: boolean;
  canReturn: boolean;
  /** Tombol "Terima justifikasi" aktif hanya bila justifikasi sudah terisi (status dijustifikasi). */
  canAcceptJustification: boolean;
  canJustify: boolean;
}

export interface TrackerNoteDetailResponse {
  note: ChrNoteDto;
  chrDocumentNumber: string | null;
  chrIssuedAt: number | null;
  organizationUnitId: string;
  /** Pembuat catatan, tanggal dibuat, dan kode aturan ada di `note.createdByName`, `note.createdAt`, `note.ruleCode`. */
  /** Cek terbaru (kartu "Bukti cek"); null bila belum pernah dicek. */
  latestEvidence: CheckEvidenceDto | null;
  /** Cek sebelumnya, terbaru di atas (tanpa `latestEvidence`). */
  previousEvidence: CheckEvidenceDto[];
  timeline: TimelineEventDto[];
  nextStep: NoteNextStep;
  permissions: NoteActionPermissionsDto;
  /** Nama Satker untuk teks "Isi atas nama Satker Contoh 02". */
  workUnitName: string | null;
}

// ---------------------------------------------------------------- Aksi

export const approveNoteBodySchema = z.object({
  note: z.string().trim().max(1000).optional()
});
export type ApproveNoteBody = z.infer<typeof approveNoteBodySchema>;

export const returnNoteBodySchema = z.object({
  reason: z.string().trim().min(5, "Alasan pengembalian minimal 5 karakter.").max(1000, "Alasan pengembalian maksimal 1000 karakter.")
});
export type ReturnNoteBody = z.infer<typeof returnNoteBodySchema>;

export const justifyNoteBodySchema = z.object({
  justification: z.string().trim().min(10, "Alasan Satker minimal 10 karakter.").max(2000, "Alasan Satker maksimal 2000 karakter.")
});
export type JustifyNoteBody = z.infer<typeof justifyNoteBodySchema>;

export const acceptJustificationBodySchema = approveNoteBodySchema;
export type AcceptJustificationBody = ApproveNoteBody;

/** Respons semua aksi catatan tunggal. */
export interface NoteActionResponse {
  note: ChrNoteDto;
  /** true bila catatan ini adalah yang terakhir ditutup dan CHR menjadi `completed`. */
  chrCompleted: boolean;
}
