/**
 * Siklus, snapshot, dan impor CSV. Layar: S3 (Siklus & Impor Data, dialog impor, hasil impor, state impor berjalan /
 * file sama / baris galat / belum ada siklus / belum ada snapshot).
 *
 * Endpoint yang sudah ada (EXISTS) hanya diperluas dengan bidang baru; bidang lama tidak berubah.
 */
import { z } from "zod";
import type {
  CheckResult, DiffSummary, Evidence, Expectation, NoteCategory, OrganizationUnitDto, ReviewCycleDto
} from "../base.js";
import { CYCLE_STAGES, CYCLE_STATUSES } from "../base.js";
import { dateInputSchema, idSchema, queryBoolean, type JobDto } from "./common.js";

// ---------------------------------------------------------------- Siklus (body CRUD, cermin skema di apps/api)

export const createCycleBodySchema = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
  stage: z.enum(CYCLE_STAGES),
  /** Default server: `TA <tahun> · <Pagu|Alokasi>`. */
  name: z.string().trim().min(3).max(150).optional(),
  adkDeadline: dateInputSchema.nullable().optional(),
  /** Hanya untuk impor data lama; di UI gunakan `POST /api/cycles/:id/dipa-issued`. */
  dipaIssuedAt: dateInputSchema.nullable().optional()
});
export type CreateCycleBody = z.infer<typeof createCycleBodySchema>;

export const updateCycleBodySchema = z.object({
  name: z.string().trim().min(3).max(150).optional(),
  adkDeadline: dateInputSchema.nullable().optional(),
  /** Diubah ke nilai non-null lewat PUT ditolak (400); gunakan endpoint `dipa-issued` supaya agregat publik ikut dibuat. */
  dipaIssuedAt: dateInputSchema.nullable().optional(),
  status: z.enum(CYCLE_STATUSES).optional()
});
export type UpdateCycleBody = z.infer<typeof updateCycleBodySchema>;

export interface CycleListResponse {
  cycles: ReviewCycleDto[];
}
export interface CycleResponse {
  cycle: ReviewCycleDto;
}

/** `POST /api/cycles/:id/dipa-issued`. `issuedAt` default = sekarang. */
export const markDipaIssuedBodySchema = z.object({
  issuedAt: dateInputSchema.optional()
});
export type MarkDipaIssuedBody = z.infer<typeof markDipaIssuedBodySchema>;

export interface MarkDipaIssuedResponse {
  cycle: ReviewCycleDto;
  /** Jumlah baris `public_metrics` yang dibuat. */
  publicMetricRows: number;
}

// ---------------------------------------------------------------- Snapshot

/**
 * Snapshot RKA satu eselon I. Semua bidang `GET /api/cycles/:id/snapshots` yang sudah ada dipertahankan
 * (termasuk `organizationUnitName` = `organization_units.short_name`); bidang setelah `diffSummary` baru.
 */
export interface SnapshotDto {
  id: string;
  cycleId: string;
  organizationUnitId: string;
  organizationUnitCode: string;
  /** `short_name` eselon I (nama yang dipakai UI sebagai label eselon I). */
  organizationUnitName: string;
  versionNo: number;
  /** `Awal` untuk v1, `Revisi` untuk berikutnya. */
  label: string;
  sourceFileName: string;
  /** Jumlah item tersimpan (tanpa baris header, tanpa baris galat). */
  rowCount: number;
  headerRowsSkipped: number;
  importedAt: number;
  /** null untuk snapshot pertama. */
  diffSummary: DiffSummary | null;
  // --- baru
  importedByUserId: string | null;
  importedByName: string | null;
  /** Jumlah baris galat yang dilewati (rincian di `ImportResultDto.rowErrors`). */
  rowErrorCount: number;
  /** Lama proses impor; null untuk snapshot hasil seed lama. */
  importDurationMs: number | null;
}

export interface SnapshotListResponse {
  snapshots: SnapshotDto[];
}
export interface SnapshotResponse {
  snapshot: SnapshotDto;
}

// ---------------------------------------------------------------- GET /api/cycles/:id/import-overview

/** Satu baris tabel "Snapshot · TA 2026 Alokasi" (eselon I x v1, v2, ...). */
export interface ImportOverviewRow {
  organizationUnit: OrganizationUnitDto;
  /** Jumlah Satker terdaftar di eselon I (teks "6 Satker sampel"). */
  satkerCount: number;
  /** Urut `versionNo` naik. Kosong = belum ada snapshot. */
  snapshots: SnapshotDto[];
  /** Nomor versi yang akan dibuat bila impor baru dilakukan (`max + 1`, atau 1). */
  nextVersionNo: number;
  /** Label yang akan dipakai: `Awal` bila `nextVersionNo = 1`, selain itu `Revisi`. */
  nextLabel: string;
}

export interface ImportOverviewResponse {
  cycle: ReviewCycleDto;
  rows: ImportOverviewRow[];
  /** Pengguna boleh menekan "Impor CSV" (reviewer/admin dan siklus `aktif`). */
  canImport: boolean;
}

