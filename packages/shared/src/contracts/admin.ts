/**
 * Administrasi (hanya peran admin). Layar: S12a katalog aturan (+ panel edit), S12b bobot skor, S12c pengguna,
 * S12d siklus (lihat juga `impor.ts` untuk body siklus), S12e audit log.
 */
import { z } from "zod";
import type { Expectation, NoteCategory, OrganizationUnitDto, ReviewCycleDto, Role, RuleKind } from "../base.js";
import { NOTE_CATEGORIES, ROLES, expectationSchema } from "../base.js";
import { dateInputSchema, idSchema, optionalIdSchema, paginationQuerySchema, type JobDto, type Pagination } from "./common.js";
import { FACTOR_CODES, type FactorCode } from "./triage.js";

// ---------------------------------------------------------------- S12a Katalog aturan

const regexString = z.string().trim().min(1).max(2000).refine((value) => {
  try { new RegExp(value, "i"); return true; } catch { return false; }
}, "Pola tidak valid (bukan ekspresi reguler yang benar).");

const accountPrefix = z.string().trim().regex(/^\d{2,6}$/, "Akun atau awalan akun harus 2-6 digit.");

/** Parameter per jenis aturan (rule-catalog.md bagian 2; bentuk sama dengan seed `apps/api/src/db/seeds/rules.ts`). */
export const keywordRuleParamsSchema = z.object({
  /** Semua pola harus cocok pada uraian. */
  all: z.array(regexString).min(1).max(10),
  none: z.array(regexString).max(10).optional(),
  akunPrefix: accountPrefix.optional()
}).strict();
export const keywordWrongAccountRuleParamsSchema = z.object({
  include: regexString,
  exclude: regexString.optional(),
  /** Awalan/kode akun yang dianggap salah. */
  akunSalah: z.array(accountPrefix).min(1).max(30),
  akunSalahKecuali: z.array(accountPrefix).max(30).optional(),
  akunBenar: z.string().regex(/^\d{6}$/, "Akun benar harus 6 digit."),
  /** Harga satuan minimum (rupiah) agar aturan berlaku (mis. batas kapitalisasi R06). */
  minUnitPrice: z.number().int().nonnegative().optional()
}).strict();
export const VALUE_CHECK_CONDITIONS = ["volume_zero_total_positive"] as const;
export const valueCheckRuleParamsSchema = z.object({
  condition: z.enum(VALUE_CHECK_CONDITIONS)
}).strict();
export const blokirHistoryRuleParamsSchema = z.object({
  /** true = aturan hanya dievaluasi di snapshot revisi (v >= 2). */
  onlyRevision: z.boolean()
}).strict();

export const ruleParamsSchemas = {
  keyword: keywordRuleParamsSchema,
  keyword_wrong_account: keywordWrongAccountRuleParamsSchema,
  value_check: valueCheckRuleParamsSchema,
  blokir_history: blokirHistoryRuleParamsSchema
} as const satisfies Record<RuleKind, z.ZodTypeAny>;

export type RuleParamsByKind = { [K in RuleKind]: z.infer<(typeof ruleParamsSchemas)[K]> };

/** Validasi `params` sesuai `kind`. Mengembalikan galat pertama sebagai pesan, atau data yang sudah bersih. */
export function parseRuleParams<K extends RuleKind>(kind: K, params: unknown): { ok: true; data: RuleParamsByKind[K] } | { ok: false; error: string } {
  const parsed = ruleParamsSchemas[kind].safeParse(params);
  return parsed.success ? { ok: true, data: parsed.data as RuleParamsByKind[K] } : { ok: false, error: parsed.error.issues[0]?.message ?? "Parameter aturan tidak valid." };
}

export interface RuleAdminDto {
  id: string;
  /** `R01`..`R08`. */
  code: string;
  name: string;
  category: NoteCategory;
  kind: RuleKind;
  params: Record<string, unknown>;
  reasonTemplate: string;
  source: string;
  defaultExpectation: Expectation | null;
  active: boolean;
  validYear: number | null;
  validationNote: string | null;
  /** `validationNote` terisi: kolom Validasi "Perlu validasi". */
  needsValidation: boolean;
  /** `params.onlyRevision = true` (teks "Hanya snapshot revisi"). */
  appliesToRevisionOnly: boolean;
  /** Jumlah item (distinct) yang kena aturan di snapshot terbaru semua eselon I pada siklus `cycleId`. */
  hitCount: number;
  updatedAt: number;
}

export const ruleListQuerySchema = z.object({
  /** Siklus untuk hitungan hit. Kosong = siklus aktif terbaru. */
  cycleId: optionalIdSchema
});
export type RuleListQuery = z.infer<typeof ruleListQuerySchema>;

export interface RuleListResponse {
  /** Siklus yang dipakai untuk `hitCount`; null bila belum ada siklus. */
  cycle: ReviewCycleDto | null;
  rules: RuleAdminDto[];
  totalRules: number;
  activeRules: number;
}

