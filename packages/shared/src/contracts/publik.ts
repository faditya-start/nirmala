/**
 * Transparansi publik. Layar: P1 (beranda, statis, tanpa API), P2 (transparansi; desktop dan mobile memakai data yang sama).
 *
 * Tanpa login dan tanpa cookie. HANYA membaca tabel `public_metrics` (agregat), dan hanya untuk siklus yang `dipa_issued_at`-nya terisi.
 * Tidak pernah memuat item, nama Satker, atau rupiah per item.
 *
 * Aturan penggabungan (k = `PUBLIC_MIN_NOTES`, default 5): eselon I yang total catatan terbitnya < k digabung menjadi satu baris
 * `kind = "lainnya"`. Bila hasil gabungan hanya berasal dari SATU eselon I, eselon I terkecil berikutnya (yang >= k) ikut digabung
 * supaya baris "lainnya" tidak bisa ditelusuri ke satu unit. Bila seluruh siklus hanya punya satu eselon I, semuanya menjadi satu
 * baris `lainnya`.
 */
import { z } from "zod";
import type { CycleStage, NoteCategory } from "../base.js";
import { optionalIdSchema } from "./common.js";

export const PUBLIC_MIN_NOTES_DEFAULT = 5;

export interface PublicCycleDto {
  id: string;
  name: string;
  fiscalYear: number;
  stage: CycleStage;
  dipaIssuedAt: number;
}

/** `GET /api/public/cycles`: hanya siklus yang DIPA-nya terbit dan agregatnya sudah dibuat; terbaru di atas. */
export interface PublicCycleListResponse {
  cycles: PublicCycleDto[];
}

export const publicTransparencyQuerySchema = z.object({
  /** Kosong = siklus publik terbaru. */
  cycleId: optionalIdSchema
});
export type PublicTransparencyQuery = z.infer<typeof publicTransparencyQuerySchema>;

export interface PublicKpis {
  /** Catatan CHR yang diterbitkan pada siklus (draf tidak dihitung). */
  notesTotal: number;
  /** Catatan berstatus Closed sebelum tenggat ADK. */
  closedBeforeDeadline: number;
  /** Bulat 0-100 (`closedBeforeDeadline / notesTotal`); null bila `notesTotal = 0`. */
  closedBeforeDeadlinePercent: number | null;
  /** Median hari dari CHR terbit sampai closed (hanya catatan closed); null bila belum ada. */
  medianDaysToClose: number | null;
}

export interface PublicOrganizationRow {
  /** `eselon`: `label` = nama singkat eselon I. `lainnya`: gabungan eselon I kecil (UI menulis "Eselon I lainnya"; `label` = "Lainnya"). */
  kind: "eselon" | "lainnya";
  label: string;
  /** Kunci selalu lengkap. */
  byCategory: Record<NoteCategory, number>;
  total: number;
}

export interface PublicTransparencyResponse {
  cycle: PublicCycleDto;
  /** true bila data demo sintetis (konfigurasi `PUBLIC_DATA_SYNTHETIC=true`): UI menampilkan "Data pada demo ini sintetis". */
  synthetic: boolean;
  generatedAt: number;
  /** Ambang penggabungan yang dipakai. */
  minNotes: number;
  kpis: PublicKpis;
  rows: PublicOrganizationRow[];
  /** Baris total (jumlah semua kolom `byCategory`). */
  totals: { byCategory: Record<NoteCategory, number>; total: number };
}
