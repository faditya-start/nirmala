/**
 * Skema NIRMALA MVP. Satu-satunya sumber skema; migrasi dibuat dengan `drizzle-kit generate`.
 * Mengikuti docs/data-model.md. Waktu = integer ms, uang = integer rupiah, JSON = text mode json.
 */
import type {
  ChangeType, CheckResult, ChrStatus, CycleStage, CycleStatus, DiffSummary, Evidence,
  Expectation, ImportRowError, NoteCategory, NoteStatus, Role, RuleKind
} from "@nirmala/shared";
import { isNotNull } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

const ms = (name: string) => integer(name);

// ---------------------------------------------------------------- Organisasi & akses

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role").$type<Role>().notNull(),
  passwordHash: text("password_hash").notNull(),
  /** Pengguna nonaktif tidak bisa masuk (D1). */
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  /** Teks setelah peran di footer sidebar, mis. "Itjen" (D1). */
  unitLabel: text("unit_label"),
  createdAt: ms("created_at").notNull()
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: ms("expires_at").notNull(),
  createdAt: ms("created_at").notNull()
});

/** Eselon I. `code` = BAES1 (mis. 14504). */
export const organizationUnits = sqliteTable("organization_units", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  shortName: text("short_name").notNull(),
  name: text("name").notNull(),
  createdAt: ms("created_at").notNull()
});

export const userScopes = sqliteTable("user_scopes", {
  userId: text("user_id").notNull().references(() => users.id),
  organizationUnitId: text("organization_unit_id").notNull().references(() => organizationUnits.id)
}, (table) => [primaryKey({ columns: [table.userId, table.organizationUnitId] })]);

/** Satker. `code` = KDSATKER (6 digit). */
export const workUnits = sqliteTable("work_units", {
  id: text("id").primaryKey(),
  organizationUnitId: text("organization_unit_id").notNull().references(() => organizationUnits.id),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  createdAt: ms("created_at").notNull()
}, (table) => [index("work_units_org_idx").on(table.organizationUnitId)]);

/** Referensi akun BAS. */
export const accounts = sqliteTable("accounts", {
  code: text("code").primaryKey(),
  name: text("name").notNull()
});

// ---------------------------------------------------------------- Siklus & data anggaran

