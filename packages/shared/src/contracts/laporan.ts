/**
 * Laporan: metrik proses, validasi engine terhadap kunci jawaban, ekspor CSV. Layar: S11.
 * Ekspor dan angka mengikuti scope pengguna (Reviewer/UKI: eselon I miliknya; Pimpinan/Admin: semua atau yang dipilih).
 */
import { z } from "zod";
import type { NoteCategory, OrganizationUnitDto, ReviewCycleDto } from "../base.js";
import { idSchema, optionalIdSchema } from "./common.js";

export const reportQuerySchema = z.object({
  cycleId: idSchema,
  /** Kosong = semua eselon I dalam scope pengguna. */
  organizationUnitId: optionalIdSchema
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

// ---------------------------------------------------------------- Metrik proses

export interface DismissReasonCount {
  code: string;
  label: string;
  count: number;
}

export interface ReportSummaryResponse {
  cycle: ReviewCycleDto;
  /** null = semua eselon I dalam scope. */
  organizationUnit: OrganizationUnitDto | null;
  dataAsOf: number | null;
  /** Catatan terbit (bukan draf): "Catatan terbit 3". */
  notesIssued: number;
  notesClosed: number;
  /** Bulat 0-100; null bila `notesIssued = 0`. "Closed sebelum diajukan": closed / issued per `dataAsOf`. */
  percentClosed: number | null;
  /** Median hari dari CHR terbit sampai catatan closed, hanya catatan closed; null bila belum ada. */
  medianDaysToClose: number | null;
  /** Jumlah catatan yang masuk hitungan median ("Dari 2 catatan yang sudah closed"). */
  closedSampleSize: number;
  /** true bila DIPA siklus sudah terbit atau tenggat ADK terlewat (angka final); selain itu "angka final setelah ADK diajukan". */
  isFinal: boolean;
  /** Nomor CHR terbit yang tercakup beserta tanggal terbit (urut terbit). */
  chrDocuments: { documentNumber: string | null; issuedAt: number }[];
  /** Catatan terbit per kategori; kunci selalu lengkap. */
  notesByCategory: Record<NoteCategory, number>;
  /** Alasan dismiss, urut jumlah menurun; hanya yang count > 0. */
  dismissReasons: DismissReasonCount[];
  /** Jumlah item di-dismiss dan item kena aturan (subjudul "22 item di-dismiss dari 108 item kena aturan"). */
  dismissedItems: number;
  flaggedItems: number;
}

// ---------------------------------------------------------------- Validasi engine

export const ANSWER_KEY_CODES = ["L1", "L2", "L3"] as const;
export type AnswerKeyCode = (typeof ANSWER_KEY_CODES)[number];

export interface EngineValidationSet {
  code: AnswerKeyCode;
  /** Mis. "Catatan akun dan lainnya". */
  title: string;
  /** Mis. "Item berlabel di snapshot Awal". */
  description: string;
  /** `recall` untuk L1/L2; `precision_at_n` untuk L3 (label lemah). */
  metric: "recall" | "precision_at_n";
  totalItems: number;
  /** Item kunci jawaban yang kena >= 1 aturan (recall) / yang ada di N teratas (precision@N). */
  caught: number;
  /** 0-1; null bila `totalItems = 0`. Untuk `precision_at_n`: `caught / n`. */
  value: number | null;
  /** Hanya `precision_at_n`. */
  n: number | null;
  /** Kode aturan yang menangkap, urut kode. */
  ruleCodes: string[];
  missedCount: number;
}

export interface EngineValidationResponse {
  /** true bila data berasal dari seed sintetis (UI menampilkan catatan "Angka di halaman ini dari data sintetis demo"). */
  synthetic: boolean;
  sets: EngineValidationSet[];
  /** Teks catatan kaki dari metadata kunci jawaban (mis. contoh item belum tertangkap), null bila tidak ada. Tidak pernah memuat nama Satker atau nilai rupiah. */
  note: string | null;
}

// ---------------------------------------------------------------- Ekspor CSV

export const REPORT_CSV_DATASETS = ["catatan", "ringkasan"] as const;
export type ReportCsvDataset = (typeof REPORT_CSV_DATASETS)[number];

export const reportExportQuerySchema = reportQuerySchema.extend({
  dataset: z.enum(REPORT_CSV_DATASETS).default("catatan")
});
export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;

/** Kolom CSV `catatan` (satu baris per catatan terbit; draf tidak diekspor). Header persis seperti di bawah, UTF-8 dengan BOM, pemisah koma. */
export const REPORT_NOTES_CSV_COLUMNS = [
  "nomor_chr", "eselon_i_kode", "eselon_i", "satker_kode", "satker", "akun", "uraian_item", "kategori", "kode_aturan",
  "ekspektasi", "status", "hasil_cek_terakhir", "diterbitkan", "ditutup", "umur_hari"
] as const;
/** Kolom CSV `ringkasan`: satu baris per (dimensi, kunci), dimensi ∈ `kategori` | `status` | `alasan_dismiss`. */
export const REPORT_SUMMARY_CSV_COLUMNS = ["dimensi", "kunci", "jumlah"] as const;
