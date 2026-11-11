/**
 * Editor ekspektasi perubahan (confirm di S5). Mengubah isian formulir menjadi `Expectation` yang lolos
 * `expectationSchema` dari @nirmala/shared, dengan pesan galat per isian dalam Bahasa Indonesia.
 */
import { expectationSchema, type Expectation } from "@nirmala/shared";

export const EXPECTATION_TYPES = ["ganti_akun", "hapus_item", "turunkan_nilai", "rinci_item", "manual"] as const;
export type ExpectationType = (typeof EXPECTATION_TYPES)[number];

export const EXPECTATION_LABEL: Record<ExpectationType, string> = {
  ganti_akun: "Ganti akun",
  hapus_item: "Hapus item",
  turunkan_nilai: "Turunkan nilai",
  rinci_item: "Rinci item",
  manual: "Instruksi manual"
};

/** Kalimat di bawah pilihan: cara sistem mengecek ekspektasi ini saat snapshot revisi masuk (api-contract.md 2.6). */
export const EXPECTATION_HINT: Record<ExpectationType, string> = {
  ganti_akun: "Cek otomatis: akun item di revisi sama dengan akun tujuan.",
  hapus_item: "Cek otomatis: item tidak ada di revisi, atau total 0.",
  turunkan_nilai: "Cek otomatis: harga satuan atau total di revisi tidak melebihi batas.",
  rinci_item: "Cek otomatis: volume lebih dari 1 dengan satuan bukan paket, atau uraian dirinci.",
  manual: "Tidak bisa dicek otomatis. Reviewer menilai sendiri saat revisi masuk."
};

export interface ExpectationForm {
  type: ExpectationType | "";
  /** Kode akun 6 digit (ganti_akun). */
  accountCode: string;
  /** Teks angka agar ketikan setengah jadi tidak hilang. */
  maxUnitPrice: string;
  maxTotal: string;
  instruction: string;
}

export type ExpectationField = "type" | "accountCode" | "limit" | "instruction";
export type ExpectationErrors = Partial<Record<ExpectationField, string>>;

export const EMPTY_EXPECTATION_FORM: ExpectationForm = { type: "", accountCode: "", maxUnitPrice: "", maxTotal: "", instruction: "" };

export function formFromExpectation(expectation: Expectation | null | undefined): ExpectationForm {
  if (!expectation) return { ...EMPTY_EXPECTATION_FORM };
  const base = { ...EMPTY_EXPECTATION_FORM, type: expectation.type };
  switch (expectation.type) {
    case "ganti_akun":
      return { ...base, accountCode: expectation.to };
    case "turunkan_nilai":
      return {
        ...base,
        maxUnitPrice: expectation.maxUnitPrice === undefined ? "" : String(expectation.maxUnitPrice),
        maxTotal: expectation.maxTotal === undefined ? "" : String(expectation.maxTotal)
      };
    case "manual":
      return { ...base, instruction: expectation.instruction };
    default:
      return base;
  }
}

/** "350.000" atau "350000" -> 350000. Kosong -> undefined. Selain angka bulat -> null (tidak valid). */
export function parseAmount(text: string): number | undefined | null {
  const value = text.trim();
  if (value === "") return undefined;
  const plain = /^\d{1,3}(\.\d{3})+$/.test(value) ? value.replace(/\./g, "") : value;
  if (!/^\d+$/.test(plain)) return null;
  const number = Number(plain);
  return Number.isSafeInteger(number) ? number : null;
}

export type ExpectationResult = { ok: true; value: Expectation } | { ok: false; errors: ExpectationErrors };

export function expectationFromForm(form: ExpectationForm): ExpectationResult {
  const errors: ExpectationErrors = {};
  if (form.type === "") return { ok: false, errors: { type: "Pilih ekspektasi perubahan." } };

  let candidate: unknown;
  switch (form.type) {
    case "ganti_akun": {
      const to = form.accountCode.trim();
      if (!to) errors.accountCode = "Isi kode akun tujuan.";
      candidate = { type: "ganti_akun", to };
      break;
    }
    case "turunkan_nilai": {
      const maxUnitPrice = parseAmount(form.maxUnitPrice);
      const maxTotal = parseAmount(form.maxTotal);
      if (maxUnitPrice === null || maxTotal === null) errors.limit = "Isi angka bulat tanpa huruf atau desimal.";
      else if (maxUnitPrice === undefined && maxTotal === undefined) errors.limit = "Isi batas harga satuan atau batas total.";
      candidate = {
        type: "turunkan_nilai",
        ...(typeof maxUnitPrice === "number" ? { maxUnitPrice } : {}),
        ...(typeof maxTotal === "number" ? { maxTotal } : {})
      };
      break;
    }
    case "manual": {
      const instruction = form.instruction.trim();
      if (!instruction) errors.instruction = "Tulis instruksi untuk Satker.";
      else if (instruction.length > 1000) errors.instruction = "Instruksi maksimal 1000 karakter.";
      candidate = { type: "manual", instruction };
      break;
    }
    default:
      candidate = { type: form.type };
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const parsed = expectationSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, value: parsed.data };

  const field: ExpectationField = form.type === "ganti_akun" ? "accountCode" : form.type === "manual" ? "instruction" : "limit";
  return { ok: false, errors: { [field]: parsed.error.issues[0]?.message ?? "Ekspektasi tidak valid." } };
}

/** Teks ringkas untuk ringkasan keputusan: "Hapus item", "Ganti akun ke 521111". */
export function describeExpectation(expectation: Expectation, formatNumber: (value: number) => string = String): string {
  switch (expectation.type) {
    case "ganti_akun":
      return `Ganti akun ke ${expectation.to}`;
    case "turunkan_nilai": {
      const parts: string[] = [];
      if (expectation.maxUnitPrice !== undefined) parts.push(`harga satuan maks. ${formatNumber(expectation.maxUnitPrice)}`);
      if (expectation.maxTotal !== undefined) parts.push(`total maks. ${formatNumber(expectation.maxTotal)}`);
      return `Turunkan nilai: ${parts.join(", ")}`;
    }
    case "manual":
      return `Instruksi manual: ${expectation.instruction}`;
    default:
      return EXPECTATION_LABEL[expectation.type];
  }
}