export const reviewCycles = sqliteTable("review_cycles", {
  id: text("id").primaryKey(),
  fiscalYear: integer("fiscal_year").notNull(),
  stage: text("stage").$type<CycleStage>().notNull(),
  name: text("name").notNull(),
  adkDeadline: ms("adk_deadline"),
  dipaIssuedAt: ms("dipa_issued_at"),
  status: text("status").$type<CycleStatus>().notNull().default("aktif"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: ms("created_at").notNull()
}, (table) => [uniqueIndex("review_cycles_year_stage_idx").on(table.fiscalYear, table.stage)]);

/** Snapshot RKA per eselon I per siklus. `file_hash` unik → impor idempoten. */
export const rkaDocuments = sqliteTable("rka_documents", {
  id: text("id").primaryKey(),
  cycleId: text("cycle_id").notNull().references(() => reviewCycles.id),
  organizationUnitId: text("organization_unit_id").notNull().references(() => organizationUnits.id),
  versionNo: integer("version_no").notNull(),
  label: text("label").notNull(),
  sourceFileName: text("source_file_name").notNull(),
  fileHash: text("file_hash").notNull().unique(),
  rowCount: integer("row_count").notNull(),
  headerRowsSkipped: integer("header_rows_skipped").notNull().default(0),
  importedBy: text("imported_by").references(() => users.id),
  importedAt: ms("imported_at").notNull(),
  diffSummary: text("diff_summary", { mode: "json" }).$type<DiffSummary>(),
  /** Lama proses impor (ms); null untuk snapshot lama (D2). */
  importDurationMs: integer("import_duration_ms"),
  /** Jumlah baris yang dilewati karena tidak valid; rinciannya (maks. 1000) di `rowErrors` (D2). */
  rowErrorCount: integer("row_error_count").notNull().default(0),
  rowErrors: text("row_errors", { mode: "json" }).$type<ImportRowError[]>()
}, (table) => [
  uniqueIndex("rka_documents_version_idx").on(table.cycleId, table.organizationUnitId, table.versionNo),
  index("rka_documents_org_idx").on(table.organizationUnitId)
]);

export interface HierarchyNames { program?: string; activity?: string; output?: string; suboutput?: string; component?: string }

export const rkaItems = sqliteTable("rka_items", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => rkaDocuments.id),
  workUnitId: text("work_unit_id").notNull().references(() => workUnits.id),
  programCode: text("program_code").notNull(),
  activityCode: text("activity_code").notNull(),
  outputCode: text("output_code").notNull(),
  suboutputCode: text("suboutput_code").notNull(),
  componentCode: text("component_code").notNull(),
  subcomponentCode: text("subcomponent_code").notNull(),
  subcomponentName: text("subcomponent_name"),
  /** Nama tingkat hierarki dari baris judul CSV bila ada (D4). */
  hierarchyNames: text("hierarchy_names", { mode: "json" }).$type<HierarchyNames>(),
  accountCode: text("account_code").notNull(),
  description: text("description").notNull(),
  consItem: text("cons_item"),
  nomorItem: text("nomor_item"),
  quantity: real("quantity").notNull(),
  unit: text("unit"),
  unitPrice: integer("unit_price").notNull(),
  totalAmount: integer("total_amount").notNull(),
  volumeDetail: text("volume_detail", { mode: "json" }).$type<Record<string, string | number | null>>(),
  blokirCode: text("blokir_code"),
  blokirAmount: integer("blokir_amount"),
  itemKey: text("item_key").notNull(),
  sipekaIdItem: text("sipeka_id_item"),
  changeType: text("change_type").$type<ChangeType>().notNull().default("baru"),
  previousItemId: text("previous_item_id").references((): AnySQLiteColumn => rkaItems.id)
}, (table) => [
  uniqueIndex("rka_items_doc_key_idx").on(table.documentId, table.itemKey),
  index("rka_items_work_unit_idx").on(table.workUnitId),
  index("rka_items_account_idx").on(table.accountCode),
  index("rka_items_previous_idx").on(table.previousItemId)
]);

// ---------------------------------------------------------------- Deteksi

export interface RuleParams { [key: string]: unknown }

export const rules = sqliteTable("rules", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").$type<NoteCategory>().notNull(),
  kind: text("kind").$type<RuleKind>().notNull(),
  params: text("params", { mode: "json" }).$type<RuleParams>().notNull(),
  reasonTemplate: text("reason_template").notNull(),
  source: text("source").notNull(),
  defaultExpectation: text("default_expectation", { mode: "json" }).$type<Expectation>(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  validYear: integer("valid_year"),
  validationNote: text("validation_note"),
  updatedAt: ms("updated_at").notNull()
});

export const ruleHits = sqliteTable("rule_hits", {
  id: text("id").primaryKey(),
  rkaItemId: text("rka_item_id").notNull().references(() => rkaItems.id),
  ruleId: text("rule_id").notNull().references(() => rules.id),
  reason: text("reason").notNull(),
  /** Kata/pola yang cocok pada uraian, mis. ["kaos", "hut"] (D3). */
  matchedTerms: text("matched_terms", { mode: "json" }).$type<string[]>(),
  createdAt: ms("created_at").notNull()
}, (table) => [uniqueIndex("rule_hits_item_rule_idx").on(table.rkaItemId, table.ruleId), index("rule_hits_rule_idx").on(table.ruleId)]);

export interface RiskConfigWeights { price_vs_peer: number; risky_account: number; satker_history: number; description_quality: number; change_from_previous: number }
export interface RiskConfigParams {
  /** Skor tetap per kode akun rawan (F2). */
  riskyAccounts: Record<string, number>;
  /** Ambang total untuk satuan paket/LS/KEG tanpa rincian (F4), rupiah. */
  packageThreshold: number;
  /** Minimum jumlah Satker agar sebuah kelompok uraian dipakai sebagai pembanding (F1). */
  peerMinSatker: number;
}

