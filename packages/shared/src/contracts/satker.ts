/**
 * Progres per Satker (PIC UKI, tetapi dapat dibuka semua peran). Layar: S10.
 *
 * Aturan turunan (data-model.md bagian 6):
 * - Satker "siap diajukan" (per siklus): punya >= 1 catatan di CHR yang sudah terbit (`issued`/`completed`) dan SEMUA
 *   catatan itu `closed`. Satker tanpa catatan terbit = `tidak_ada_catatan` (tidak dihitung). Catatan `draf` tidak dihitung.
 * - "Terakhir bergerak": waktu terbaru dari (a) perubahan status catatan Satker itu, (b) pengisian justifikasi,
 *   (c) cek otomatis, (d) impor snapshot eselon I yang memuat item Satker itu, selama Satker punya catatan terbit.
 *   null bila `tidak_ada_catatan`.
 */
import { z } from "zod";
import type { CheckResult, ChrStatus, OrganizationUnitDto } from "../base.js";
import { idSchema, optionalIdSchema } from "./common.js";
import type { TrackerStatus } from "./tracker.js";

export const SATKER_READINESS = ["siap_diajukan", "belum_siap", "tidak_ada_catatan"] as const;
export type SatkerReadiness = (typeof SATKER_READINESS)[number];

export const SATKER_PROGRESS_SORTS = ["last_moved", "name", "open_notes"] as const;
export type SatkerProgressSort = (typeof SATKER_PROGRESS_SORTS)[number];

export const satkerProgressQuerySchema = z.object({
  cycleId: idSchema,
  /** Wajib bila pengguna punya lebih dari satu eselon I; PIC UKI dengan satu eselon I boleh mengosongkan. */
  organizationUnitId: optionalIdSchema,
  /** Default `last_moved`: yang paling lama tidak bergerak di atas; `tidak_ada_catatan` selalu paling bawah. */
  sort: z.enum(SATKER_PROGRESS_SORTS).default("last_moved")
});
export type SatkerProgressQuery = z.infer<typeof satkerProgressQuerySchema>;

export interface SatkerProgressRow {
  workUnitId: string;
  workUnitCode: string;
  workUnitName: string;
  /** Jumlah catatan terbit per status (tanpa `draf`, yang tidak ditampilkan). */
  counts: Record<TrackerStatus, number>;
  /** Jumlah catatan terbit (`sum(counts)`). */
  notesTotal: number;
  lastMovedAt: number | null;
  readiness: SatkerReadiness;
}

/** Catatan yang masih terbuka (belum `closed`), untuk kartu "Catatan masih terbuka". */
export interface SatkerOpenNotePreview {
  noteId: string;
  workUnitName: string | null;
  title: string;
  status: TrackerStatus;
  latestCheckResult: CheckResult | null;
}

export interface SatkerProgressSummary {
  satkerTotal: number;
  /** Satker dengan >= 1 catatan terbit ("2 dari 3"; penyebut = ini). */
  satkerWithNotes: number;
  satkerWithoutNotes: number;
  satkerReady: number;
  /** Catatan terbit yang belum closed. */
  openNotes: number;
  /** Sampai 3 catatan terbuka paling lama. */
  openNotesPreview: SatkerOpenNotePreview[];
  adkDeadline: number | null;
  /** Hari penuh sampai tenggat ADK (negatif bila lewat); null bila tenggat kosong. */
  daysToAdkDeadline: number | null;
}

export interface SatkerProgressResponse {
  organizationUnit: OrganizationUnitDto;
  cycleId: string;
  /** CHR eselon I untuk siklus ini; null bila belum ada. */
  chr: { id: string; documentNumber: string | null; status: ChrStatus } | null;
  summary: SatkerProgressSummary;
  /** Semua Satker eselon I (tidak berhalaman; maks. sekitar 220). */
  items: SatkerProgressRow[];
}
