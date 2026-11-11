// @ts-nocheck node --test runs this file directly (type stripping); the ".ts" import suffix is not allowed by tsc.
import assert from "node:assert/strict";
import test from "node:test";
import { buildBody, fromDisplayPattern, parseList, toDisplayPattern, toForm, validateForm } from "./ruleForm.ts";

const rule = {
  id: "r2", code: "R02", name: "Outsourcing di luar akun 521111", category: "AKUN", kind: "keyword_wrong_account",
  params: { include: "satpam|pengamanan|outsourc", akunSalah: ["522191", "521119"], akunBenar: "521111", minUnitPrice: 1000000 },
  reasonTemplate: "Biaya tenaga outsourcing menggunakan akun 521111.", source: "x", defaultExpectation: { type: "ganti_akun", to: "521111" },
  active: true, validYear: 2026, validationNote: null, needsValidation: false, appliesToRevisionOnly: false, hitCount: 1, updatedAt: 0
};

test("pattern display and storage round trip", () => {
  assert.equal(toDisplayPattern("a|b|c"), "a | b | c");
  assert.equal(fromDisplayPattern("a | b | c"), "a|b|c");
  assert.equal(toDisplayPattern("(a|b)\\|c"), "(a|b)\\|c");
  assert.equal(fromDisplayPattern(toDisplayPattern(rule.params.include)), rule.params.include);
});

test("parseList accepts commas and spaces", () => {
  assert.deepEqual(parseList("522191, 521119  521213"), ["522191", "521119", "521213"]);
});

test("unchanged form builds no body", () => {
  assert.equal(buildBody(rule, toForm(rule)), null);
});

test("only changed fields are sent and unseen params are kept", () => {
  const form = { ...toForm(rule), akunSalah: "522191, 521119, 521213", active: false };
  const body = buildBody(rule, form);
  assert.deepEqual(Object.keys(body).sort(), ["active", "params"]);
  assert.deepEqual(body.params.akunSalah, ["522191", "521119", "521213"]);
  assert.equal(body.params.minUnitPrice, 1000000);
});

test("ganti_akun follows akun benar for keyword_wrong_account", () => {
  const body = buildBody(rule, { ...toForm(rule), akunBenar: "521112" });
  assert.deepEqual(body.defaultExpectation, { type: "ganti_akun", to: "521112" });
});

test("validation catches bad regex, short accounts and empty values", () => {
  const errors = validateForm("keyword_wrong_account", { ...toForm(rule), name: "ab", include: "(", akunSalah: "12345678", akunBenar: "52" });
  assert.ok(errors.name && errors.include && errors.akunSalah && errors.akunBenar);
  assert.deepEqual(validateForm("keyword_wrong_account", toForm(rule)), {});
});

test("turunkan_nilai needs a limit", () => {
  const errors = validateForm("value_check", { ...toForm(rule), expType: "turunkan_nilai", expMaxUnitPrice: "", expMaxTotal: "" });
  assert.ok(errors.expMaxTotal);
});
