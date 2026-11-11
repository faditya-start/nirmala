import { z } from "zod";

export const PRODUCT_NAME = "NIRMALA";
export const PRODUCT_SUBTITLE = "Budget Review & Follow-up Intelligence";

export const RISK_CATEGORIES = ["low", "medium", "high"] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

/** Peran pengguna. `leader` = Pimpinan (Irjen, Kepala Biro). */
export const ROLES = ["reviewer", "uki", "leader", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Peran yang melihat semua eselon I tanpa perlu `user_scopes`. */
export const GLOBAL_SCOPE_ROLES: readonly Role[] = ["leader", "admin"];

export const CYCLE_STAGES = ["pagu", "alokasi"] as const;
export type CycleStage = (typeof CYCLE_STAGES)[number];

export const CYCLE_STATUSES = ["aktif", "selesai"] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

/** Kategori catatan: 3 kategori SIPEKA + Lainnya (rule-catalog.md §1). */
export const NOTE_CATEGORIES = ["EFISIENSI", "SATUAN_BIAYA", "AKUN", "LAINNYA"] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

/** Status melekat pada catatan, bukan pada dokumen CHR (mvp-scope.md §4.1). */
export const NOTE_STATUSES = ["draf", "menunggu_revisi", "perlu_verifikasi", "dijustifikasi", "closed"] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

export const CHR_STATUSES = ["draft", "issued", "completed"] as const;
export type ChrStatus = (typeof CHR_STATUSES)[number];

export const CHECK_RESULTS = ["terpenuhi", "belum_terpenuhi", "data_tidak_cukup", "item_tidak_ditemukan"] as const;
export type CheckResult = (typeof CHECK_RESULTS)[number];

export const RULE_KINDS = ["keyword", "keyword_wrong_account", "value_check", "blokir_history"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export const CHANGE_TYPES = ["baru", "berubah", "tetap"] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

/** Ekspektasi terstruktur per catatan (data-model.md §5). */
export const expectationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ganti_akun"), to: z.string().regex(/^\d{6}$/, "Kode akun harus 6 digit.") }),
  z.object({ type: z.literal("hapus_item") }),
  z.object({
    type: z.literal("turunkan_nilai"),
    maxUnitPrice: z.number().int().nonnegative().optional(),
    maxTotal: z.number().int().nonnegative().optional()
  }),
  z.object({ type: z.literal("rinci_item") }),
  z.object({ type: z.literal("manual"), instruction: z.string().trim().min(1).max(1000) })
]).refine(
  (value) => value.type !== "turunkan_nilai" || value.maxUnitPrice !== undefined || value.maxTotal !== undefined,
  { message: "Isi batas harga satuan atau batas total." }
);
export type Expectation = z.infer<typeof expectationSchema>;

/** Bukti cek tindak lanjut (data-model.md §5). */
export const evidenceFieldNames = ["account_code", "unit_price", "total_amount", "quantity", "unit", "description", "blokir_code"] as const;
export const evidenceSchema = z.object({
  fields: z.array(z.object({
    field: z.enum(evidenceFieldNames),
    before: z.union([z.string(), z.number(), z.null()]),
    after: z.union([z.string(), z.number(), z.null()]),
    /** Nilai yang diharapkan ekspektasi untuk field ini (akun tujuan, batas harga, ...); dihilangkan bila tidak berlaku. */
    expected: z.union([z.string(), z.number(), z.null()]).optional()
  })),
  note: z.string().optional()
});
export type Evidence = z.infer<typeof evidenceSchema>;

export interface DiffSummary {
  baru: number;
  berubah: number;
  tetap: number;
  hilang: number;
}

export interface HealthResponse {
  status: "ok";
  service: string;
  timestamp: string;
}

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
}

export interface AuthResponse {
  user: SessionUser;
}

export interface ApiError {
  error: string;
}

export interface OrganizationUnitDto {
  id: string;
  code: string;
  shortName: string;
  name: string;
}

export interface ReviewCycleDto {
  id: string;
  fiscalYear: number;
  stage: CycleStage;
  name: string;
  adkDeadline: number | null;
  dipaIssuedAt: number | null;
  status: CycleStatus;
}
