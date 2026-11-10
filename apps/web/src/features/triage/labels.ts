import type { ChangeType, NoteCategory, RiskCategory, TriageDecision, TriageItemRow } from "@nirmala/shared";
import { NOTE_CATEGORIES } from "@nirmala/shared";
import type { Decision, ScoreCategory } from "../../ui";

/** Nama kategori catatan penuh (rule-catalog.md bagian 1). Dipakai di dropdown dan ringkasan keputusan. */
export const CATEGORY_LABEL: Record<NoteCategory, string> = {
  EFISIENSI: "Efisiensi belanja",
  SATUAN_BIAYA: "Kesesuaian penggunaan satuan biaya",
  AKUN: "Ketepatan penggunaan akun",
  LAINNYA: "Lainnya"
};

/** Nama pendek untuk tag di kartu aturan (Pencil: "Efisiensi"). */
export const CATEGORY_SHORT: Record<NoteCategory, string> = {
  EFISIENSI: "Efisiensi",
  SATUAN_BIAYA: "Satuan biaya",
  AKUN: "Akun",
  LAINNYA: "Lainnya"
};

export const CATEGORY_OPTIONS = NOTE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABEL[value] }));

export const CHANGE_LABEL: Record<ChangeType, string> = { baru: "Baru", berubah: "Berubah", tetap: "Tetap" };

export const DECISION_FILTER_OPTIONS: Array<{ value: "" | TriageDecision; label: string }> = [
  { value: "", label: "Semua" },
  { value: "belum_ditinjau", label: "Belum ditinjau" },
  { value: "confirm", label: "Dikonfirmasi" },
  { value: "dismiss", label: "Dismiss" }
];

export const RISK_TO_SCORE_CATEGORY: Record<RiskCategory, ScoreCategory> = { high: "tinggi", medium: "sedang", low: "rendah" };

/** Kunci DecisionBadge untuk satu baris. `confirm` yang catatannya sudah melewati draf ditampilkan sebagai status catatan. */
export function decisionBadgeKey(row: Pick<TriageItemRow, "decision" | "noteStatus">): Decision | { note: NonNullable<TriageItemRow["noteStatus"]> } {
  if (row.decision === "dismiss") return "dismiss";
  if (row.decision === "confirm") {
    return row.noteStatus && row.noteStatus !== "draf" ? { note: row.noteStatus } : "draf_di_chr";
  }
  return "belum_ditinjau";
}

export const FINDING_THEME_LABEL: Record<string, string> = {
  penganggaran: "Penganggaran",
  perjalanan_dinas: "Perjalanan dinas",
  klasifikasi_belanja: "Klasifikasi belanja",
  honorarium: "Honorarium",
  paket_meeting: "Paket meeting"
};

/** "v2 Revisi" */
export function snapshotName(versionNo: number, label: string): string {
  return `v${versionNo} ${label}`;
}
