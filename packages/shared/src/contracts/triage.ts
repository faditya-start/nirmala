/**
 * Risk Triage. Layar: S4 (daftar, state belum ada item kena aturan), S5 (detail item: konfirmasi, dismiss, setelah konfirmasi).
 *
 * Item yang ditampilkan = item di snapshot TERBARU tiap eselon I pada siklus yang dipilih (dalam scope pengguna).
 * Urutan default: item kena aturan dahulu, lalu skor menurun, lalu total menurun, lalu id (stabil).
 */
import { z } from "zod";
import type {
  ChangeType, ChrStatus, Expectation, NoteCategory, NoteStatus, RiskCategory
} from "../base.js";
import { NOTE_CATEGORIES, expectationSchema } from "../base.js";
import { idSchema, optionalIdSchema, paginationQuerySchema, queryBoolean, searchTextSchema, sortDirectionSchema, type Paginated } from "./common.js";
import { noteTextSchema, type ChrNoteDto } from "./chr.js";

// ---------------------------------------------------------------- Konstanta

/** Faktor skor (rule-catalog.md bagian 4). `F1`..`F5` = urutan di bawah. */
export const FACTOR_CODES = ["price_vs_peer", "risky_account", "satker_history", "description_quality", "change_from_previous"] as const;
export type FactorCode = (typeof FACTOR_CODES)[number];
export const FACTOR_KEYS: Record<FactorCode, "F1" | "F2" | "F3" | "F4" | "F5"> = {
  price_vs_peer: "F1",
  risky_account: "F2",
  satker_history: "F3",
  description_quality: "F4",
  change_from_previous: "F5"
};

/** Tema riwayat temuan BPK per Satker (`satker_finding_stats.theme`). Selalu dikirim lengkap (nol bila tidak ada). */
export const FINDING_THEMES = ["penganggaran", "perjalanan_dinas", "klasifikasi_belanja", "honorarium", "paket_meeting"] as const;
export type FindingTheme = (typeof FINDING_THEMES)[number];

/** Status keputusan item (nilai turunan, data-model.md bagian 6). */
export const TRIAGE_DECISIONS = ["belum_ditinjau", "confirm", "dismiss"] as const;
export type TriageDecision = (typeof TRIAGE_DECISIONS)[number];

export const TRIAGE_SORTS = ["default", "score", "total", "description"] as const;
export type TriageSort = (typeof TRIAGE_SORTS)[number];

// ---------------------------------------------------------------- Daftar (S4)

/**
 * Filter daftar. Dipakai bersama oleh daftar, navigasi "Sebelumnya/Berikutnya" di detail, dan hitungan ringkasan.
 * `workUnitId` harus Satker di `organizationUnitId` bila keduanya dikirim.
 */
export const triageFilterSchema = z.object({
  cycleId: idSchema,
  /** Kosong = semua eselon I dalam scope pengguna (snapshot terbaru masing-masing). */
  organizationUnitId: optionalIdSchema,
  workUnitId: optionalIdSchema,
  /** Kategori aturan (`rules.category`) dari aturan yang mengenai item. */
  ruleCategory: z.enum(NOTE_CATEGORIES).optional(),
  /** Kode aturan, mis. `R02` (tambahan; tidak ada di desain). */
  ruleCode: z.string().trim().regex(/^R\d{2,}$/).optional(),
  decision: z.enum(TRIAGE_DECISIONS).optional(),
  /** Hanya item yang kena minimal satu aturan aktif. Default false. */
  onlyFlagged: queryBoolean.default("false"),
  /** Cari di uraian item (mengandung, tidak peka huruf besar/kecil). */
  q: searchTextSchema
});
export type TriageFilter = z.infer<typeof triageFilterSchema>;

export const triageListQuerySchema = triageFilterSchema.merge(paginationQuerySchema).extend({
  sort: z.enum(TRIAGE_SORTS).default("default"),
  /** Diabaikan untuk `default` (selalu aturan dahulu, skor menurun). */
  dir: sortDirectionSchema.default("desc")
});
export type TriageListQuery = z.infer<typeof triageListQuerySchema>;

export interface TriageSnapshotInfo {
  id: string;
  organizationUnitId: string;
  organizationUnitName: string;
  versionNo: number;
  label: string;
  /** Jumlah item di snapshot ("3.098 item"). */
  itemCount: number;
}

/** Ringkasan di atas tabel. Dihitung untuk siklus + eselon I + Satker; filter lain (keputusan, cari, hanya flag) tidak mempengaruhi. */
export interface TriageSummary {
  /** Item yang dinilai skor ("3.098 item dinilai skor"). */
  analyzedItems: number;
  /** Item kena aturan ("108 item kena aturan"). */
  flaggedItems: number;
  /** Item kena aturan yang belum ditinjau ("83 belum ditinjau"); sama dengan badge nav Risk Triage. */
  unreviewedFlaggedItems: number;
}

