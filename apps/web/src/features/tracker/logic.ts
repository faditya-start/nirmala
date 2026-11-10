/**
 * Pure helpers for the Smart Tracker screens (no React, no runtime imports, so `node --test` can load this file).
 * Labels and sentences here are the copy for derived text that the API does not send (DTOs carry data, not sentences).
 */
import type {
  BulkSkipReason,
  CheckEvidenceDto,
  CheckResult,
  EvidenceRowDto,
  Expectation,
  NoteCategory,
  NoteNextStep,
  NoteStatus,
  TimelineEventDto,
  TrackerNoteRow,
  TrackerStatus
} from "@nirmala/shared";

const number = new Intl.NumberFormat("id-ID");

export const STATUS_ORDER: readonly TrackerStatus[] = ["menunggu_revisi", "perlu_verifikasi", "dijustifikasi", "closed"];

export const STATUS_TEXT: Record<NoteStatus, string> = {
  draf: "Draf",
  menunggu_revisi: "Menunggu Revisi",
  perlu_verifikasi: "Perlu Verifikasi",
  dijustifikasi: "Dijustifikasi",
  closed: "Closed"
};

export const CATEGORY_LABEL: Record<NoteCategory, string> = {
  EFISIENSI: "Efisiensi",
  SATUAN_BIAYA: "Satuan biaya",
  AKUN: "Akun",
  LAINNYA: "Lainnya"
};

export const CHECK_TEXT: Record<CheckResult, string> = {
  terpenuhi: "Terpenuhi",
  belum_terpenuhi: "Belum terpenuhi",
  data_tidak_cukup: "Data tidak cukup",
  item_tidak_ditemukan: "Item tidak ditemukan"
};

export const FIELD_LABEL: Record<EvidenceRowDto["field"], string> = {
  account_code: "Akun",
  unit_price: "Harga satuan",
  total_amount: "Total",
  quantity: "Volume",
  unit: "Satuan",
  description: "Uraian",
  blokir_code: "Kode blokir"
};

export const SKIP_REASON_TEXT: Record<BulkSkipReason, string> = {
  tidak_ditemukan: "catatan tidak ditemukan",
  tidak_ada_akses: "di luar akses Anda",
  bukan_perlu_verifikasi: "statusnya sudah berubah",
  belum_terpenuhi: "hasil cek belum terpenuhi"
};

export function formatNum(value: number): string {
  return number.format(value);
}

/** "ganti_akun → 521111", "turunkan_nilai ≤ 4.500.000", "manual · diperiksa reviewer". Mono text in the list and detail. */
export function expectationText(expectation: Expectation): string {
  switch (expectation.type) {
    case "ganti_akun":
      return `ganti_akun → ${expectation.to}`;
    case "hapus_item":
      return "hapus_item";
    case "turunkan_nilai": {
      const limits: string[] = [];
      if (expectation.maxUnitPrice !== undefined) limits.push(`harga ≤ ${formatNum(expectation.maxUnitPrice)}`);
      if (expectation.maxTotal !== undefined) limits.push(`total ≤ ${formatNum(expectation.maxTotal)}`);
      return `turunkan_nilai · ${limits.join(", ")}`;
    }
    case "rinci_item":
      return "rinci_item";
    case "manual":
      return "manual · diperiksa reviewer";
  }
}

export function formatEvidenceValue(field: EvidenceRowDto["field"], value: string | number | null): string {
  if (value === null || value === "") return "tidak ada";
  if (typeof value === "number" && (field === "unit_price" || field === "total_amount" || field === "quantity")) return formatNum(value);
  return String(value);
}

function afterOf(evidence: CheckEvidenceDto | TrackerNoteRow["latestCheck"], field: EvidenceRowDto["field"]): string | number | null | undefined {
  if (!evidence) return undefined;
  if ("rows" in evidence) return evidence.rows.find((row) => row.field === field)?.after;
  return evidence.evidence.fields.find((item) => item.field === field)?.after;
}