/**
 * `PUT /api/admin/rules/:id`. `kind` dan `code` tidak bisa diubah. `params` divalidasi dengan `parseRuleParams(rule.kind, params)`.
 * Perubahan berlaku untuk impor berikutnya dan untuk "hitung ulang siklus" (`recalculate`); tidak mengubah `rule_hits` yang sudah ada.
 */
export const updateRuleBodySchema = z.object({
  name: z.string().trim().min(3).max(200).optional(),
  category: z.enum(NOTE_CATEGORIES).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  reasonTemplate: z.string().trim().min(10).max(1000).optional(),
  defaultExpectation: expectationSchema.nullable().optional(),
  active: z.boolean().optional(),
  validationNote: z.string().trim().max(1000).nullable().optional()
}).refine((value) => Object.keys(value).length > 0, { message: "Tidak ada perubahan yang dikirim." });
export type UpdateRuleBody = z.infer<typeof updateRuleBodySchema>;

/** `PUT /api/admin/rules/:id/active` (sakelar di tabel). */
export const toggleRuleBodySchema = z.object({ active: z.boolean() });
export type ToggleRuleBody = z.infer<typeof toggleRuleBodySchema>;

export interface RuleResponse {
  rule: RuleAdminDto;
}

// ---------------------------------------------------------------- S12b Bobot skor

export type RiskWeightsDto = Record<FactorCode, number>;

export interface RiskConfigParamsDto {
  /** Skor tetap per akun rawan (F2). */
  riskyAccounts: Record<string, number>;
  /** Ambang total satuan paket/LS/KEG tanpa rincian (F4), rupiah. */
  packageThreshold: number;
  /** Minimal Satker pembanding (F1). */
  peerMinSatker: number;
}

export interface RiskConfigDto {
  id: string;
  /** Label versi (`risk_config.version`), mis. "1", "2". Urut naik; versi terbaru = aktif. */
  version: string;
  weights: RiskWeightsDto;
  thresholds: { medium: number; high: number };
  params: RiskConfigParamsDto;
  createdByName: string | null;
  createdAt: number;
  /** true untuk versi terbaru. */
  active: boolean;
}

export interface FactorMetaDto {
  code: FactorCode;
  key: "F1" | "F2" | "F3" | "F4" | "F5";
  label: string;
  /** Penjelasan satu baris ("Rasio harga satuan terhadap median Satker lain"). */
  description: string;
}

export interface RiskConfigResponse {
  active: RiskConfigDto;
  /** Terbaru di atas, termasuk yang aktif. */
  versions: RiskConfigDto[];
  factors: FactorMetaDto[];
}

/** `POST /api/admin/risk-config` -> versi baru (hanya insert). Bobot bulat, jumlah tepat 100, ambang `0 <= medium < high <= 100`. */
export const createRiskConfigBodySchema = z.object({
  weights: z.object(Object.fromEntries(FACTOR_CODES.map((code) => [code, z.number().int().min(0).max(100)])) as Record<FactorCode, z.ZodNumber>),
  thresholds: z.object({ medium: z.number().int().min(0).max(100), high: z.number().int().min(0).max(100) }),
  /** Kosong = salin dari versi aktif. */
  params: z.object({
    riskyAccounts: z.record(z.string().regex(/^\d{6}$/), z.number().min(0).max(100)),
    packageThreshold: z.number().int().nonnegative(),
    peerMinSatker: z.number().int().min(2).max(50)
  }).optional()
}).superRefine((value, ctx) => {
  const sum = Object.values(value.weights).reduce((total, weight) => total + weight, 0);
  if (sum !== 100) ctx.addIssue({ code: "custom", path: ["weights"], message: "Jumlah bobot faktor harus 100%." });
  if (value.thresholds.medium >= value.thresholds.high) ctx.addIssue({ code: "custom", path: ["thresholds"], message: "Ambang sedang harus lebih kecil dari ambang tinggi." });
});
export type CreateRiskConfigBody = z.infer<typeof createRiskConfigBodySchema>;

export interface RiskConfigCreatedResponse {
  config: RiskConfigDto;
}

/** `POST /api/admin/risk-config/recalculate`: menjalankan ulang aturan aktif + skor (versi aktif) untuk snapshot terbaru semua eselon I pada siklus. */
export const recalculateBodySchema = z.object({
  cycleId: idSchema
});
export type RecalculateBody = z.infer<typeof recalculateBodySchema>;

export interface RecalculateResult {
  cycleId: string;
  riskConfigId: string;
  riskConfigVersion: string;
  itemsAssessed: number;
  ruleHits: number;
  durationMs: number;
}
export type RecalculateJobDto = JobDto<"recalculate", RecalculateResult>;

/** Respons 202. Selesai/gagal dibaca lewat `GET /api/jobs/:jobId`. */
export interface RecalculateAcceptedResponse {
  jobId: string;
}

// ---------------------------------------------------------------- S12c Pengguna (+ akses eselon I)

