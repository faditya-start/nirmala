/**
 * Pure helpers for the CHR screens: labels, expectation form <-> Expectation mapping, validation, page estimate.
 * No React here so the logic can be tested with `node --test`.
 */
import { expectationSchema, noteTextSchema, NOTE_CATEGORIES, NOTE_STATUSES } from "@nirmala/shared";
import type { ChrStatus, CycleStage, Expectation, NoteCategory, NoteStatus } from "@nirmala/shared";

/* ------------------------------------------------------------------ labels */

/** Group headings in the editor and print view (rule-catalog.md section 1). */
export const CATEGORY_LABEL: Record<NoteCategory, string> = {
  EFISIENSI: "Efisiensi belanja",
  SATUAN_BIAYA: "Kesesuaian penggunaan satuan biaya",
  AKUN: "Ketepatan penggunaan akun",
  LAINNYA: "Catatan lainnya"
};

export const CATEGORY_OPTIONS = NOTE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABEL[value] }));

export const STAGE_LABEL: Record<CycleStage, string> = {
  pagu: "Pagu anggaran",
  alokasi: "Alokasi anggaran"
};

/** Document status (not the same as a note status). */
export const CHR_STATUS_LABEL: Record<ChrStatus, string> = {
  draft: "Draf dokumen",
  issued: "Terbit · terkunci",
  completed: "Selesai"
};

export const NOTE_STATUS_ORDER: readonly NoteStatus[] = NOTE_STATUSES;

export const EXPECTATION_KIND_LABEL: Record<Expectation["type"], string> = {
  ganti_akun: "Ganti akun",
  hapus_item: "Hapus item",
  turunkan_nilai: "Turunkan nilai",
  rinci_item: "Rinci item",
  manual: "Manual (instruksi bebas)"
};

export const EXPECTATION_KIND_OPTIONS = (Object.keys(EXPECTATION_KIND_LABEL) as Array<Expectation["type"]>).map((value) => ({
  value,
  label: EXPECTATION_KIND_LABEL[value]
}));

/** "TA 2026 · Alokasi anggaran · Nomor dibuat saat CHR diterbitkan" / "... · No. X · versi 2". */
export function chrSubtitle(doc: { fiscalYear: number; stage: CycleStage; documentNumber: string | null; currentVersion: number }): string {
  const base = `TA ${doc.fiscalYear} · ${STAGE_LABEL[doc.stage]}`;
  if (!doc.documentNumber) return `${base} · Nomor dibuat saat CHR diterbitkan`;
  return `${base} · No. ${doc.documentNumber} · versi ${doc.currentVersion}`;
}

/** Plural-free count label: "3 catatan". */
export function noteCountLabel(count: number): string {
  return `${count} catatan`;
}

/* ------------------------------------------------------- expectation form */

export interface ExpectationForm {
  kind: Expectation["type"];
  /** ganti_akun: 6-digit account code. */
  to: string;
  /** turunkan_nilai, digits only or with id-ID thousands dots. */
  maxUnitPrice: string;
  maxTotal: string;
  /** manual. */
  instruction: string;
}

export function emptyExpectationForm(kind: Expectation["type"] = "ganti_akun"): ExpectationForm {
  return { kind, to: "", maxUnitPrice: "", maxTotal: "", instruction: "" };
}