/** Hanya insert; konfigurasi aktif = yang terbaru. */
export const riskConfig = sqliteTable("risk_config", {
  id: text("id").primaryKey(),
  version: text("version").notNull().unique(),
  weights: text("weights", { mode: "json" }).$type<RiskConfigWeights>().notNull(),
  thresholds: text("thresholds", { mode: "json" }).$type<{ medium: number; high: number }>().notNull(),
  params: text("params", { mode: "json" }).$type<RiskConfigParams>().notNull(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: ms("created_at").notNull()
});

export interface StoredFactor {
  code: string;
  label: string;
  normalizedScore: number | null;
  weight: number;
  contribution: number | null;
  explanation: string;
  dataAvailable: boolean;
}

/** Bentuk `risk_assessments.peer_stats` (D9). */
export interface StoredPeerStats { median: number; satkerCount: number; ratio: number; min: number; max: number; unit: string | null }

export const riskAssessments = sqliteTable("risk_assessments", {
  id: text("id").primaryKey(),
  rkaItemId: text("rka_item_id").notNull().references(() => rkaItems.id),
  riskConfigId: text("risk_config_id").notNull().references(() => riskConfig.id),
  score: integer("score").notNull(),
  category: text("category").notNull(),
  factors: text("factors", { mode: "json" }).$type<StoredFactor[]>().notNull(),
  peerStats: text("peer_stats", { mode: "json" }).$type<StoredPeerStats | null>(),
  dataCompleteness: text("data_completeness").notNull(),
  assessedAt: ms("assessed_at").notNull()
}, (table) => [uniqueIndex("risk_assessments_item_config_idx").on(table.rkaItemId, table.riskConfigId), index("risk_assessments_score_idx").on(table.score)]);

/** Profil riwayat temuan BPK per Satker (dari PTL, dibangkitkan lokal; versi sintetis untuk seed). */
export const satkerFindingStats = sqliteTable("satker_finding_stats", {
  id: text("id").primaryKey(),
  workUnitCode: text("work_unit_code").notNull(),
  theme: text("theme").notNull(),
  countTotal: integer("count_total").notNull(),
  countOpen: integer("count_open").notNull(),
  latestYear: integer("latest_year")
}, (table) => [uniqueIndex("satker_finding_stats_idx").on(table.workUnitCode, table.theme)]);

// ---------------------------------------------------------------- Keputusan, CHR, tindak lanjut

export const dismissReasons = sqliteTable("dismiss_reasons", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true)
});

export const reviewerDecisions = sqliteTable("reviewer_decisions", {
  id: text("id").primaryKey(),
  rkaItemId: text("rka_item_id").notNull().unique().references(() => rkaItems.id),
  reviewerUserId: text("reviewer_user_id").notNull().references(() => users.id),
  decision: text("decision").$type<"confirm" | "dismiss">().notNull(),
  reasonCategory: text("reason_category").references(() => dismissReasons.code),
  note: text("note"),
  createdAt: ms("created_at").notNull()
});

/** CHR per eselon I per siklus (tahap). */
export const chrDocuments = sqliteTable("chr_documents", {
  id: text("id").primaryKey(),
  cycleId: text("cycle_id").notNull().references(() => reviewCycles.id),
  organizationUnitId: text("organization_unit_id").notNull().references(() => organizationUnits.id),
  documentNumber: text("document_number"),
  status: text("status").$type<ChrStatus>().notNull().default("draft"),
  recommendation: text("recommendation"),
  unitResponse: text("unit_response"),
  /** Pengisi tanggapan eselon I dan waktunya (D6). */
  unitResponseBy: text("unit_response_by").references(() => users.id),
  unitResponseAt: ms("unit_response_at"),
  createdBy: text("created_by").notNull().references(() => users.id),
  /** Penerbit CHR (nama di `ChrDocumentDto.issuedByName`). Diisi saat terbit. */
  issuedBy: text("issued_by").references(() => users.id),
  issuedAt: ms("issued_at"),
  completedAt: ms("completed_at"),
  createdAt: ms("created_at").notNull(),
  updatedAt: ms("updated_at").notNull()
}, (table) => [
  uniqueIndex("chr_documents_cycle_org_idx").on(table.cycleId, table.organizationUnitId),
  /** Nomor dokumen unik; NULL (draf) tidak dibatasi (D6). */
  uniqueIndex("chr_documents_number_idx").on(table.documentNumber).where(isNotNull(table.documentNumber))
]);

