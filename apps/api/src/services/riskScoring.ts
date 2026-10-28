export type RiskFactorCode = "price_variance" | "bas_alignment" | "historical_similarity" | "description_quality" | "revision_pattern";

export interface RiskInput {
  unitPrice: number;
  referencePrice?: number;
  basCode: string;
  description: string;
  historicalSimilarity?: number;
  revisionCount?: number;
  hasRevision?: boolean;
}

export interface RiskConfig {
  version: string;
  weights: Record<RiskFactorCode, number>;
  thresholds: { medium: number; high: number };
}

export interface RiskFactorResult {
  code: RiskFactorCode;
  label: string;
  normalizedScore: number | null;
  weight: number;
  contribution: number | null;
  explanation: string;
  dataAvailable: boolean;
}

export interface RiskResult {
  score: number;
  category: "low" | "medium" | "high";
  factors: RiskFactorResult[];
  dataCompleteness: "sufficient" | "partial";
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  version: "rules-v2",
  weights: { price_variance: 35, bas_alignment: 25, historical_similarity: 20, description_quality: 10, revision_pattern: 10 },
  thresholds: { medium: 35, high: 70 }
};

const labels: Record<RiskFactorCode, string> = {
  price_variance: "Anomali harga terhadap referensi",
  bas_alignment: "Kesesuaian BAS dan uraian",
  historical_similarity: "Kemiripan temuan historis",
  description_quality: "Kualitas dan spesifisitas uraian",
  revision_pattern: "Pola revisi"
};

export function validateRiskConfig(config: RiskConfig): string | null {
  const weights = Object.values(config.weights);
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) return "Bobot faktor tidak boleh negatif.";
  if (Math.round(weights.reduce((sum, weight) => sum + weight, 0) * 100) / 100 !== 100) return "Jumlah bobot faktor harus 100%.";
  if (!Number.isInteger(config.thresholds.medium) || !Number.isInteger(config.thresholds.high) || config.thresholds.medium < 0 || config.thresholds.high > 100 || config.thresholds.medium >= config.thresholds.high) return "Ambang risiko harus berurutan pada rentang 0 sampai 100.";
  return null;
}

export function scoreRisk(input: RiskInput, config: RiskConfig = DEFAULT_RISK_CONFIG): RiskResult {
  const priceScore = input.referencePrice && input.referencePrice > 0 ? Math.min(100, Math.max(0, ((input.unitPrice / input.referencePrice) - 1) * 100 * 2)) : null;
  const basScore = /^(5|6)\d{5}$/.test(input.basCode) && input.description.length >= 20 ? 10 : 55;
  const historyScore = input.historicalSimilarity === undefined ? null : Math.min(100, Math.max(0, input.historicalSimilarity));
  const descriptionScore = input.description.trim().length < 20 ? 75 : input.description.trim().split(/\s+/).length < 5 ? 50 : 10;
  const revisionScore = input.revisionCount === undefined ? null : input.revisionCount > 1 ? 80 : input.hasRevision ? 35 : 5;
  const values: Record<RiskFactorCode, number | null> = { price_variance: priceScore, bas_alignment: basScore, historical_similarity: historyScore, description_quality: descriptionScore, revision_pattern: revisionScore };
  const explanations: Record<RiskFactorCode, string> = {
    price_variance: priceScore === null ? "Referensi harga sepadan belum tersedia; faktor tidak menaikkan skor." : `Deviasi harga dinormalisasi menjadi ${Math.round(priceScore)} dari 100 berdasarkan referensi sintetis.`,
    bas_alignment: basScore > 40 ? "Kode BAS atau uraian memerlukan verifikasi manual." : "Format BAS dan uraian terlihat konsisten pada pemeriksaan awal.",
    historical_similarity: historyScore === null ? "Temuan historis yang sepadan belum tersedia." : `Kemiripan sintetis terukur ${Math.round(historyScore)} dari 100; ini bukan bukti pelanggaran.`,
    description_quality: descriptionScore > 40 ? "Uraian terlalu singkat atau kurang spesifik untuk dibandingkan secara memadai." : "Uraian memiliki detail yang cukup untuk pemeriksaan awal.",
    revision_pattern: revisionScore === null ? "Riwayat revisi belum tersedia." : "Pola revisi perlu dilihat bersama bukti perubahan RKA."
  };
  const factors = (Object.keys(config.weights) as RiskFactorCode[]).map((code) => ({ code, label: labels[code], normalizedScore: values[code], weight: config.weights[code], contribution: values[code] === null ? null : values[code] * config.weights[code] / 100, explanation: explanations[code], dataAvailable: values[code] !== null }));
  const active = factors.filter((factor) => factor.normalizedScore !== null);
  const denominator = active.reduce((sum, factor) => sum + factor.weight, 0);
  const score = denominator === 0 ? 0 : Math.round(active.reduce((sum, factor) => sum + (factor.contribution ?? 0), 0) * 100 / denominator);
  const category = score >= config.thresholds.high ? "high" : score >= config.thresholds.medium ? "medium" : "low";
  return { score, category, factors, dataCompleteness: active.length === factors.length ? "sufficient" : "partial" };
}
