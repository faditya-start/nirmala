/**
 * Pure helpers for the Siklus & Impor screens. No React, no relative imports, so `node --test` can run them.
 */
import type { CycleStage, Evidence, Expectation, ImportRowErrorReason, JobStep, SnapshotDto } from "@nirmala/shared";

const decimal1 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("id-ID");

/** 6_710_000 -> "6,4 MB". Binary units, one decimal for MB and above. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${integer.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${integer.format(Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${decimal1.format(bytes / (1024 * 1024))} MB`;
  return `${decimal1.format(bytes / (1024 * 1024 * 1024))} GB`;
}

/** 38_000 -> "38 detik"; 72_000 -> "1 menit 12 detik"; null -> null. */
export function formatDuration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return "kurang dari 1 detik";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} detik`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} menit` : `${minutes} menit ${rest} detik`;
}

export function versionLabel(versionNo: number): string {
  return versionNo <= 1 ? "Awal" : "Revisi";
}

/** "v2 · Revisi" */
export function versionText(versionNo: number): string {
  return `v${versionNo} · ${versionLabel(versionNo)}`;
}

export function stageName(stage: CycleStage): string {
  return stage === "pagu" ? "Pagu anggaran" : "Alokasi anggaran";
}

/** "2026 Alokasi" (the design writes "TA 2026 Alokasi" in titles). */
export function cycleTitle(cycle: { fiscalYear: number; stage: CycleStage }): string {
  return `TA ${cycle.fiscalYear} ${cycle.stage === "pagu" ? "Pagu" : "Alokasi"}`;
}

export const IMPORT_STEP_LABEL: Record<string, string> = {
  baca_file: "Membaca file",
  saring_header: "Menyaring header",
  simpan_item: "Menyimpan item",
  aturan_dan_skor: "Menjalankan aturan dan skor"
};

export const IMPORT_STEP_KEYS = ["baca_file", "saring_header", "simpan_item", "aturan_dan_skor"] as const;

export function stepLabel(key: string): string {
  return IMPORT_STEP_LABEL[key] ?? key;
}

/** All four steps, waiting, for the moment before the server has reported anything. */
export function waitingSteps(): JobStep[] {
  return IMPORT_STEP_KEYS.map((key) => ({ key, status: "menunggu" }));
}

/** Heading above the progress bar: the running step, else the next waiting one, else "Selesai". */
export function currentStepLabel(steps: JobStep[]): string {
  const running = steps.find((step) => step.status === "berjalan");
  if (running) return stepLabel(running.key);
  const waiting = steps.find((step) => step.status === "menunggu");
  if (waiting) return stepLabel(waiting.key);
  return "Selesai";
}

const REASON_LABEL: Record<ImportRowErrorReason, string> = {
  bukan_angka: "Bukan angka",
  wajib_diisi: "Wajib diisi",
  bernilai_negatif: "Bernilai negatif",
  format_tidak_valid: "Format tidak valid"
};

/** Reason column text. `format_tidak_valid` shows the validator's own message when there is one. */
export function rowErrorReasonText(reason: ImportRowErrorReason, message: string): string {
  if (reason === "format_tidak_valid" && message.trim()) return message.trim();
  return REASON_LABEL[reason] ?? message;
}

export function rowErrorValueText(value: string | null): string {
  return value === null || value.trim() === "" ? "(kosong)" : value;
}

/** Version columns for the snapshot table: always v1 and v2 (as designed), more only when data exists. */
export function versionColumns(snapshots: SnapshotDto[][]): number[] {
  let max = 2;
  for (const list of snapshots) for (const snapshot of list) max = Math.max(max, snapshot.versionNo);
  return Array.from({ length: max }, (_, index) => index + 1);
}

export type RowAction = { kind: "view"; snapshot: SnapshotDto } | { kind: "import"; versionNo: number } | { kind: "none" };

/**
 * Action cell of the snapshot table. v1 and v2 present -> "Lihat hasil v2" (as designed). Otherwise importers get
 * "Impor v<next>"; people who cannot import see a result link when a snapshot exists.
 */
export function rowAction(snapshots: SnapshotDto[], nextVersionNo: number, canImport: boolean): RowAction {
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  if (latest && (snapshots.length >= 2 || !canImport)) return { kind: "view", snapshot: latest };
  if (canImport) return { kind: "import", versionNo: nextVersionNo };
  return { kind: "none" };
}

/** Hint under "Label versi": existing versions of the chosen eselon I. */
export function versionHint(snapshots: SnapshotDto[]): string {
  if (snapshots.length === 0) return "Label versi untuk snapshot baru.";
  const names = snapshots.map((snapshot) => versionText(snapshot.versionNo));
  return `${names.join(" dan ")} sudah ada untuk eselon I ini.`;
}

/** Light check of the header line only; the server stays the judge. */
export function looksLikeSipeka(headText: string): boolean {
  const firstLine = headText.replace(/^﻿/, "").split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";
  return firstLine.includes("baes1") && firstLine.includes("tahun");
}

export function isCsvFileName(name: string): boolean {
  return /\.csv$/i.test(name.trim());
}

/** "hapus_item", "ganti_akun → 521111" ... same wording as the shared helper, kept local so this file stays pure. */
export function expectationText(expectation: Expectation): string {
  switch (expectation.type) {
    case "ganti_akun":
      return `ganti_akun → ${expectation.to}`;
    case "hapus_item":
      return "hapus_item";
    case "turunkan_nilai": {
      const parts: string[] = [];
      if (expectation.maxUnitPrice !== undefined) parts.push(`harga satuan ≤ ${integer.format(expectation.maxUnitPrice)}`);
      if (expectation.maxTotal !== undefined) parts.push(`total ≤ ${integer.format(expectation.maxTotal)}`);
      return `turunkan_nilai ${parts.join(", ")}`.trim();
    }
    case "rinci_item":
      return "rinci_item";
    case "manual":
      return `manual · ${expectation.instruction}`;
  }
}

/** One line of proof for the recheck table: the engine's note, else "sebelum → sesudah" per changed field. */
export function evidenceText(evidence: Evidence): string {
  const note = evidence.note?.trim();
  if (note) return note;
  const fields = evidence.fields.map((field) => `${field.before ?? "-"} → ${field.after ?? "-"}`);
  return fields.length > 0 ? fields.join("; ") : "Tidak ada perubahan yang tercatat.";
}

/** Whole-number percent for the progress bar, clamped to 0..100. */
export function clampPercent(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** "8 Nov 2026, 16.40" for the result page subtitle (design W7YQog). */
export function dateCommaTime(epochMs: number): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const date = new Date(epochMs);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${hh}.${mm}`;
}

const HEX_64 = /^[0-9a-f]{64}$/;

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isSha256Hex(value: string): boolean {
  return HEX_64.test(value);
}