export interface TriageItemRow {
  /** `rka_items.id`. */
  id: string;
  documentId: string;
  organizationUnitId: string;
  workUnitId: string;
  workUnitCode: string;
  workUnitName: string;
  accountCode: string;
  description: string;
  totalAmount: number;
  /** Kode aturan yang mengenai item (urut kode), mis. `["R06", "R08"]`. Kosong = tidak kena aturan. */
  ruleCodes: string[];
  /** null bila item belum dinilai (pipeline belum jalan). */
  score: number | null;
  riskCategory: RiskCategory | null;
  changeType: ChangeType;
  decision: TriageDecision;
  /** true bila keputusan diwarisi dari padanan di snapshot sebelumnya (hanya untuk `changeType = tetap`). */
  decisionInherited: boolean;
  /** Catatan CHR hasil konfirmasi (null bila tidak `confirm`). */
  noteId: string | null;
  noteStatus: NoteStatus | null;
}

export interface TriageListResponse extends Paginated<TriageItemRow> {
  /** Snapshot terbaru per eselon I yang tercakup filter (1 elemen bila `organizationUnitId` diisi). */
  snapshots: TriageSnapshotInfo[];
  summary: TriageSummary;
}

// ---------------------------------------------------------------- Detail (S5)

/** `GET /api/triage/items/:id?<filter>&sort=&dir=`: filter sama dengan daftar (tanpa page) agar `navigation` bisa dihitung. */
export const triageDetailQuerySchema = triageFilterSchema.partial({ cycleId: true }).extend({
  sort: z.enum(TRIAGE_SORTS).default("default"),
  dir: sortDirectionSchema.default("desc")
});
export type TriageDetailQuery = z.infer<typeof triageDetailQuerySchema>;

export interface HierarchyLevelDto {
  level: "program" | "activity" | "output" | "suboutput" | "component" | "subcomponent";
  code: string;
  /** null bila nama tidak tersedia di CSV; UI menampilkan kode saja. */
  name: string | null;
}

export interface VolumeDetailEntry {
  /** 1..4 (VOL_KEG_1..4). */
  index: number;
  volume: number | null;
  unit: string | null;
}

export interface TriageItemContext {
  id: string;
  documentId: string;
  cycleId: string;
  organizationUnitId: string;
  organizationUnitName: string;
  snapshotVersionNo: number;
  snapshotLabel: string;
  workUnitId: string;
  workUnitCode: string;
  workUnitName: string;
  accountCode: string;
  /** null bila akun tidak ada di tabel `accounts`. */
  accountName: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  totalAmount: number;
  /** Rincian VOL_KEG_1..4. `[]` bila VOL_KEG_1 tidak terisi (teks "VOL_KEG_1 tidak terisi"). */
  volumeDetail: VolumeDetailEntry[];
  blokirCode: string | null;
  blokirAmount: number | null;
  /** Program -> subkomponen; urut dari atas. */
  hierarchy: HierarchyLevelDto[];
  changeType: ChangeType;
}

export interface ScoreFactorDto {
  code: FactorCode;
  /** `F1`..`F5`. */
  key: "F1" | "F2" | "F3" | "F4" | "F5";
  label: string;
  /** 0-100; null bila data tidak tersedia. */
  normalizedScore: number | null;
  /** Bobot dalam persen (jumlah lima bobot = 100). */
  weight: number;
  /** `normalizedScore x weight / 100`; null bila data tidak tersedia. */
  contribution: number | null;
  /** Kalimat penjelasan dari engine ("1,9× median 9 Satker untuk uraian dan satuan yang sama."). */
  explanation: string;
  /** false = tampilkan badge "Data tidak tersedia"; faktor tidak menaikkan skor. */
  dataAvailable: boolean;
}

export interface ScoreBreakdownDto {
  /** 0-100. */
  value: number;
  category: RiskCategory;
  thresholds: { medium: number; high: number };
  /** Versi `risk_config` yang dipakai (skor lama tetap tersimpan per versi). */
  configVersion: string;
  /** Lima faktor, urut F1..F5. */
  factors: ScoreFactorDto[];
  dataCompleteness: "sufficient" | "partial";
  /**
   * Jumlah bobot faktor yang datanya tersedia. Skor = jumlah `contribution` x 100 / `activeWeight`: faktor tanpa data
   * tidak ikut penyebut, jadi jumlah kontribusi yang tampil bisa lebih kecil dari `value` bila ada faktor tanpa data.
   * Opsional demi kompatibilitas; server selalu mengirimnya.
   */
  activeWeight?: number;
}

export interface RuleHitDto {
  ruleId: string;
  /** `R01`..`R08`. */
  code: string;
  name: string;
  category: NoteCategory;
  /** Alasan yang sudah dirender dari template (dipakai sebagai teks awal catatan). */
  reason: string;
  /** Kata/pola yang cocok pada uraian, mis. `["kaos", "hut"]`; kosong bila tidak berlaku (R07, R08). */
  matchedTerms: string[];
  source: string;
  defaultExpectation: Expectation | null;
}

