/**
 * CHR (Catatan Hasil Reviu) per eselon I per tahap. Layar: S6 (editor draf, terkunci, dialog terbitkan), S7 (cetak A4).
 *
 * Sumber status = `chr_notes.status`. Dokumen hanya punya `draft | issued | completed`:
 * - `draft`     : semua catatan `draf`; dokumen boleh diubah.
 * - `issued`    : terbit dan terkunci; catatan lama tidak bisa diubah, hanya adendum.
 * - `completed` : semua catatan `closed` (diubah server dalam transaksi yang sama dengan penutupan catatan terakhir;
 *                 kembali ke `issued` bila adendum menambah catatan).
 */
import { z } from "zod";
import type {
  CheckResult, ChrStatus, CycleStage, Expectation, NoteCategory, NoteStatus, OrganizationUnitDto
} from "../base.js";
import { NOTE_CATEGORIES, expectationSchema } from "../base.js";
import { idSchema, optionalIdSchema } from "./common.js";

export type NoteStatusCounts = Record<NoteStatus, number>;

// ---------------------------------------------------------------- Helper murni (dipakai API dan UI)

/**
 * Penulisan ekspektasi untuk chip/tabel: `hapus_item`, `ganti_akun → 521111`, `turunkan_nilai ≤ 350000`,
 * `rinci_item`, `manual · <instruksi>`. Bukan teks lokal; sama di layar, cetak, dan CSV.
 */
export function expectationCode(expectation: Expectation): string {
  switch (expectation.type) {
    case "ganti_akun":
      return `ganti_akun → ${expectation.to}`;
    case "hapus_item":
      return "hapus_item";
    case "turunkan_nilai": {
      const parts: string[] = [];
      if (expectation.maxUnitPrice !== undefined) parts.push(`harga satuan ≤ ${expectation.maxUnitPrice}`);
      if (expectation.maxTotal !== undefined) parts.push(`total ≤ ${expectation.maxTotal}`);
      return `turunkan_nilai ${parts.join(", ")}`.trim();
    }
    case "rinci_item":
      return "rinci_item";
    case "manual":
      return `manual · ${expectation.instruction}`;
  }
}

/** Tahap di nomor CHR memakai kode siklus apa adanya (`pagu` / `alokasi`). */
export function buildChrNumber(input: { organizationCode: string; fiscalYear: number; stage: CycleStage; sequence: number }): string {
  return `CHR/${input.organizationCode}/${input.fiscalYear}/${input.stage}/${String(input.sequence).padStart(3, "0")}`;
}

const CHR_NUMBER_PATTERN = /^CHR\/([^/]+)\/(\d{4})\/(pagu|alokasi)\/(\d{3,})$/;
export function parseChrNumber(value: string): { organizationCode: string; fiscalYear: number; stage: CycleStage; sequence: number } | null {
  const match = CHR_NUMBER_PATTERN.exec(value);
  return match ? { organizationCode: match[1], fiscalYear: Number(match[2]), stage: match[3] as CycleStage, sequence: Number(match[4]) } : null;
}

/** Huruf judul kelompok di editor dan cetak: A, B, C, D menurut urutan `NOTE_CATEGORIES` di kelompok yang tidak kosong. */
export function groupLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

// ---------------------------------------------------------------- DTO

