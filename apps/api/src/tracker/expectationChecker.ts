/**
 * Cek otomatis ekspektasi catatan terhadap snapshot baru (fungsi murni; docs/mvp-scope.md §4.2, docs/api-contract.md §2.6).
 * Hasilnya hanya USULAN untuk reviewer: modul ini tidak mengubah status catatan dan tidak pernah menutupnya.
 */
import type { CheckResult, Evidence, Expectation } from "@nirmala/shared";

/** Nilai item yang relevan untuk cek (subset kolom `rka_items`). */
export interface CheckableItem {
  accountCode: string;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  totalAmount: number;
  blokirCode: string | null;
  /** `VOL_KEG_1..4` (kunci `vol1..vol4`); null bila tidak ada. */
  volumeDetail: Record<string, string | number | null> | null;
}

export interface CheckInput {
  expectation: Expectation;
  /** Item dasar catatan (snapshot saat dikonfirmasi); null untuk catatan manual tanpa item. */
  base: CheckableItem | null;
  /** Padanan item di snapshot yang dicek; null bila tidak ditemukan. */
  match: CheckableItem | null;
  /** Kode aturan asal catatan (R08 menambah bukti `blokir_code`). */
  ruleCode?: string | null;
}

export interface CheckOutput { result: CheckResult; evidence: Evidence }

type Field = Evidence["fields"][number];
type Value = string | number | null;

const PACKAGE_UNITS = new Set(["paket", "ls", "lump sum", "lumpsum", "lumpsump"]);
const blank = (value: string | null | undefined) => value === null || value === undefined || value.trim() === "";
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const isPackageUnit = (unit: string | null) => unit !== null && PACKAGE_UNITS.has(normalize(unit).replace(/\./g, ""));

function field(name: Field["field"], before: CheckableItem | null, after: CheckableItem | null, pick: (item: CheckableItem) => Value, expected?: Value): Field {
  const entry: Field = { field: name, before: before ? pick(before) : null, after: after ? pick(after) : null };
  if (expected !== undefined) entry.expected = expected;
  return entry;
}

const FIELD_PICKERS = {
  account_code: (item: CheckableItem): Value => item.accountCode,
  total_amount: (item: CheckableItem): Value => item.totalAmount,
  unit_price: (item: CheckableItem): Value => item.unitPrice,
  quantity: (item: CheckableItem): Value => item.quantity,
  unit: (item: CheckableItem): Value => item.unit,
  description: (item: CheckableItem): Value => item.description,
  blokir_code: (item: CheckableItem): Value => item.blokirCode
} satisfies Record<Field["field"], (item: CheckableItem) => Value>;

const hasVolumeBreakdown = (item: CheckableItem) =>
  ["vol1", "vol2", "vol3", "vol4"].some((key) => {
    const value = item.volumeDetail?.[key];
    return value !== null && value !== undefined && value !== "" && Number(value) !== 0;
  });

/** Hasil `item_tidak_ditemukan`: semua field `after = null`. */
function notFound(fields: Field[], note: string): CheckOutput {
  return { result: "item_tidak_ditemukan", evidence: { fields: fields.map((entry) => ({ ...entry, after: null })), note } };
}

/** Cek satu catatan. Urutan penentuan hasil: data kunci kosong, item tidak ditemukan, lalu aturan per jenis ekspektasi. */
export function checkExpectation({ expectation, base, match, ruleCode }: CheckInput): CheckOutput {
  const pick = (name: Field["field"], expected?: Value) => field(name, base, match, FIELD_PICKERS[name], expected);

  if (expectation.type === "manual") {
    // Tidak pernah dicek otomatis. Padanan yang hilang tetap dilaporkan sebagai item_tidak_ditemukan (A46).
    const fields: Field[] = ruleCode === "R08" ? [pick("blokir_code")] : [];
    if (base && !match) return notFound(fields, "Item tidak ditemukan di snapshot revisi.");
    return { result: "data_tidak_cukup", evidence: { fields, note: `Ekspektasi manual tidak dapat dicek otomatis. Instruksi: ${expectation.instruction}` } };
  }

  if (!base) return { result: "data_tidak_cukup", evidence: { fields: [], note: "Catatan tidak terkait item anggaran sehingga tidak dapat dicek otomatis." } };

  switch (expectation.type) {
    case "ganti_akun": {
      const fields = [pick("account_code", expectation.to), pick("total_amount"), pick("description")];
      if (!match) return notFound(fields, "Item tidak ditemukan di snapshot revisi.");
      if (blank(match.accountCode)) return { result: "data_tidak_cukup", evidence: { fields, note: "Kode akun item di snapshot revisi kosong." } };
      return { result: match.accountCode === expectation.to ? "terpenuhi" : "belum_terpenuhi", evidence: { fields } };
    }
    case "hapus_item": {
      const fields = [pick("total_amount"), pick("description")];
      if (!match) return { result: "terpenuhi", evidence: { fields: fields.map((entry) => ({ ...entry, after: null })), note: "Item tidak ada di snapshot revisi." } };
      return { result: match.totalAmount === 0 ? "terpenuhi" : "belum_terpenuhi", evidence: { fields, ...(match.totalAmount === 0 ? { note: "Total item menjadi 0." } : {}) } };
    }
    case "turunkan_nilai": {
      const fields: Field[] = [];
      if (expectation.maxUnitPrice !== undefined) fields.push(pick("unit_price", expectation.maxUnitPrice));
      if (expectation.maxTotal !== undefined) fields.push(pick("total_amount", expectation.maxTotal));
      fields.push(pick("quantity"));
      if (!match) return notFound(fields, "Item tidak ditemukan di snapshot revisi.");
      const withinPrice = expectation.maxUnitPrice === undefined || match.unitPrice <= expectation.maxUnitPrice;
      const withinTotal = expectation.maxTotal === undefined || match.totalAmount <= expectation.maxTotal;
      return { result: withinPrice && withinTotal ? "terpenuhi" : "belum_terpenuhi", evidence: { fields } };
    }
    case "rinci_item": {
      const fields = [pick("quantity"), pick("unit"), pick("description")];
      if (!match) return notFound(fields, "Item tidak ditemukan di snapshot revisi.");
      const volumeOk = match.quantity > 1 && !blank(match.unit) && !isPackageUnit(match.unit);
      const descriptionChanged = normalize(match.description) !== normalize(base.description);
      const breakdownOk = descriptionChanged && hasVolumeBreakdown(match);
      if (volumeOk || breakdownOk) return { result: "terpenuhi", evidence: { fields } };
      // Volume > 1 tetapi satuan tidak diketahui: belum bisa dinilai tanpa satuan.
      if (match.quantity > 1 && blank(match.unit)) return { result: "data_tidak_cukup", evidence: { fields, note: "Satuan item di snapshot revisi kosong." } };
      return { result: "belum_terpenuhi", evidence: { fields } };
    }
  }
}
