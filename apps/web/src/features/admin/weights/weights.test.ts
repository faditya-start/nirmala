// @ts-nocheck node --test runs this file directly (type stripping); the ".ts" import suffix is not allowed by tsc.
import assert from "node:assert/strict";
import test from "node:test";
import { formatDelta, invalidCodes, isDirty, parseWhole, thresholdError, toDraft, totalOf, totalState, versionLine } from "./weights.ts";

const active = { weights: { price_vs_peer: 30, risky_account: 20, satker_history: 20, description_quality: 15, change_from_previous: 15 }, thresholds: { medium: 35, high: 70 } };

test("parseWhole accepts whole numbers only", () => {
  assert.equal(parseWhole("25"), 25);
  assert.equal(parseWhole(" 7 "), 7);
  for (const bad of ["", "2.5", "-1", "abc", "1000"]) assert.equal(parseWhole(bad), null);
});

test("total and state: design example 25/20/20/20/15 totals 100", () => {
  const draft = { ...toDraft(active.weights), price_vs_peer: "25", description_quality: "20" };
  assert.equal(totalOf(draft), 100);
  assert.deepEqual(totalState(draft), { ok: true });
  assert.deepEqual(totalState({ ...draft, risky_account: "25" }), { ok: false, reason: "total", total: 105 });
  assert.equal(totalState({ ...draft, risky_account: "" }).reason, "invalid");
  assert.deepEqual(invalidCodes({ ...draft, satker_history: "101" }), ["satker_history"]);
});

test("formatDelta", () => {
  assert.equal(formatDelta("25", 30), "-5");
  assert.equal(formatDelta("20", 15), "+5");
  assert.equal(formatDelta("20", 20), "—");
  assert.equal(formatDelta("", 20), "—");
});

test("thresholdError", () => {
  assert.equal(thresholdError({ medium: "35", high: "70" }), null);
  assert.match(thresholdError({ medium: "70", high: "70" }), /lebih kecil/);
  assert.match(thresholdError({ medium: "x", high: "70" }), /0-100/);
});

test("isDirty compares against the active version", () => {
  assert.equal(isDirty(toDraft(active.weights), { medium: "35", high: "70" }, active), false);
  assert.equal(isDirty({ ...toDraft(active.weights), price_vs_peer: "25" }, { medium: "35", high: "70" }, active), true);
  assert.equal(isDirty(toDraft(active.weights), { medium: "40", high: "70" }, active), true);
});

test("versionLine", () => {
  assert.equal(versionLine(active.weights, active.thresholds), "30 / 20 / 20 / 15 / 15 · ambang 35 dan 70");
});