/**
 * One short sentence that says why the automatic check came out as it did ("Akun masih 522191").
 * Used under the badge in the list and in the timeline. Never claims the note is done: it only describes the proposal.
 */
export function checkSummary(expectation: Expectation, result: CheckResult, evidence: CheckEvidenceDto | TrackerNoteRow["latestCheck"]): string {
  if (expectation.type === "manual") return "Ekspektasi manual tidak bisa dicek otomatis";
  if (result === "data_tidak_cukup") return "Data belum cukup untuk dicek";
  if (result === "item_tidak_ditemukan") return "Item padanan tidak ditemukan di revisi";

  const met = result === "terpenuhi";
  switch (expectation.type) {
    case "hapus_item":
      return met ? "Item tidak ada di revisi" : "Item masih ada di revisi";
    case "ganti_akun": {
      const after = afterOf(evidence, "account_code");
      if (after === undefined || after === null) return met ? "Akun sudah sesuai" : "Akun belum sesuai";
      return met ? `Akun sudah ${after}` : `Akun masih ${after}`;
    }
    case "turunkan_nilai": {
      const price = afterOf(evidence, "unit_price");
      const total = afterOf(evidence, "total_amount");
      if (met) return "Nilai sudah sesuai batas";
      const shown = typeof price === "number" ? `harga ${formatNum(price)}` : typeof total === "number" ? `total ${formatNum(total)}` : null;
      return shown ? `Nilai masih di atas batas (${shown})` : "Nilai masih di atas batas";
    }
    case "rinci_item":
      return met ? "Item sudah dirinci" : "Item belum dirinci";
  }
}

/** The list's "Hasil cek terakhir" second line, including the not-yet-checked case. */
export function rowCheckLine(row: Pick<TrackerNoteRow, "expectation" | "latestCheck">): string {
  if (!row.latestCheck) return "Belum ada cek otomatis";
  return checkSummary(row.expectation, row.latestCheck.result, row.latestCheck);
}

/** "521211 · R01", or "532111 → 526113 · R05" when the checked account differs from the one in the base snapshot. */
export function rowAccountLine(row: Pick<TrackerNoteRow, "accountCode" | "ruleCode" | "latestCheck">): string[] {
  const parts: string[] = [];
  const change = row.latestCheck?.evidence.fields.find((item) => item.field === "account_code");
  if (change && change.before !== change.after && change.before !== null && change.after !== null) parts.push(`${change.before} → ${change.after}`);
  else if (row.accountCode) parts.push(row.accountCode);
  if (row.ruleCode) parts.push(row.ruleCode);
  return parts;
}

// ------------------------------------------------------------------ bulk approve

export interface SelectableRow {
  id: string;
  title: string;
  bulkApprovable: boolean;
}

export interface SelectionSummary {
  total: number;
  approvable: SelectableRow[];
  skipped: SelectableRow[];
}

/** Only notes whose last check is `terpenuhi` are approved in bulk; the rest of the selection is left alone. */
export function summarizeSelection(rows: Iterable<SelectableRow>): SelectionSummary {
  const approvable: SelectableRow[] = [];
  const skipped: SelectableRow[] = [];
  for (const row of rows) (row.bulkApprovable ? approvable : skipped).push(row);
  return { total: approvable.length + skipped.length, approvable, skipped };
}

export function bulkResultMessage(approved: number, skipped: { reason: BulkSkipReason }[], completedChr: number, actorName = "Anda"): string {
  const parts: string[] = [];
  parts.push(approved === 0 ? "Tidak ada catatan yang ditutup." : `${formatNum(approved)} catatan ditutup atas nama ${actorName}.`);
  if (skipped.length > 0) {
    const reasons = [...new Set(skipped.map((item) => SKIP_REASON_TEXT[item.reason]))].join(", ");
    parts.push(`${formatNum(skipped.length)} dilewati (${reasons}).`);
  }
  if (completedChr > 0) parts.push(completedChr === 1 ? "CHR menjadi Selesai karena semua catatannya Closed." : `${completedChr} CHR menjadi Selesai.`);
  return parts.join(" ");
}

