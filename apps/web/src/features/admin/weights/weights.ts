/** Pure logic for S12b Bobot skor. No app imports, so `node --test` runs weights.test.ts directly. */

export const FACTOR_ORDER = ["price_vs_peer", "risky_account", "satker_history", "description_quality", "change_from_previous"] as const;
export type FactorCode = (typeof FACTOR_ORDER)[number];
export type WeightDraft = Record<FactorCode, string>;
export interface Thresholds {
  medium: number;
  high: number;
}
export interface ThresholdDraft {
  medium: string;
  high: string;
}

/** "25" -> 25. Empty, decimals, negatives and text are not weights (null). Above 100 is kept so the form can say why it is wrong. */
export function parseWhole(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : null;
}

export function toDraft(weights: Record<FactorCode, number>): WeightDraft {
  return Object.fromEntries(FACTOR_ORDER.map((code) => [code, String(weights[code])])) as WeightDraft;
}

/** Sum of the draft; an unreadable cell counts as 0 and is reported by `invalidCodes`. */
export function totalOf(draft: WeightDraft): number {
  return FACTOR_ORDER.reduce((sum, code) => sum + (parseWhole(draft[code]) ?? 0), 0);
}

export function invalidCodes(draft: WeightDraft): FactorCode[] {
  return FACTOR_ORDER.filter((code) => {
    const value = parseWhole(draft[code]);
    return value === null || value > 100;
  });
}

/** Selisih column: "-5", "+5" or "—" when unchanged or unreadable. */
export function formatDelta(draftText: string, current: number): string {
  const value = parseWhole(draftText);
  if (value === null || value === current) return "—";
  const diff = value - current;
  return diff > 0 ? `+${diff}` : String(diff);
}

export function thresholdError(draft: ThresholdDraft): string | null {
  const medium = parseWhole(draft.medium);
  const high = parseWhole(draft.high);
  if (medium === null || high === null || medium > 100 || high > 100) return "Ambang harus bilangan bulat 0-100.";
  if (medium >= high) return "Ambang sedang harus lebih kecil dari ambang tinggi.";
  return null;
}

export function isDirty(draft: WeightDraft, thresholds: ThresholdDraft, active: { weights: Record<FactorCode, number>; thresholds: Thresholds }): boolean {
  return FACTOR_ORDER.some((code) => parseWhole(draft[code]) !== active.weights[code]) || parseWhole(thresholds.medium) !== active.thresholds.medium || parseWhole(thresholds.high) !== active.thresholds.high;
}

/** "30 / 20 / 20 / 15 / 15 · ambang 35 dan 70" (Riwayat versi). */
export function versionLine(weights: Record<FactorCode, number>, thresholds: Thresholds): string {
  return `${FACTOR_ORDER.map((code) => weights[code]).join(" / ")} · ambang ${thresholds.medium} dan ${thresholds.high}`;
}

export type TotalState = { ok: true } | { ok: false; reason: "invalid" | "total"; total: number };

export function totalState(draft: WeightDraft): TotalState {
  if (invalidCodes(draft).length > 0) return { ok: false, reason: "invalid", total: totalOf(draft) };
  const total = totalOf(draft);
  return total === 100 ? { ok: true } : { ok: false, reason: "total", total };
}
