/**
 * Skor risiko 0-100 untuk mengurutkan item (docs/rule-catalog.md §4). Fungsi murni.
 * Lima faktor, masing-masing 0-100 atau "data tidak tersedia":
 *   F1 price_vs_peer, F2 risky_account, F3 satker_history, F4 description_quality, F5 change_from_previous.
 *
 * Skor = jumlah (nilai faktor x bobot) dibagi jumlah bobot faktor yang datanya tersedia. Faktor tanpa data
 * (`dataAvailable = false`) tidak punya kontribusi dan tidak ikut penyebut, jadi ketiadaan data tidak menaikkan
 * maupun menurunkan skor item. Skor hanya dipakai untuk mengurutkan; aturan (flag) tidak mengubahnya.
 */
import { FACTOR_CODES, type FactorCode, type RiskCategory } from "@nirmala/shared";
import type { RiskConfigParams, RiskConfigWeights, StoredFactor } from "../db/schema.js";
import type { PeerComparison } from "../detection/peer.js";

export const FACTOR_META: Record<FactorCode, { label: string; description: string }> = {
  price_vs_peer: { label: "Harga vs Satker lain", description: "Rasio harga satuan terhadap median Satker lain untuk uraian dan satuan yang sama" },
  risky_account: { label: "Akun rawan", description: "Skor tetap per akun yang sering diblokir atau menjadi tema temuan BPK" },
  satker_history: { label: "Riwayat temuan BPK Satker", description: "Jumlah rekomendasi BPK bertema penganggaran untuk Satker ini" },
  description_quality: { label: "Kualitas uraian", description: "Uraian singkat, satuan paket tanpa rincian, atau volume tidak terisi" },
  change_from_previous: { label: "Perubahan dari versi sebelumnya", description: "Item baru atau nilainya naik dibanding snapshot sebelumnya" }
};

export interface ScoreConfig {
  weights: RiskConfigWeights;
  thresholds: { medium: number; high: number };
  params: RiskConfigParams;
}

export interface FindingProfile {
  /** false = Satker tidak punya profil temuan sama sekali (F3 tidak tersedia). */
  hasProfile: boolean;
  /** Rekomendasi bertema `penganggaran`. */
  total: number;
  /** BS + BT di antaranya. */
  open: number;
}

export interface ScoreInput {
  item: { description: string; accountCode: string; unit: string | null; quantity: number; unitPrice: number; totalAmount: number; hasVolumeDetail: boolean };
  peer: PeerComparison | null;
  finding: FindingProfile;
  change: {
    /** Snapshot pertama eselon I di siklus (tidak ada pembanding). */
    firstSnapshot: boolean;
    changeType: "baru" | "berubah" | "tetap";
    /** Total padanan di snapshot sebelumnya; null bila tidak ada. */
    previousTotal: number | null;
  };
}

export interface ScoreResult {
  score: number;
  category: RiskCategory;
  factors: StoredFactor[];
  dataCompleteness: "sufficient" | "partial";
  /** Jumlah bobot faktor yang datanya tersedia (penyebut skor). */
  activeWeight: number;
}

const PACKAGE_UNITS = new Set(["paket", "ls", "keg", "kegiatan", "lumpsum", "lump sum"]);
const clamp = (value: number, low = 0, high = 100) => Math.min(high, Math.max(low, value));
const round2 = (value: number) => Math.round(value * 100) / 100;
const rupiah = (value: number) => `Rp${value.toLocaleString("id-ID")}`;
const decimal = (value: number) => (Math.round(value * 10) / 10).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type Raw = { value: number | null; explanation: string };

function priceVsPeer(input: ScoreInput, config: ScoreConfig): Raw {
  if (!input.peer) return { value: null, explanation: `Pembanding belum memadai: uraian dan satuan yang sama belum muncul di ${config.params.peerMinSatker} Satker atau lebih pada siklus ini.` };
  const { ratio, satkerCount } = input.peer;
  return { value: clamp((ratio - 1) * 100), explanation: `${decimal(ratio)}× median ${satkerCount} Satker untuk uraian dan satuan yang sama.` };
}

function riskyAccount(input: ScoreInput, config: ScoreConfig): Raw {
  const fixed = config.params.riskyAccounts[input.item.accountCode];
  return fixed === undefined
    ? { value: 0, explanation: `Akun ${input.item.accountCode} tidak ada di daftar akun rawan.` }
    : { value: clamp(fixed), explanation: `Akun ${input.item.accountCode} termasuk akun rawan (skor tetap ${Math.round(fixed)}).` };
}