export function expectationToForm(expectation: Expectation): ExpectationForm {
  const form = emptyExpectationForm(expectation.type);
  switch (expectation.type) {
    case "ganti_akun":
      form.to = expectation.to;
      break;
    case "turunkan_nilai":
      form.maxUnitPrice = expectation.maxUnitPrice === undefined ? "" : String(expectation.maxUnitPrice);
      form.maxTotal = expectation.maxTotal === undefined ? "" : String(expectation.maxTotal);
      break;
    case "manual":
      form.instruction = expectation.instruction;
      break;
    default:
      break;
  }
  return form;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** "1.250.000" or "1250000" -> 1250000. Empty -> undefined. Anything else -> null (invalid). */
export function parseRupiah(text: string): number | undefined | null {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const compact = trimmed.replace(/\./g, "");
  if (!/^\d+$/.test(compact)) return null;
  const value = Number(compact);
  return Number.isSafeInteger(value) ? value : null;
}

/** Builds the Expectation the API expects from the form. Validation uses the shared zod schema. */
export function buildExpectation(form: ExpectationForm): Parsed<Expectation> {
  let candidate: unknown;
  switch (form.kind) {
    case "ganti_akun":
      if (form.to.trim() === "") return { ok: false, error: "Isi kode akun tujuan (6 digit)." };
      candidate = { type: "ganti_akun", to: form.to.trim() };
      break;
    case "turunkan_nilai": {
      const maxUnitPrice = parseRupiah(form.maxUnitPrice);
      const maxTotal = parseRupiah(form.maxTotal);
      if (maxUnitPrice === null || maxTotal === null) return { ok: false, error: "Batas nilai harus berupa angka bulat rupiah." };
      if (maxUnitPrice === undefined && maxTotal === undefined) return { ok: false, error: "Isi batas harga satuan atau batas total." };
      candidate = { type: "turunkan_nilai", ...(maxUnitPrice !== undefined ? { maxUnitPrice } : {}), ...(maxTotal !== undefined ? { maxTotal } : {}) };
      break;
    }
    case "manual": {
      const instruction = form.instruction.trim();
      if (instruction === "") return { ok: false, error: "Tulis instruksi tindak lanjut." };
      if (instruction.length > 1000) return { ok: false, error: "Instruksi maksimal 1.000 karakter." };
      candidate = { type: "manual", instruction };
      break;
    }
    case "hapus_item":
    case "rinci_item":
      candidate = { type: form.kind };
      break;
  }
  const result = expectationSchema.safeParse(candidate);
  if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? "Ekspektasi tidak valid." };
  return { ok: true, value: result.data };
}

/* ---------------------------------------------------------------- note form */

export interface NoteForm {
  category: NoteCategory;
  title: string;
  text: string;
  workUnitId: string;
  expectation: ExpectationForm;
}

export function emptyNoteForm(): NoteForm {
  return { category: "EFISIENSI", title: "", text: "", workUnitId: "", expectation: emptyExpectationForm() };
}

export interface NoteFormErrors {
  title?: string;
  text?: string;
  workUnitId?: string;
  expectation?: string;
}

export const TITLE_MIN = 3;
export const TITLE_MAX = 200;
export const TEXT_MAX = 2000;
export const RECOMMENDATION_MAX = 5000;

/** Field level messages in plain Indonesian; the shared schema stays the final gate. */
export function validateNoteForm(form: NoteForm, options: { needsWorkUnit: boolean; needsTitle: boolean }): { errors: NoteFormErrors; expectation?: Expectation } {
  const errors: NoteFormErrors = {};
  const title = form.title.trim();
  if (options.needsTitle && title.length < TITLE_MIN) errors.title = `Judul minimal ${TITLE_MIN} karakter.`;
  else if (title.length > TITLE_MAX) errors.title = `Judul maksimal ${TITLE_MAX} karakter.`;

  const text = form.text.trim();
  if (text.length < 5) errors.text = "Teks catatan minimal 5 karakter.";
  else if (!noteTextSchema.safeParse(form.text).success) errors.text = `Teks catatan maksimal ${TEXT_MAX.toLocaleString("id-ID")} karakter.`;

  if (options.needsWorkUnit && form.workUnitId === "") errors.workUnitId = "Pilih Satker yang dicatat.";

  const expectation = buildExpectation(form.expectation);
  if (!expectation.ok) errors.expectation = expectation.error;

  return { errors, expectation: expectation.ok ? expectation.value : undefined };
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

/* ------------------------------------------------------------------- print */

/** A4 at 96 dpi is 794 x 1123 px; the printable body is a little shorter. Used only for the on-screen "Halaman 1 dari N". */
export const A4_HEIGHT_PX = 1123;

export function estimatePages(contentHeightPx: number): number {
  if (!Number.isFinite(contentHeightPx) || contentHeightPx <= 0) return 1;
  return Math.max(1, Math.ceil(contentHeightPx / A4_HEIGHT_PX));
}

const MONTHS_LONG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "4 November 2026" (print uses the long month name). */
export function formatLongDate(input: number | null | undefined): string {
  if (input === null || input === undefined) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}