export interface ChrNoteDto {
  id: string;
  chrDocumentId: string;
  /** Nomor urut tampilan di dokumen (1..n lintas kelompok, urut kategori lalu `createdAt`). */
  number: number;
  /** null untuk catatan manual tanpa item. */
  rkaItemId: string | null;
  workUnitId: string | null;
  workUnitCode: string | null;
  workUnitName: string | null;
  /** Akun item pada snapshot yang menjadi dasar catatan; null bila tanpa item. */
  accountCode: string | null;
  /** Judul catatan: `chr_notes.title`, selain itu uraian item. */
  title: string;
  category: NoteCategory;
  text: string;
  expectation: Expectation;
  status: NoteStatus;
  /** Aturan asal flag; null untuk catatan manual / flag tanpa aturan. */
  ruleId: string | null;
  ruleCode: string | null;
  justification: string | null;
  closedAt: number | null;
  /** Hasil cek otomatis terakhir (null sebelum ada snapshot revisi). */
  latestCheckResult: CheckResult | null;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChrNoteGroupDto {
  category: NoteCategory;
  /** A, B, C... menurut urutan kelompok yang tampil. */
  letter: string;
  notes: ChrNoteDto[];
}

export interface ChrDocumentDto {
  id: string;
  cycleId: string;
  cycleName: string;
  fiscalYear: number;
  stage: CycleStage;
  organizationUnitId: string;
  organizationUnitCode: string;
  /** `short_name`. */
  organizationUnitName: string;
  status: ChrStatus;
  /** null sampai terbit. Format: `CHR/<BAES1>/<TA>/<tahap>/<urut>`. */
  documentNumber: string | null;
  recommendation: string | null;
  /** Tanggapan eselon I (diisi PIC UKI setelah terbit). */
  unitResponse: string | null;
  unitResponseByName: string | null;
  unitResponseAt: number | null;
  issuedAt: number | null;
  issuedByName: string | null;
  completedAt: number | null;
  /** Nomor versi terbaru (0 = belum ada; v1 dibuat saat terbit). */
  currentVersion: number;
  createdAt: number;
  updatedAt: number;
}

/** Hak aksi pengguna saat ini pada dokumen ini (dihitung server dari peran, scope, dan status). UI hanya menampilkan. */
export interface ChrPermissionsDto {
  canEditNotes: boolean;
  canEditRecommendation: boolean;
  canIssue: boolean;
  canAddAddendum: boolean;
  canRespond: boolean;
}

export interface ChrVersionSummaryDto {
  versionNumber: number;
  reason: "terbit" | "adendum";
  createdByName: string;
  createdAt: number;
  /** Jumlah catatan di versi itu. */
  notesCount: number;
  /** Alasan adendum (null untuk versi terbit). */
  addendumReason: string | null;
}

export interface ChrListItemDto {
  id: string;
  cycleId: string;
  organizationUnitId: string;
  organizationUnitCode: string;
  organizationUnitName: string;
  status: ChrStatus;
  documentNumber: string | null;
  notesByStatus: NoteStatusCounts;
  notesTotal: number;
  issuedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
}

export const chrListQuerySchema = z.object({
  cycleId: idSchema,
  organizationUnitId: optionalIdSchema,
  status: z.enum(["draft", "issued", "completed"]).optional()
});
export type ChrListQuery = z.infer<typeof chrListQuerySchema>;

export interface ChrListResponse {
  items: ChrListItemDto[];
  /** Eselon I di scope pengguna yang belum punya CHR di siklus ini (UI menawarkan "Buat CHR"). */
  organizationUnitsWithoutChr: OrganizationUnitDto[];
}

export interface ChrDetailResponse {
  document: ChrDocumentDto;
  groups: ChrNoteGroupDto[];
  notesByStatus: NoteStatusCounts;
  notesTotal: number;
  versions: ChrVersionSummaryDto[];
  permissions: ChrPermissionsDto;
}

// ---------------------------------------------------------------- Body

/** `POST /api/chr` (idempoten: bila sudah ada, 200 dengan dokumen yang ada). */
export const createChrBodySchema = z.object({
  cycleId: idSchema,
  organizationUnitId: idSchema
});
export type CreateChrBody = z.infer<typeof createChrBodySchema>;

export const noteTextSchema = z.string().trim().min(5, "Teks catatan minimal 5 karakter.").max(2000, "Teks catatan maksimal 2000 karakter.");

/** Catatan baru dari editor (tanpa melalui Risk Triage) atau dari adendum. */
export const createNoteBodySchema = z.object({
  category: z.enum(NOTE_CATEGORIES),
  text: noteTextSchema,
  expectation: expectationSchema,
  /** Judul pendek; default = uraian item bila `rkaItemId` ada. Wajib bila tanpa item. */
  title: z.string().trim().min(3).max(200).optional(),
  rkaItemId: idSchema.optional(),
  /** Wajib bila tanpa `rkaItemId`. Harus Satker di eselon I dokumen. */
  workUnitId: idSchema.optional()
}).refine((value) => value.rkaItemId !== undefined || (value.title !== undefined && value.workUnitId !== undefined), {
  message: "Catatan tanpa item wajib berisi judul dan Satker."
});
export type CreateNoteBody = z.infer<typeof createNoteBodySchema>;

/** `PATCH /api/chr/:id/notes/:noteId`. Minimal satu bidang. */
export const updateNoteBodySchema = z.object({
  category: z.enum(NOTE_CATEGORIES).optional(),
  text: noteTextSchema.optional(),
  expectation: expectationSchema.optional(),
  title: z.string().trim().min(3).max(200).optional()
}).refine((value) => Object.keys(value).length > 0, { message: "Tidak ada perubahan yang dikirim." });
export type UpdateNoteBody = z.infer<typeof updateNoteBodySchema>;

export interface ChrNoteResponse {
  note: ChrNoteDto;
}

/** `PUT /api/chr/:id/recommendation`. Boleh kosong (menghapus). Disimpan otomatis oleh UI. */
export const recommendationBodySchema = z.object({
  recommendation: z.string().trim().max(5000, "Rekomendasi maksimal 5000 karakter.")
});
export type RecommendationBody = z.infer<typeof recommendationBodySchema>;

/** `PUT /api/chr/:id/unit-response` (PIC UKI). */
export const unitResponseBodySchema = z.object({
  unitResponse: z.string().trim().min(1, "Tanggapan tidak boleh kosong.").max(5000, "Tanggapan maksimal 5000 karakter.")
});
export type UnitResponseBody = z.infer<typeof unitResponseBodySchema>;

export interface ChrDocumentResponse {
  document: ChrDocumentDto;
}

/** `POST /api/chr/:id/issue` tidak punya body. */
export interface ChrIssueResponse {
  document: ChrDocumentDto;
  version: ChrVersionSummaryDto;
  /** Jumlah catatan `draf` -> `menunggu_revisi`. */
  notesTransitioned: number;
}

/** `POST /api/chr/:id/addendum`. Adendum menambah catatan baru (langsung `menunggu_revisi`) dan/atau memperbarui rekomendasi. */
export const addendumBodySchema = z.object({
  /** Alasan adendum, dicatat di riwayat versi. */
  reason: z.string().trim().min(5, "Alasan adendum minimal 5 karakter.").max(1000),
  recommendation: z.string().trim().max(5000).optional(),
  notes: z.array(createNoteBodySchema).max(100).default([])
}).refine((value) => value.recommendation !== undefined || value.notes.length > 0, {
  message: "Adendum harus mengubah rekomendasi atau menambah catatan."
});
export type AddendumBody = z.infer<typeof addendumBodySchema>;

export interface ChrAddendumResponse {
  document: ChrDocumentDto;
  version: ChrVersionSummaryDto;
  notesAdded: number;
}

// ---------------------------------------------------------------- Versi

/** Isi `chr_versions.snapshot`. Bentuk sama untuk versi terbit dan adendum. */
export interface ChrVersionSnapshot {
  document: Pick<ChrDocumentDto, "documentNumber" | "recommendation" | "unitResponse" | "status" | "issuedAt">;
  /** Semua catatan pada saat versi dibuat (status saat itu). */
  notes: ChrNoteDto[];
  addendumReason: string | null;
}

export interface ChrVersionDetailResponse {
  version: ChrVersionSummaryDto;
  snapshot: ChrVersionSnapshot;
}

export interface ChrVersionListResponse {
  versions: ChrVersionSummaryDto[];
}

// ---------------------------------------------------------------- Cetak (S7)

export const chrPrintQuerySchema = z.object({
  /** Nomor versi; default = terbaru. Draf (belum ada versi) dicetak dari data saat ini. */
  version: z.coerce.number().int().min(1).optional()
});
export type ChrPrintQuery = z.infer<typeof chrPrintQuerySchema>;

export interface ChrPrintRow {
  number: number;
  workUnitName: string | null;
  /** Uraian item (judul catatan). */
  itemDescription: string;
  accountCode: string | null;
  text: string;
  expectation: Expectation;
}

export interface ChrPrintGroup {
  category: NoteCategory;
  letter: string;
  rows: ChrPrintRow[];
}

/** Kop dan penandatangan berasal dari konfigurasi server (variabel lingkungan `PRINT_*`), bukan dari basis data. */
export interface ChrPrintLetterhead {
  organizationName: string;
  unitName: string;
  address: string | null;
}
export interface ChrPrintSignatory {
  city: string;
  /** Mis. "Inspektur Jenderal". */
  title: string;
  /** null = tampilkan placeholder tanda tangan. */
  name: string | null;
  nip: string | null;
}

export interface ChrPrintResponse {
  letterhead: ChrPrintLetterhead;
  signatory: ChrPrintSignatory;
  /** null bila masih draf. */
  documentNumber: string | null;
  status: ChrStatus;
  organizationUnitName: string;
  fiscalYear: number;
  stage: CycleStage;
  /** Tanggal terbit (null bila draf). */
  issuedAt: number | null;
  versionNumber: number;
  groups: ChrPrintGroup[];
  recommendation: string | null;
  unitResponse: string | null;
  generatedAt: number;
}
