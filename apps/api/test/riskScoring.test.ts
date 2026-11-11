import test from "node:test";
import assert from "node:assert/strict";
import { FACTOR_CODES } from "@nirmala/shared";
import { DEFAULT_RISK_PARAMS, DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS } from "../src/db/seeds/reference.ts";
import { scoreItem, validateRiskConfig, type ScoreConfig, type ScoreInput } from "../src/services/riskScoring.ts";

const config: ScoreConfig = { weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS, params: DEFAULT_RISK_PARAMS };
const base: ScoreInput = {
  item: { description: "Honorarium narasumber kegiatan", accountCode: "521213", unit: "OJ", quantity: 6, unitPrice: 1_750_000, totalAmount: 10_500_000, hasVolumeDetail: true },
  peer: null,
  finding: { hasProfile: false, total: 0, open: 0 },
  change: { firstSnapshot: true, changeType: "baru", previousTotal: null }
};
const factor = (input: ScoreInput, code: (typeof FACTOR_CODES)[number]) => scoreItem(input, config).factors.find((entry) => entry.code === code)!;
const peer = (ratio: number) => ({ median: 1_000_000, satkerCount: 9, min: 800_000, max: 4_000_000, unit: "OJ", ratio });

test("skor deterministik untuk input yang sama dan faktor selalu lima urut F1..F5", () => {
  assert.deepEqual(scoreItem(base, config), scoreItem(structuredClone(base), config));
  assert.deepEqual(scoreItem(base, config).factors.map((entry) => entry.code), [...FACTOR_CODES]);
});

test("F1: 1,0x = 0, 2,0x atau lebih = 100, linear di antaranya; tanpa pembanding = data tidak tersedia", () => {
  assert.equal(factor({ ...base, peer: peer(1) }, "price_vs_peer").normalizedScore, 0);
  assert.equal(factor({ ...base, peer: peer(0.6) }, "price_vs_peer").normalizedScore, 0);
  assert.equal(factor({ ...base, peer: peer(1.5) }, "price_vs_peer").normalizedScore, 50);
  assert.equal(factor({ ...base, peer: peer(2.4) }, "price_vs_peer").normalizedScore, 100);
  const missing = factor(base, "price_vs_peer");
  assert.equal(missing.dataAvailable, false);
  assert.equal(missing.normalizedScore, null);
  assert.equal(missing.contribution, null);
  assert.match(factor({ ...base, peer: peer(1.9) }, "price_vs_peer").explanation, /^1,9× median 9 Satker/);
});

test("F2: skor tetap per akun dari konfigurasi; akun lain = 0", () => {
  assert.equal(factor(base, "risky_account").normalizedScore, 70);
  assert.equal(factor({ ...base, item: { ...base.item, accountCode: "521111" } }, "risky_account").normalizedScore, 0);
});

test("F3: rekomendasi ditimbang BS/BT x2 dan dibatasi 100; tanpa profil = data tidak tersedia", () => {
  assert.equal(factor({ ...base, finding: { hasProfile: true, total: 12, open: 5 } }, "satker_history").normalizedScore, 17);
  assert.equal(factor({ ...base, finding: { hasProfile: true, total: 90, open: 40 } }, "satker_history").normalizedScore, 100);
  assert.equal(factor({ ...base, finding: { hasProfile: true, total: 0, open: 0 } }, "satker_history").normalizedScore, 0);
  assert.equal(factor(base, "satker_history").dataAvailable, false);
});

test("F4: 50 poin per kondisi (uraian < 3 kata, paket besar volume <= 1, VOL_KEG_1 kosong), maks. 100", () => {
  assert.equal(factor(base, "description_quality").normalizedScore, 0);
  assert.equal(factor({ ...base, item: { ...base.item, description: "Biaya lain" } }, "description_quality").normalizedScore, 50);
  const bad = { ...base.item, description: "Lain-lain", unit: "Paket", quantity: 1, totalAmount: 100_000_000, hasVolumeDetail: false };
  assert.equal(factor({ ...base, item: bad }, "description_quality").normalizedScore, 100);
  assert.equal(factor({ ...base, item: { ...base.item, unit: "paket", quantity: 1, totalAmount: 99_999_999 } }, "description_quality").normalizedScore, 0);
});

test("F5: snapshot pertama tidak tersedia; baru 60; naik > 20% = 80; berubah lain 30; tetap 0", () => {
  const change = (value: Partial<ScoreInput["change"]>): ScoreInput => ({ ...base, change: { firstSnapshot: false, changeType: "berubah", previousTotal: 1000, ...value } });
  assert.equal(factor(base, "change_from_previous").dataAvailable, false);
  assert.equal(factor(change({ changeType: "baru", previousTotal: null }), "change_from_previous").normalizedScore, 60);
  assert.equal(factor({ ...change({ previousTotal: 1000 }), item: { ...base.item, totalAmount: 1201 } }, "change_from_previous").normalizedScore, 80);
  assert.equal(factor({ ...change({ previousTotal: 1000 }), item: { ...base.item, totalAmount: 1200 } }, "change_from_previous").normalizedScore, 30);
  assert.equal(factor(change({ changeType: "tetap" }), "change_from_previous").normalizedScore, 0);
});

test("faktor tanpa data tidak punya kontribusi dan tidak menaikkan skor", () => {
  const withoutData = scoreItem(base, config);
  assert.equal(withoutData.dataCompleteness, "partial");
  for (const entry of withoutData.factors.filter((item) => !item.dataAvailable)) assert.equal(entry.contribution, null);
  // F2 = 70 (bobot 20) dan F4 = 0 (bobot 15): skor = 70*20 / 35 = 40, bukan 14.
  assert.equal(withoutData.activeWeight, 35);
  assert.equal(withoutData.score, 40);
  // Menambah faktor yang datanya ada dengan nilai 0 menurunkan skor; menambah data tidak pernah membuat skor "diisi" dari ketiadaan.
  const withChange = scoreItem({ ...base, change: { firstSnapshot: false, changeType: "tetap", previousTotal: 1 } }, config);
  assert.ok(withChange.score < withoutData.score);
});

test("kategori mengikuti ambang dan skor 100 untuk semua faktor maksimal", () => {
  const worst: ScoreInput = {
    item: { description: "x", accountCode: "524114", unit: "paket", quantity: 1, unitPrice: 5, totalAmount: 500_000_000, hasVolumeDetail: false },
    peer: peer(3), finding: { hasProfile: true, total: 100, open: 50 }, change: { firstSnapshot: false, changeType: "baru", previousTotal: null }
  };
  const result = scoreItem(worst, config);
  assert.equal(result.category, "high");
  assert.ok(result.score >= 70);
  const low = scoreItem({ ...base, item: { ...base.item, accountCode: "521111" }, change: { firstSnapshot: false, changeType: "tetap", previousTotal: 1 } }, config);
  assert.equal(low.category, "low");
});

test("konfigurasi risiko: bobot harus berjumlah 100 dan ambang berurutan", () => {
  assert.equal(validateRiskConfig(config), null);
  assert.match(validateRiskConfig({ ...config, weights: { ...config.weights, price_vs_peer: 31 } })!, /100/);
  assert.match(validateRiskConfig({ ...config, thresholds: { medium: 70, high: 35 } })!, /Ambang/);
  assert.match(validateRiskConfig({ ...config, weights: { ...config.weights, price_vs_peer: -1, risky_account: 51 } })!, /negatif/);
});