/** Sumber tunggal status tindak lanjut. */
export const chrNotes = sqliteTable("chr_notes", {
  id: text("id").primaryKey(),
  chrDocumentId: text("chr_document_id").notNull().references(() => chrDocuments.id),
  rkaItemId: text("rka_item_id").references(() => rkaItems.id),
  itemKey: text("item_key"),
  workUnitId: text("work_unit_id").references(() => workUnits.id),
  ruleId: text("rule_id").references(() => rules.id),
  /** Judul catatan (uraian item saat konfirmasi); wajib untuk catatan manual tanpa item (D5). */
  title: text("title"),
  category: text("category").$type<NoteCategory>().notNull(),
  text: text("text").notNull(),
  expectation: text("expectation", { mode: "json" }).$type<Expectation>().notNull(),
  status: text("status").$type<NoteStatus>().notNull().default("draf"),
  justification: text("justification"),
  justifiedBy: text("justified_by").references(() => users.id),
  closedBy: text("closed_by").references(() => users.id),
  closedAt: ms("closed_at"),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: ms("created_at").notNull(),
  updatedAt: ms("updated_at").notNull()
}, (table) => [
  /** Satu catatan per item (D12). Catatan manual tanpa item (NULL) tidak dibatasi. */
  uniqueIndex("chr_notes_item_idx").on(table.rkaItemId).where(isNotNull(table.rkaItemId)),
  index("chr_notes_doc_idx").on(table.chrDocumentId), index("chr_notes_status_idx").on(table.status), index("chr_notes_work_unit_idx").on(table.workUnitId)
]);

export const chrVersions = sqliteTable("chr_versions", {
  id: text("id").primaryKey(),
  chrId: text("chr_id").notNull().references(() => chrDocuments.id),
  versionNumber: integer("version_number").notNull(),
  snapshot: text("snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  reason: text("reason").$type<"terbit" | "adendum">().notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: ms("created_at").notNull()
}, (table) => [uniqueIndex("chr_versions_idx").on(table.chrId, table.versionNumber)]);

export const followUpChecks = sqliteTable("follow_up_checks", {
  id: text("id").primaryKey(),
  noteId: text("note_id").notNull().references(() => chrNotes.id),
  documentId: text("document_id").notNull().references(() => rkaDocuments.id),
  matchedItemId: text("matched_item_id").references(() => rkaItems.id),
  result: text("result").$type<CheckResult>().notNull(),
  evidence: text("evidence", { mode: "json" }).$type<Evidence>().notNull(),
  checkedAt: ms("checked_at").notNull(),
  reviewerAction: text("reviewer_action").$type<"setujui" | "kembalikan">(),
  reviewerNote: text("reviewer_note"),
  reviewedBy: text("reviewed_by").references(() => users.id),
  reviewedAt: ms("reviewed_at")
}, (table) => [index("follow_up_checks_note_idx").on(table.noteId)]);

// ---------------------------------------------------------------- Lain-lain

/** Append-only: trigger SQLite menolak UPDATE / DELETE (lihat migrasi audit_append_only). */
export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  detail: text("detail").notNull(),
  before: text("before", { mode: "json" }).$type<unknown>(),
  after: text("after", { mode: "json" }).$type<unknown>(),
  createdAt: ms("created_at").notNull()
}, (table) => [
  index("audit_logs_created_idx").on(table.createdAt),
  index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  index("audit_logs_actor_idx").on(table.actorUserId, table.createdAt),
  index("audit_logs_action_idx").on(table.action, table.createdAt)
]);

export const publicMetrics = sqliteTable("public_metrics", {
  id: text("id").primaryKey(),
  cycleId: text("cycle_id").notNull().references(() => reviewCycles.id),
  organizationUnitLabel: text("organization_unit_label").notNull(),
  category: text("category").notNull(),
  notesTotal: integer("notes_total").notNull(),
  closedBeforeDeadline: integer("closed_before_deadline").notNull(),
  medianDaysToClose: real("median_days_to_close"),
  generatedAt: ms("generated_at").notNull()
}, (table) => [index("public_metrics_cycle_idx").on(table.cycleId)]);
