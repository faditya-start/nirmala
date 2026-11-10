/**
 * Tambahan auth, "Perlu tindakan", badge navigasi, dan data referensi untuk dropdown.
 * Layar: shell semua layar internal (sidebar, header), S1.
 */
import { z } from "zod";
import type { OrganizationUnitDto, SessionUser } from "../base.js";
import { optionalIdSchema } from "./common.js";

// ---------------------------------------------------------------- GET /api/auth/me (diperluas)

/** `SessionUser` + data yang dibutuhkan shell. Bidang lama (`id`, `name`, `role`) tetap ada. */
export interface SessionUserDetail extends SessionUser {
  username: string;
  /**
   * Teks setelah peran di footer sidebar ("Reviewer · Itjen", "PIC UKI · Ditjen Contoh A").
   * Reviewer, Pimpinan, Admin: `users.unit_label`. PIC UKI: `unit_label` bila ada, selain itu nama eselon I miliknya.
   * null bila tidak ada.
   */
  unitLabel: string | null;
  /** null = semua eselon I (Pimpinan, Admin); selain itu id eselon I dari `user_scopes`. */
  scopeOrganizationUnitIds: string[] | null;
}

export interface MeResponse {
  /** null bila belum masuk (perilaku lama: `{ user: null }` dengan status 200). */
  user: SessionUserDetail | null;
  /** Eselon I yang boleh dilihat pengguna (sudah disaring per scope). */
  organizationUnits: OrganizationUnitDto[];
}

// ---------------------------------------------------------------- GET /api/needs-action

export const needsActionQuerySchema = z.object({
  /** Siklus aktif di pemilih siklus. Kosong = siklus berstatus `aktif` terbaru. */
  cycleId: optionalIdSchema
});
export type NeedsActionQuery = z.infer<typeof needsActionQuerySchema>;

export interface NeedsActionItem {
  /** Nama antrean, mis. "Catatan perlu verifikasi". */
  label: string;
  /** Rute UI (lihat design/SCREENS.md), sudah membawa filter, mis. `/tracker?status=perlu_verifikasi`. */
  href: string;
  /** Selalu >= 1; antrean kosong tidak dikirim. */
  count: number;
}

/**
 * Badge "Perlu tindakan" di header. `count` = jumlah semua `items[].count`.
 *
 * Aturan per peran (siklus = `cycleId`, eselon I = scope pengguna):
 * - reviewer / admin:
 *   1. catatan `perlu_verifikasi`            -> `/tracker?status=perlu_verifikasi`
 *   2. CHR `draft` yang punya >= 1 catatan   -> `/chr` (atau `/chr/:id` bila hanya satu)
 *   3. item kena aturan & belum ditinjau      -> `/triage?onlyFlagged=true&decision=belum_ditinjau`
 * - uki:
 *   1. catatan `menunggu_revisi`                                -> `/tracker?status=menunggu_revisi`
 *   2. catatan `perlu_verifikasi` yang hasil cek terakhirnya bukan `terpenuhi` (bisa dijustifikasi) -> `/tracker?status=perlu_verifikasi`
 *   3. CHR `issued`/`completed` yang `unit_response` masih kosong -> `/chr/:id`
 * - leader: tidak ada tindakan (`count = 0`, `items = []`).
 */
export interface NeedsActionResponse {
  count: number;
  items: NeedsActionItem[];
}

// ---------------------------------------------------------------- GET /api/nav-counts

export const navCountsQuerySchema = needsActionQuerySchema;

/**
 * Angka kecil di sidebar. Dihitung untuk siklus dan scope pengguna.
 * - `triageUnreviewed`: item kena aturan, belum ditinjau (nav "Risk Triage").
 * - `trackerPending`: catatan `perlu_verifikasi` (nav "Smart Tracker").
 * Peran uki/leader: `triageUnreviewed = 0`. Peran leader: `trackerPending = 0`. Nilai 0 = badge disembunyikan.
 */
export interface NavCountsResponse {
  triageUnreviewed: number;
  trackerPending: number;
}

// ---------------------------------------------------------------- Referensi

/** Satker. `organizationUnitId` = eselon I induk. */
export interface WorkUnitDto {
  id: string;
  /** KDSATKER (6 digit). */
  code: string;
  name: string;
  organizationUnitId: string;
}

export const workUnitListQuerySchema = z.object({
  organizationUnitId: optionalIdSchema
});
export type WorkUnitListQuery = z.infer<typeof workUnitListQuerySchema>;

export interface DismissReasonDto {
  code: string;
  label: string;
}

export interface AccountDto {
  /** 6 digit. */
  code: string;
  name: string;
}

export const accountListQuerySchema = z.object({
  /** Cari kode (awalan) atau nama (mengandung). Kosong = 50 akun pertama menurut kode. */
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
export type AccountListQuery = z.infer<typeof accountListQuerySchema>;