// ---------------------------------------------------------------- POST /api/cycles/:id/snapshots (multipart)

/**
 * Field teks pada form multipart (selain `file`). Semuanya opsional: eselon I dan tahun ditentukan dari isi CSV
 * (BAES1, TAHUN). Bila dikirim, server memvalidasi kecocokannya dan menjawab 400 jika berbeda dengan isi berkas.
 */
export const snapshotUploadFieldsSchema = z.object({
  /** Eselon I yang dipilih di dialog. Harus sama dengan BAES1 di berkas. */
  organizationUnitId: idSchema.optional(),
  /** Nomor versi yang diharapkan UI (mis. 2). Harus sama dengan `nextVersionNo` saat diproses. */
  versionNo: z.coerce.number().int().min(1).optional(),
  /** `true` = proses di latar belakang, jawab 202 + `jobId` (untuk berkas besar). Default `false`. */
  async: queryBoolean.optional()
});
export type SnapshotUploadFields = z.infer<typeof snapshotUploadFieldsSchema>;

/** Respons sinkron (201 baru, 200 bila berkas yang sama sudah pernah diimpor). */
export interface SnapshotUploadResponse {
  snapshot: SnapshotDto;
  /** true = hash berkas sama dengan snapshot yang sudah ada; tidak ada data yang diproses ulang. */
  alreadyImported: boolean;
}

/** Respons 202 saat `async = true`. */
export interface SnapshotUploadAcceptedResponse {
  jobId: string;
}

export type ImportJobDto = JobDto<"import", SnapshotUploadResponse>;

// ---------------------------------------------------------------- GET /api/cycles/:id/snapshots/lookup

export const snapshotLookupQuerySchema = z.object({
  /** SHA-256 heksadesimal (huruf kecil, 64 karakter) dari berkas, dihitung di browser. */
  fileHash: z.string().trim().toLowerCase().regex(/^[0-9a-f]{64}$/, "Hash berkas harus SHA-256 heksadesimal.")
});
export type SnapshotLookupQuery = z.infer<typeof snapshotLookupQuerySchema>;

/** `snapshot = null` bila hash belum pernah diimpor. Dipakai dialog untuk menampilkan state "file sama sudah pernah diimpor" sebelum unggah. */
export interface SnapshotLookupResponse {
  snapshot: SnapshotDto | null;
}

// ---------------------------------------------------------------- GET /api/cycles/:id/snapshots/:snapshotId/result

export const IMPORT_ROW_ERROR_REASONS = ["bukan_angka", "wajib_diisi", "bernilai_negatif", "format_tidak_valid"] as const;
export type ImportRowErrorReason = (typeof IMPORT_ROW_ERROR_REASONS)[number];

export interface ImportRowError {
  /** Nomor baris di berkas CSV (baris header kolom = 1). */
  line: number;
  /** Nama kolom CSV, mis. `VOLKEG`, `HARGASAT`, `TOTAL`. */
  column: string;
  /** Nilai mentah di berkas; null/"" = kosong. */
  value: string | null;
  reason: ImportRowErrorReason;
  /** Pesan Indonesia dari validator (cadangan bila `reason = format_tidak_valid`). */
  message: string;
}

export interface ImportRuleHitCount {
  ruleId: string;
  /** `R01`..`R08`. */
  code: string;
  name: string;
  /** Jumlah item (distinct) di snapshot ini yang kena aturan. */
  itemCount: number;
}

/** Catatan CHR yang dicek ulang terhadap snapshot ini (hanya snapshot revisi, v >= 2). */
export interface ImportRecheckedNote {
  noteId: string;
  /** Uraian item. */
  title: string;
  workUnitName: string;
  category: NoteCategory;
  expectation: Expectation;
  result: CheckResult;
  evidence: Evidence;
}

/**
 * Hasil impor satu snapshot. Tetap bisa dibuka kapan saja ("Lihat hasil v2"); semua angka diturunkan dari data tersimpan
 * (`rka_documents`, `rule_hits`, `follow_up_checks`), kecuali `rowErrors`/`importDurationMs` (kolom baru).
 */
export interface ImportResultDto {
  snapshot: SnapshotDto;
  /** Baris yang dibaca termasuk baris header (`rowCount + headerRowsSkipped + rowErrorCount`). */
  rowsRead: number;
  headerRowsSkipped: number;
  itemsSaved: number;
  rowErrorCount: number;
  /** Dibatasi 1000 baris pertama; `rowErrorCount` tetap jumlah sebenarnya. */
  rowErrors: ImportRowError[];
  /** null untuk v1. `hilang` = ada di versi sebelumnya, tidak ada di snapshot ini. */
  diff: DiffSummary | null;
  /** `baru + berubah`: item yang dinilai ulang oleh aturan dan skor. v1: semua item. */
  itemsAssessed: number;
  ruleHits: ImportRuleHitCount[];
  /** Kosong untuk v1. */
  recheckedNotes: ImportRecheckedNote[];
  /** Jumlah catatan yang berpindah `menunggu_revisi` -> `perlu_verifikasi` oleh cek otomatis ini. */
  notesMovedToVerification: number;
}