// ------------------------------------------------------------------ tabs

/** First tab that has notes when the URL did not choose one; all empty keeps the first tab (state "Tracker kosong"). */
export function pickDefaultStatus(counts: Record<TrackerStatus, number>): TrackerStatus {
  if (counts.perlu_verifikasi > 0) return "perlu_verifikasi";
  return STATUS_ORDER.find((status) => counts[status] > 0) ?? "menunggu_revisi";
}

export function isTrackerStatus(value: string | null | undefined): value is TrackerStatus {
  return !!value && (STATUS_ORDER as readonly string[]).includes(value);
}

// ------------------------------------------------------------------ evidence card

export type EvidenceTone = "berubah" | "tetap" | "tidak_berubah";

export interface EvidenceRowView {
  key: string;
  field: string;
  state: EvidenceTone;
  before?: string;
  after?: string;
  value?: string;
  /** Show the check-result badge in the tag slot instead of the change tag (manual expectations). */
  badge?: CheckResult;
}

/** Turns the contract's rows into what the Bukti card shows. Mirrors the designs (dB0Ae, W4pDP9). */
export function evidenceRowViews(evidence: CheckEvidenceDto, expectation: Expectation, baseSnapshotNo = 1): EvidenceRowView[] {
  const views: EvidenceRowView[] = [];

  if (expectation.type === "manual" || (evidence.result === "data_tidak_cukup" && evidence.rows.length === 0)) {
    views.push({
      key: "ekspektasi",
      field: "Ekspektasi",
      state: "tetap",
      value: expectation.type === "manual" ? "manual · tidak bisa dicek otomatis" : "data kunci kosong · tidak bisa dicek otomatis",
      badge: "data_tidak_cukup"
    });
  }

  for (const row of evidence.rows) {
    const label = FIELD_LABEL[row.field];
    if (row.field === "blokir_code") {
      views.push({ key: "blokir-awal", field: `${label} v${baseSnapshotNo}`, state: "tetap", value: formatEvidenceValue(row.field, row.before) });
      views.push({ key: "blokir-cek", field: `${label} v${evidence.snapshotVersionNo}`, state: "tetap", value: formatEvidenceValue(row.field, row.after) });
      continue;
    }
    const before = formatEvidenceValue(row.field, row.before);
    const after = formatEvidenceValue(row.field, row.after);
    const expected = row.expected === null ? null : formatEvidenceValue(row.field, row.expected);
    if (row.changed) {
      views.push({ key: row.field, field: label, state: "berubah", before, after });
    } else if (evidence.result === "belum_terpenuhi" && expected !== null) {
      views.push({ key: row.field, field: label, state: "tidak_berubah", value: `${after} · seharusnya ${expected}` });
    } else {
      views.push({ key: row.field, field: label, state: "tetap", value: after });
    }
  }
  return views;
}

// ------------------------------------------------------------------ timeline

export type ViewTone = "default" | "menunggu" | "verif" | "justif" | "closed" | "flag";