/** Perbandingan harga satuan dengan Satker lain (F1). null bila kelompok pembanding < ambang Satker. */
export interface PeerComparisonDto {
  /** Harga satuan item ini. */
  itemUnitPrice: number;
  median: number;
  /** Jumlah Satker dalam kelompok (uraian ternormalisasi + satuan) di siklus yang sama. */
  satkerCount: number;
  /** `itemUnitPrice / median`. */
  ratio: number;
  /** Rentang kelompok untuk sumbu grafik. */
  min: number;
  max: number;
  /** Satuan kelompok ("Pcs"). */
  unit: string | null;
  /** Ambang minimal Satker yang berlaku (default 5). */
  minSatker: number;
}

export interface SatkerFindingThemeDto {
  theme: FindingTheme;
  /** Jumlah rekomendasi. */
  countTotal: number;
  /** Belum selesai (BS + BT). */
  countOpen: number;
}

export interface SatkerHistoryDto {
  workUnitId: string;
  workUnitName: string;
  /** Lima tema (urut `FINDING_THEMES`), nol bila tidak ada data. */
  themes: SatkerFindingThemeDto[];
  /** false = Satker tidak punya profil sama sekali (F3 "Data tidak tersedia"). */
  hasProfile: boolean;
}

export interface PreviousVersionFieldDiff {
  field: "account_code" | "unit_price" | "total_amount" | "quantity" | "unit" | "description";
  before: string | number | null;
  after: string | number | null;
  changed: boolean;
}

/** Perbandingan dengan padanan di snapshot sebelumnya. `null` = item baru / snapshot pertama (UI: "Item baru di v2. Tidak ada padanan di v1"). */
export interface PreviousVersionDto {
  previousItemId: string;
  versionNo: number;
  label: string;
  fields: PreviousVersionFieldDiff[];
}

export interface ChrRefDto {
  id: string;
  documentNumber: string | null;
  status: ChrStatus;
  organizationUnitName: string;
}

export interface TriageDecisionDto {
  decision: Exclude<TriageDecision, "belum_ditinjau">;
  /** Kode alasan dismiss; null untuk confirm. */
  reasonCategory: string | null;
  reasonLabel: string | null;
  note: string | null;
  reviewerName: string;
  decidedAt: number;
  inherited: boolean;
  /** Catatan hasil konfirmasi. */
  chrNote: ChrNoteDto | null;
}

/** Nilai awal formulir konfirmasi: dari aturan dengan kode terkecil yang mengenai item; tanpa aturan = `LAINNYA`, teks kosong, ekspektasi null. */
export interface ConfirmDefaultsDto {
  category: NoteCategory;
  text: string;
  expectation: Expectation | null;
  /** Kode aturan sumber nilai awal; null bila tanpa aturan. */
  ruleCode: string | null;
}

export interface TriageNavigationDto {
  /** Posisi 1-based item di daftar ber-filter ("item 2 dari 11"). */
  position: number;
  total: number;
  previousItemId: string | null;
  nextItemId: string | null;
}

export interface TriageItemDetailResponse {
  item: TriageItemContext;
  score: ScoreBreakdownDto | null;
  ruleHits: RuleHitDto[];
  peer: PeerComparisonDto | null;
  satkerHistory: SatkerHistoryDto;
  previousVersion: PreviousVersionDto | null;
  decision: TriageDecisionDto | null;
  confirmDefaults: ConfirmDefaultsDto;
  /** CHR eselon I untuk siklus ini bila sudah ada (tombol "Buka CHR"). */
  chr: ChrRefDto | null;
  /** Reviewer/admin dalam scope dan item belum diputuskan (atau keputusan masih bisa dicabut). */
  canDecide: boolean;
  /** null bila tidak ada filter yang dikirim atau item di luar daftar. */
  navigation: TriageNavigationDto | null;
}

// ---------------------------------------------------------------- Keputusan

/** `POST /api/triage/items/:id/confirm` -> catatan `draf` di CHR eselon I (CHR dibuat otomatis bila belum ada). */
export const confirmItemBodySchema = z.object({
  category: z.enum(NOTE_CATEGORIES),
  text: noteTextSchema,
  expectation: expectationSchema
});
export type ConfirmItemBody = z.infer<typeof confirmItemBodySchema>;

export interface ConfirmItemResponse {
  decision: TriageDecisionDto;
  note: ChrNoteDto;
  chr: ChrRefDto;
}

/** `POST /api/triage/items/:id/dismiss`. Alasan wajib (masuk korpus umpan balik). */
export const dismissItemBodySchema = z.object({
  reasonCategory: z.string().trim().min(1, "Pilih kategori alasan dismiss."),
  note: z.string().trim().max(1000).optional()
});
export type DismissItemBody = z.infer<typeof dismissItemBodySchema>;

export interface DismissItemResponse {
  decision: TriageDecisionDto;
}