function satkerHistory(input: ScoreInput): Raw {
  if (!input.finding.hasProfile) return { value: null, explanation: "Satker ini belum punya profil temuan BPK." };
  const { total, open } = input.finding;
  // Setiap rekomendasi dihitung 1 poin; yang belum selesai (BS/BT) dihitung 2 poin; dibatasi 100.
  return { value: clamp(total + open), explanation: `${total} rekomendasi BPK bertema penganggaran, ${open} belum selesai (belum selesai dihitung dua kali, maks. 100).` };
}

function descriptionQuality(input: ScoreInput, config: ScoreConfig): Raw {
  const { description, unit, quantity, totalAmount, hasVolumeDetail } = input.item;
  const reasons: string[] = [];
  if (description.trim().split(/\s+/).filter(Boolean).length < 3) reasons.push("uraian kurang dari 3 kata");
  if (unit && PACKAGE_UNITS.has(unit.trim().toLowerCase()) && quantity <= 1 && totalAmount >= config.params.packageThreshold) reasons.push(`satuan ${unit.trim()} dengan volume ≤ 1 dan total ${rupiah(totalAmount)} (≥ ${rupiah(config.params.packageThreshold)})`);
  if (!hasVolumeDetail) reasons.push("VOL_KEG_1 tidak terisi");
  // 50 poin per kondisi yang terpenuhi, maks. 100.
  return { value: clamp(reasons.length * 50), explanation: reasons.length ? `Perlu dirinci: ${reasons.join("; ")}.` : "Uraian dan rincian volume memadai." };
}

function changeFromPrevious(input: ScoreInput): Raw {
  const { firstSnapshot, changeType, previousTotal } = input.change;
  if (firstSnapshot) return { value: null, explanation: "Snapshot pertama: belum ada versi sebelumnya untuk dibandingkan." };
  if (changeType === "baru") return { value: 60, explanation: "Item baru di snapshot ini; tidak ada padanan di versi sebelumnya." };
  if (changeType === "tetap") return { value: 0, explanation: "Item tidak berubah dari versi sebelumnya." };
  if (previousTotal !== null && previousTotal > 0 && input.item.totalAmount > previousTotal * 1.2) {
    return { value: 80, explanation: `Total naik ${Math.round((input.item.totalAmount / previousTotal - 1) * 100)}% dari versi sebelumnya (${rupiah(previousTotal)} menjadi ${rupiah(input.item.totalAmount)}).` };
  }
  return { value: 30, explanation: "Item berubah dari versi sebelumnya, total tidak naik lebih dari 20%." };
}

export function scoreItem(input: ScoreInput, config: ScoreConfig): ScoreResult {
  const raw: Record<FactorCode, Raw> = {
    price_vs_peer: priceVsPeer(input, config),
    risky_account: riskyAccount(input, config),
    satker_history: satkerHistory(input),
    description_quality: descriptionQuality(input, config),
    change_from_previous: changeFromPrevious(input)
  };
  const factors: StoredFactor[] = FACTOR_CODES.map((code) => {
    const { value, explanation } = raw[code];
    const weight = config.weights[code];
    const normalizedScore = value === null ? null : Math.round(value);
    return { code, label: FACTOR_META[code].label, normalizedScore, weight, contribution: normalizedScore === null ? null : round2(normalizedScore * weight / 100), explanation, dataAvailable: value !== null };
  });
  const available = factors.filter((factor) => factor.dataAvailable);
  const activeWeight = available.reduce((sum, factor) => sum + factor.weight, 0);
  const score = activeWeight === 0 ? 0 : Math.round(available.reduce((sum, factor) => sum + (factor.normalizedScore ?? 0) * factor.weight, 0) / activeWeight);
  return { score, category: categorize(score, config.thresholds), factors, dataCompleteness: available.length === factors.length ? "sufficient" : "partial", activeWeight };
}

export function categorize(score: number, thresholds: { medium: number; high: number }): RiskCategory {
  return score >= thresholds.high ? "high" : score >= thresholds.medium ? "medium" : "low";
}

/** Pemeriksaan bobot (jumlah 100) dan ambang; dipakai juga oleh endpoint admin. null = valid. */
export function validateRiskConfig(config: Pick<ScoreConfig, "weights" | "thresholds">): string | null {
  const weights = FACTOR_CODES.map((code) => config.weights[code]);
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) return "Bobot faktor tidak boleh negatif.";
  if (weights.reduce((sum, weight) => sum + weight, 0) !== 100) return "Jumlah bobot faktor harus 100%.";
  const { medium, high } = config.thresholds;
  if (!Number.isInteger(medium) || !Number.isInteger(high) || medium < 0 || high > 100 || medium >= high) return "Ambang risiko harus berurutan pada rentang 0 sampai 100.";
  return null;
}
