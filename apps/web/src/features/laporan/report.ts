import type { AnswerKeyCode, EngineValidationSet, NoteCategory, ReportSummaryResponse } from "@nirmala/shared";

/* Pure helpers: no app imports, so `node --test` can run report.test.ts directly. */
const number = new Intl.NumberFormat("id-ID");
const formatNumber = (value: number) => number.format(value);
const formatPercent = (ratio: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(ratio * 100)}%`;

/** Chart order and labels as drawn in the design (L4cke). */
export const CATEGORY_ROWS: { key: NoteCategory; label: string }[] = [
  { key: "AKUN", label: "Ketepatan akun" },
  { key: "EFISIENSI", label: "Efisiensi belanja" },
  { key: "SATUAN_BIAYA", label: "Satuan biaya" },
  { key: "LAINNYA", label: "Lainnya" }
];

/** Bar width as a percentage of the chart's largest value. Zero stays zero; any positive value stays visible. */
export function barPercent(count: number, max: number): number {
  if (!Number.isFinite(count) || count <= 0 || max <= 0) return 0;
  return Math.max(2, Math.min(100, (count / max) * 100));
}

/** 0-1 ratio to "70%"; null stays a dash. */
export function formatRatio(value: number | null): string {
  return value === null ? "—" : formatPercent(value);
}

export function formatDays(value: number | null): string {
  return value === null ? "—" : `${formatNumber(value)} hari`;
}

export function medianHint(sampleSize: number): string {
  return sampleSize === 0 ? "Belum ada catatan yang closed." : `Dari ${formatNumber(sampleSize)} catatan yang sudah closed`;
}

export function dismissSubtitle(dismissed: number, flagged: number): string {
  return `${formatNumber(dismissed)} item di-dismiss dari ${formatNumber(flagged)} item kena aturan.`;
}

/** "L1 · Catatan akun dan lainnya" */
export function setTitle(set: Pick<EngineValidationSet, "code" | "title">): string {
  return `${set.code} · ${set.title}`;
}

export const METRIC_NOTE: Record<EngineValidationSet["metric"], string | null> = {
  recall: null,
  precision_at_n: "presisi"
};

/** Footnote under the validation table. */
export function validationNote(synthetic: boolean, note: string | null): string | null {
  const parts: string[] = [];
  if (synthetic) parts.push("Angka di halaman ini dari data sintetis demo. Kunci jawaban data asli hanya dihitung di server sendiri.");
  if (note) parts.push(note);
  return parts.length > 0 ? parts.join(" ") : null;
}

export const ANSWER_KEY_ORDER: AnswerKeyCode[] = ["L1", "L2", "L3"];

/** Fallback CSV (dimensi, kunci, jumlah) used when the API is simulated and there is no server to download from. */
export function summaryCsv(summary: ReportSummaryResponse): string {
  const rows: Array<[string, string, number]> = [
    ...CATEGORY_ROWS.map((row): [string, string, number] => ["kategori", row.key, summary.notesByCategory[row.key] ?? 0]),
    ...summary.dismissReasons.map((reason): [string, string, number] => ["alasan_dismiss", reason.code, reason.count])
  ];
  return "﻿" + ["dimensi,kunci,jumlah", ...rows.map((row) => row.join(","))].join("\r\n") + "\r\n";
}

/** Note on the export scope under the filters. */
export function exportScopeNote(unitName: string | null, limited: boolean): string {
  if (unitName) return `Ekspor CSV mengikuti akses Anda: hanya ${unitName}.`;
  return limited ? "Ekspor CSV mengikuti akses Anda: semua eselon I yang Anda akses." : "Ekspor CSV mencakup semua eselon I.";
}
