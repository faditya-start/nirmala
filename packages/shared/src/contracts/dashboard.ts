/**
 * Dashboard. Layar: S2 varian reviewer (`czg1z`) dan pimpinan (`AUOc8`).
 *
 * Satu endpoint, satu bentuk data. Varian ditentukan oleh peran/scope:
 * - reviewer, uki: hanya eselon I miliknya (`scopeKind = "own"`).
 * - leader: semua eselon I, hanya baca (`scopeKind = "all"`); admin juga `all`.
 * Catatan `draf` ikut dihitung di dashboard (kartu "Catatan per status" dan distribusi kategori) sesuai desain pimpinan.
 */
import { z } from "zod";
import type { CheckResult, ChrStatus, NoteCategory, ReviewCycleDto } from "../base.js";
import { idSchema, optionalIdSchema } from "./common.js";
import type { NoteStatusCounts } from "./chr.js";

export const dashboardQuerySchema = z.object({
  cycleId: idSchema,
  /** Menyaring ke satu eselon I (klik baris tabel membuka Risk Triage, bukan dashboard, jadi opsional). */
  organizationUnitId: optionalIdSchema
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export interface DashboardKpis {
  /** Item di snapshot terbaru semua eselon I dalam cakupan ("12.702"). */
  itemsAnalyzed: number;
  /** Item kena >= 1 aturan aktif ("108"; persentase dihitung UI = flagged / analyzed). */
  itemsFlagged: number;
  /** Satker siap diajukan dan Satker yang punya catatan terbit ("2 dari 3"). */
  satkerReady: number;
  satkerWithNotes: number;
  satkerTotal: number;
  adkDeadline: number | null;
  /** Hari penuh sampai tenggat ADK (negatif bila lewat); null bila tenggat kosong. */
  daysToAdkDeadline: number | null;
}

export interface DashboardSnapshotRef {
  organizationUnitId: string;
  organizationUnitName: string;
  versionNo: number;
  label: string;
}

export const DASHBOARD_ACTION_KINDS = [
  "perlu_verifikasi", "chr_draf", "menunggu_revisi", "belum_terpenuhi", "tanggapan_belum_diisi"
] as const;
export type DashboardActionKind = (typeof DASHBOARD_ACTION_KINDS)[number];

/** Kartu "Perlu tindakan saya" (sumber sama dengan `/api/needs-action`, tetapi dengan contoh isi). Hanya kartu dengan `count > 0` atau `kind = chr_draf` (ditampilkan "0 CHR"). */
export interface DashboardActionCard {
  kind: DashboardActionKind;
  count: number;
  href: string;
  /** Catatan terlama yang menunggu (untuk kinds berbasis catatan). */
  oldestNote: {
    noteId: string;
    title: string;
    workUnitName: string | null;
    /** Hari menunggu sejak status berubah / dicek. */
    waitingDays: number;
    latestCheckResult: CheckResult | null;
  } | null;
  /** `chr_draf`: CHR terbit terakhir (untuk teks "sudah terbit pada 4 Nov 2026"). */
  lastIssuedChr: { documentNumber: string | null; issuedAt: number } | null;
}

export interface DashboardOrganizationRow {
  organizationUnitId: string;
  organizationUnitCode: string;
  organizationUnitName: string;
  satkerCount: number;
  /** Snapshot terbaru; null = belum ada snapshot ("Belum diimpor"). */
  snapshot: { versionNo: number; label: string } | null;
  /** null bila belum ada snapshot. */
  itemsFlagged: number | null;
  /** Catatan terbit yang belum closed. null bila belum ada snapshot. */
  notesOpen: number | null;
  notesDraft: number;
  notesClosed: number;
  /** Catatan terbit (bukan draf): penyebut progres ("2 dari 3 catatan closed"). */
  notesIssued: number;
  /** Bulat 0-100; null bila `notesIssued = 0`. */
  percentClosed: number | null;
  chrStatus: ChrStatus | null;
  chrDocumentNumber: string | null;
}

export interface DashboardResponse {
  cycle: ReviewCycleDto;
  scopeKind: "own" | "all";
  /** Waktu data terbaru (impor atau perubahan catatan) untuk "data per 9 Nov 2026". null bila belum ada data. */
  dataAsOf: number | null;
  /** Nama eselon I yang tercakup (subjudul "Ditjen Contoh A"); `scopeKind = all` -> semua. */
  organizationUnitNames: string[];
  /** Snapshot terbaru per eselon I yang punya snapshot. */
  snapshots: DashboardSnapshotRef[];
  kpis: DashboardKpis;
  /** Termasuk `draf`. */
  notesByStatus: NoteStatusCounts;
  /** Termasuk `draf`. Kunci selalu lengkap (nol bila kosong). */
  notesByCategory: Record<NoteCategory, number>;
  /** Nomor CHR terbit yang tercakup (subjudul "Catatan CHR ... per status"). */
  chrDocumentNumbers: string[];
  actions: DashboardActionCard[];
  /** Satu baris per eselon I dalam cakupan, urut kode. */
  organizations: DashboardOrganizationRow[];
}
