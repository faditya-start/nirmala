import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryCount, classifyFailure, cycleOptionLabel, kpiView, pickCycleId, rowLabel } from "./publicLogic.ts";

test("cycleOptionLabel", () => {
  assert.equal(cycleOptionLabel({ fiscalYear: 2025, stage: "alokasi" }), "TA 2025 · Alokasi anggaran");
  assert.equal(cycleOptionLabel({ fiscalYear: 2026, stage: "pagu" }), "TA 2026 · Pagu anggaran");
});

test("rowLabel renames the merged group", () => {
  assert.equal(rowLabel({ kind: "lainnya", label: "Lainnya" }), "Eselon I lainnya");
  assert.equal(rowLabel({ kind: "eselon", label: "Ditjen Contoh A" }), "Ditjen Contoh A");
});

test("categoryCount tolerates missing and non-finite values", () => {
  assert.equal(categoryCount({ AKUN: 14 }, "AKUN"), 14);
  assert.equal(categoryCount({ AKUN: 14 }, "EFISIENSI"), 0);
  assert.equal(categoryCount({ AKUN: Number.NaN }, "AKUN"), 0);
  assert.equal(categoryCount(undefined, "AKUN"), 0);
});

test("kpiView formats the designed example", () => {
  const view = kpiView({ notesTotal: 46, closedBeforeDeadline: 38, closedBeforeDeadlinePercent: 83, medianDaysToClose: 6 });
  assert.equal(view.notes.value, "46");
  assert.equal(view.closed.value, "83%");
  assert.equal(view.closed.hint, "38 dari 46 catatan ditutup sebelum ADK diajukan");
  assert.equal(view.closed.progress, 0.83);
  assert.equal(view.median.value, "6 hari");
});

test("kpiView handles a cycle without notes or closed notes", () => {
  const empty = kpiView({ notesTotal: 0, closedBeforeDeadline: 0, closedBeforeDeadlinePercent: null, medianDaysToClose: null });
  assert.equal(empty.closed.value, "–");
  assert.equal(empty.closed.progress, undefined);
  assert.equal(empty.median.value, "–");
  const decimal = kpiView({ notesTotal: 1200, closedBeforeDeadline: 3, closedBeforeDeadlinePercent: 0, medianDaysToClose: 6.5 });
  assert.equal(decimal.notes.value, "1.200");
  assert.equal(decimal.median.value, "6,5 hari");
});

test("classifyFailure", () => {
  assert.equal(classifyFailure({ status: 404 }), "tidak_ditemukan");
  assert.equal(classifyFailure({ status: 501 }), "belum_tersedia");
  assert.equal(classifyFailure({ status: 429 }), "terlalu_sering");
  assert.equal(classifyFailure({ status: 500 }), "server");
  assert.equal(classifyFailure(new TypeError("Failed to fetch")), "jaringan");
});

test("pickCycleId falls back to the newest", () => {
  const cycles = [{ id: "a" }, { id: "b" }];
  assert.equal(pickCycleId("b", cycles), "b");
  assert.equal(pickCycleId("zzz", cycles), "a");
  assert.equal(pickCycleId(null, cycles), "a");
  assert.equal(pickCycleId(null, []), null);
});