/** `GET /api/users` (diperluas; bidang lama `id`, `username`, `displayName`, `role`, `createdAt` tetap ada). */
export interface UserAdminDto {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  /** Sakelar "Aktif". Pengguna nonaktif tidak bisa masuk dan sesinya dihapus. */
  active: boolean;
  unitLabel: string | null;
  /** Eselon I di `user_scopes` (kosong untuk leader/admin: mereka melihat semua). */
  organizationUnitIds: string[];
  organizationUnits: OrganizationUnitDto[];
  /** true untuk leader/admin ("Semua eselon I"). */
  allOrganizations: boolean;
  createdAt: number;
}

export interface UserListResponse {
  users: UserAdminDto[];
}

const passwordSchema = z.string().min(12, "Kata sandi minimal 12 karakter.").max(200);

/** `POST /api/users` (diperluas). Reviewer dan UKI wajib punya >= 1 eselon I. */
export const createUserBodySchema = z.object({
  username: z.string().trim().min(3).max(100),
  displayName: z.string().trim().min(2).max(150),
  role: z.enum(ROLES),
  password: passwordSchema,
  unitLabel: z.string().trim().max(100).nullable().optional(),
  organizationUnitIds: z.array(idSchema).max(50).default([])
}).superRefine((value, ctx) => {
  if ((value.role === "reviewer" || value.role === "uki") && value.organizationUnitIds.length === 0) {
    ctx.addIssue({ code: "custom", path: ["organizationUnitIds"], message: "Pilih minimal satu eselon I untuk peran ini." });
  }
});
export type CreateUserBody = z.infer<typeof createUserBodySchema>;

/** `PUT /api/users/:id` (diperluas). */
export const updateUserBodySchema = z.object({
  displayName: z.string().trim().min(2).max(150),
  password: passwordSchema.optional(),
  unitLabel: z.string().trim().max(100).nullable().optional()
});
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

/** `PUT /api/users/:id/scopes`: mengganti seluruh daftar eselon I pengguna. */
export const setUserScopesBodySchema = z.object({
  organizationUnitIds: z.array(idSchema).max(50)
});
export type SetUserScopesBody = z.infer<typeof setUserScopesBodySchema>;

/** `PUT /api/users/:id/active`. Admin tidak boleh menonaktifkan dirinya sendiri (409). */
export const setUserActiveBodySchema = z.object({ active: z.boolean() });
export type SetUserActiveBody = z.infer<typeof setUserActiveBodySchema>;

export interface UserResponse {
  user: UserAdminDto;
}

// ---------------------------------------------------------------- S12e Audit log

/**
 * Kode aksi audit (format `<entitas>.<kata_kerja>`, snake_case). Entri lama memakai gaya yang sama. UI memetakan kode ke label.
 * Setiap aksi di bawah WAJIB menulis satu baris `audit_logs` dalam transaksi yang sama dengan perubahan datanya.
 */
export const AUDIT_ACTIONS = [
  // sudah ada
  "auth.login", "auth.login_failed", "user.created", "user.updated", "user.role_changed",
  "cycle.created", "cycle.updated", "cycle.deleted", "snapshot.imported",
  // fase 3
  "item.confirmed", "item.dismissed", "item.decision_reverted", "rule.updated", "rule.toggled",
  "risk_config.created", "risk_config.recalculated",
  // fase 4
  "chr.created", "chr.note_created", "chr.note_updated", "chr.note_deleted", "chr.recommendation_updated",
  "chr.issued", "chr.unit_response_updated", "chr.addendum_added", "chr.completed",
  // fase 5
  "note.checked", "note.approved", "note.returned", "note.justified", "note.justification_accepted",
  // fase 6
  "user.scopes_changed", "user.activated", "user.deactivated", "cycle.dipa_issued", "cycle.dipa_retracted", "public_metrics.generated"
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = ["user", "review_cycle", "rka_document", "rka_item", "chr_document", "chr_note", "rule", "risk_config", "public_metrics"] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** `GET /api/audit-logs` (diperluas). `action` kini dicocokkan persis; sebelumnya "mengandung". */
export const auditLogQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().min(1).max(100).optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
  actorUserId: optionalIdSchema,
  /** Rentang waktu (epoch ms atau tanggal ISO); `to` inklusif. */
  from: dateInputSchema.optional(),
  to: dateInputSchema.optional()
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export interface AuditLogEntryDto {
  /** Baru. */
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  /** Ringkasan satu kalimat (kolom "Ringkasan"). */
  detail: string;
  before: unknown;
  after: unknown;
  createdAt: number;
  /** Nama pengguna, atau "Sistem" bila `actorUserId` null. */
  actor: string;
  /** Baru. */
  actorUserId: string | null;
}

export interface AuditLogListResponse {
  logs: AuditLogEntryDto[];
  pagination: Pagination;
}

/** `GET /api/audit-logs/facets`: isi dropdown filter. Hanya nilai yang pernah muncul. */
export interface AuditLogFacetsResponse {
  actions: string[];
  entityTypes: string[];
  actors: { id: string; name: string }[];
}

// S12d (siklus: buat, ubah, tandai DIPA terbit) memakai DTO dan body di `impor.ts`.
