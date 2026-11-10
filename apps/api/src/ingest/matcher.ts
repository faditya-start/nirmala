import type { ChangeType } from "@nirmala/shared";

/** Bagian kunci yang sama di snapshot awal dan revisi. */
export interface KeyParts {
  satkerCode: string;
  programCode: string;
  activityCode: string;
  outputCode: string;
  suboutputCode: string;
  componentCode: string;
  subcomponentCode: string;
  description: string;
}

export interface Comparable {
  accountCode: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  totalAmount: number;
}

export function normalizeDescription(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Prefiks kunci tanpa akun dan tanpa urutan kemunculan (data-model.md §4). */
export function itemKeyBase(parts: KeyParts) {
  return [parts.satkerCode, parts.programCode, parts.activityCode, parts.outputCode, parts.suboutputCode, parts.componentCode, parts.subcomponentCode, normalizeDescription(parts.description)].join("|");
}

/** Membangkitkan `item_key` stabil: prefiks + urutan kemunculan untuk uraian kembar di subkomponen yang sama. */
export function createItemKeyer() {
  const seen = new Map<string, number>();
  return (parts: KeyParts) => {
    const base = itemKeyBase(parts);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}|${n}`;
  };
}

/** Kunci cadangan: hierarki + akun + CONS_ITEM. Kosong jika CONS_ITEM tidak ada. */
export function fallbackKey(parts: { workUnitId: string; programCode: string; activityCode: string; outputCode: string; suboutputCode: string; componentCode: string; subcomponentCode: string; accountCode: string; consItem: string | null }) {
  if (!parts.consItem) return null;
  return [parts.workUnitId, parts.programCode, parts.activityCode, parts.outputCode, parts.suboutputCode, parts.componentCode, parts.subcomponentCode, parts.accountCode, parts.consItem].join("|");
}

export function classifyChange(previous: Comparable, current: Comparable): ChangeType {
  const same = previous.accountCode === current.accountCode && previous.quantity === current.quantity && (previous.unit ?? "") === (current.unit ?? "")
    && previous.unitPrice === current.unitPrice && previous.totalAmount === current.totalAmount;
  return same ? "tetap" : "berubah";
}

export interface PreviousItem extends Comparable {
  id: string;
  itemKey: string;
  fallback: string | null;
}

/**
 * Mencocokkan item snapshot baru dengan snapshot sebelumnya, dua langkah berurutan:
 * 1. `matchKey`: `item_key` untuk semua item. 2. `matchFallback`: kunci cadangan, hanya untuk item
 * yang belum cocok dan setelah langkah 1 selesai untuk seluruh berkas (supaya cadangan tidak
 * mengambil item lama yang cocok persis dengan item lain). Satu item lama dipasangkan sekali.
 * Item lama tanpa pasangan = hilang.
 */
export function createMatcher(previous: PreviousItem[]) {
  const byKey = new Map<string, PreviousItem>();
  const byFallback = new Map<string, PreviousItem[]>();
  for (const item of previous) {
    byKey.set(item.itemKey, item);
    if (item.fallback) {
      const list = byFallback.get(item.fallback);
      if (list) list.push(item); else byFallback.set(item.fallback, [item]);
    }
  }
  const used = new Set<string>();
  const take = (found: PreviousItem | undefined, current: Comparable): MatchResult | null => {
    if (!found) return null;
    used.add(found.id);
    return { previousItemId: found.id, changeType: classifyChange(found, current) };
  };

  return {
    matchKey(current: Comparable & { itemKey: string }) {
      const found = byKey.get(current.itemKey);
      return take(found && !used.has(found.id) ? found : undefined, current);
    },
    matchFallback(current: Comparable & { fallback: string | null }) {
      if (!current.fallback) return null;
      return take(byFallback.get(current.fallback)?.find((candidate) => !used.has(candidate.id)), current);
    },
    /** Jumlah item lama tanpa pasangan (hilang). Valid setelah langkah 2 selesai. */
    missingCount: () => previous.length - used.size
  };
}

export interface MatchResult { previousItemId: string; changeType: ChangeType }
