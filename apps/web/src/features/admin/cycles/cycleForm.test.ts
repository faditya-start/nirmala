// @ts-nocheck node --test runs this file directly (type stripping); the ".ts" import suffix is not allowed by tsc.
import assert from "node:assert/strict";
import test from "node:test";
import { fromDateInput, sortCycles, toDateInput, validateCycleForm } from "./cycleForm.ts";

test("sortCycles: newest year first, Alokasi before Pagu", () => {
  const rows = [
    { fiscalYear: 2025, stage: "alokasi" },
    { fiscalYear: 2026, stage: "pagu" },
    { fiscalYear: 2026, stage: "alokasi" }
  ];
  assert.deepEqual(sortCycles(rows).map((row) => `${row.fiscalYear}${row.stage}`), ["2026alokasi", "2026pagu", "2025alokasi"]);
});

test("validateCycleForm", () => {
  assert.deepEqual(validateCycleForm({ fiscalYear: "2027", stage: "alokasi", adkDeadline: "" }), {});
  assert.ok(validateCycleForm({ fiscalYear: "27", stage: "alokasi", adkDeadline: "" }).fiscalYear);
  assert.ok(validateCycleForm({ fiscalYear: "3000", stage: "alokasi", adkDeadline: "" }).fiscalYear);
  assert.ok(validateCycleForm({ fiscalYear: "2027", stage: "", adkDeadline: "" }).stage);
});

test("date input round trip keeps the calendar day", () => {
  assert.equal(toDateInput(fromDateInput("2026-11-12")), "2026-11-12");
  assert.equal(fromDateInput(""), null);
  assert.equal(toDateInput(null), "");
});