export interface TimelineView {
  key: string;
  title: string;
  /** Epoch ms; formatted by the caller. */
  at: number | null;
  description?: string;
  tone: ViewTone;
  pending?: boolean;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function actor(name: string | null): string {
  return name ?? "Sistem";
}

function checkTone(result: CheckResult | undefined): ViewTone {
  if (result === "terpenuhi") return "closed";
  if (result === "belum_terpenuhi") return "flag";
  return "default";
}

export function timelineViews(
  events: TimelineEventDto[],
  nextStep: NoteNextStep,
  evidences: CheckEvidenceDto[],
  expectation: Expectation
): TimelineView[] {
  const views: TimelineView[] = events.map((event, index) => {
    const key = `${event.type}-${event.at}-${index}`;
    switch (event.type) {
      case "dibuat":
        return {
          key,
          title: "Catatan dibuat",
          at: event.at,
          tone: "default",
          description: [actor(event.actorName), event.category ? `kategori ${CATEGORY_LABEL[event.category]}` : null].filter(Boolean).join(" · ")
        };
      case "terbit":
        return {
          key,
          title: "CHR diterbitkan",
          at: event.at,
          tone: "menunggu",
          description: [event.chrDocumentNumber ? `CHR ${event.chrDocumentNumber}` : "CHR", `status ${STATUS_TEXT[event.statusAfter]}`].join(" · ")
        };
      case "adendum":
        return {
          key,
          title: "Catatan masuk lewat adendum",
          at: event.at,
          tone: "menunggu",
          description: [event.chrDocumentNumber ? `CHR ${event.chrDocumentNumber}` : "CHR", event.chrVersion ? `versi ${event.chrVersion}` : null].filter(Boolean).join(" · ")
        };
      case "cek": {
        const evidence = evidences.find((item) => item.snapshotVersionNo === event.snapshotVersionNo);
        const result = event.checkResult;
        const summary = result ? checkSummary(expectation, result, evidence ?? null) : null;
        return {
          key,
          title: `Cek otomatis · snapshot v${event.snapshotVersionNo ?? "?"}`,
          at: event.at,
          tone: checkTone(result),
          description: result ? `${CHECK_TEXT[result]}${summary ? `: ${lowerFirst(summary)}` : ""}` : undefined
        };
      }
      case "dikembalikan":
        return {
          key,
          title: "Dikembalikan ke Satker",
          at: event.at,
          tone: "menunggu",
          description: [actor(event.actorName), event.reason].filter(Boolean).join(" · ")
        };
      case "dijustifikasi":
        return {
          key,
          title: "Justifikasi diisi",
          at: event.at,
          tone: "justif",
          description: [actor(event.actorName), event.reason].filter(Boolean).join(" · ")
        };
      case "justifikasi_diterima":
        return {
          key,
          title: "Justifikasi diterima, catatan ditutup",
          at: event.at,
          tone: "closed",
          description: [actor(event.actorName), event.reason].filter(Boolean).join(" · ")
        };
      case "disetujui":
        return {
          key,
          title: "Disetujui dan ditutup",
          at: event.at,
          tone: "closed",
          description: [actor(event.actorName), event.reason].filter(Boolean).join(" · ")
        };
    }
  });

  if (nextStep) {
    if (nextStep.kind === "keputusan_reviewer") {
      views.push({ key: "next", title: "Menunggu keputusan", at: null, tone: "default", pending: true, description: "Perlu Verifikasi oleh reviewer" });
    } else if (nextStep.kind === "snapshot_revisi") {
      views.push({
        key: "next",
        title: `Menunggu snapshot v${nextStep.snapshotVersionNo}`,
        at: null,
        tone: "default",
        pending: true,
        description: "Cek otomatis berjalan saat snapshot revisi diimpor"
      });
    } else {
      views.push({ key: "next", title: "Menunggu peninjauan justifikasi", at: null, tone: "default", pending: true, description: "Reviewer menerima atau mengembalikan ke Satker" });
    }
  }
  return views;
}

// ------------------------------------------------------------------ forms

export const RETURN_MIN = 5;
export const RETURN_MAX = 1000;
export const JUSTIFY_MIN = 10;
export const JUSTIFY_MAX = 2000;

/** Same rules as the contract's zod schemas, so the form can say what is wrong before sending. */
export function validateReturnReason(value: string): string | null {
  const text = value.trim();
  if (text.length < RETURN_MIN) return `Alasan pengembalian minimal ${RETURN_MIN} karakter.`;
  if (text.length > RETURN_MAX) return `Alasan pengembalian maksimal ${formatNum(RETURN_MAX)} karakter.`;
  return null;
}

export function validateJustification(value: string): string | null {
  const text = value.trim();
  if (text.length < JUSTIFY_MIN) return `Alasan Satker minimal ${JUSTIFY_MIN} karakter.`;
  if (text.length > JUSTIFY_MAX) return `Alasan Satker maksimal ${formatNum(JUSTIFY_MAX)} karakter.`;
  return null;
}
