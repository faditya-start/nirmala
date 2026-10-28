import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RISK_CONFIG, scoreRisk, validateRiskConfig } from "../src/services/riskScoring.ts";

test("risk scoring is deterministic for the same input", () => {
  const input = { unitPrice: 25_000_000, referencePrice: 18_000_000, basCode: "521211", description: "Pengadaan perangkat survei sintetis", historicalSimilarity: 72, revisionCount: 0 };
  assert.deepEqual(scoreRisk(input), scoreRisk(input));
});

test("missing reference data does not increase the score", () => {
  const result = scoreRisk({ unitPrice: 25_000_000, basCode: "521211", description: "Pengadaan perangkat survei sintetis" });
  const priceFactor = result.factors.find((factor) => factor.code === "price_variance");
  assert.equal(priceFactor?.normalizedScore, null);
  assert.equal(priceFactor?.contribution, null);
  assert.equal(result.dataCompleteness, "partial");
});

test("risk configuration requires weights to total one hundred", () => {
  assert.equal(validateRiskConfig(DEFAULT_RISK_CONFIG), null);
  assert.match(validateRiskConfig({ ...DEFAULT_RISK_CONFIG, weights: { ...DEFAULT_RISK_CONFIG.weights, price_variance: 36 } }), /100/);
});
