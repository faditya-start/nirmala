import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPercent,
  currentStepLabel,
  evidenceText,
  formatDuration,
  formatFileSize,
  looksLikeSipeka,
  rowAction,
  rowErrorReasonText,
  rowErrorValueText,
  versionColumns,
  versionHint,
  waitingSteps
} from "./logic.ts";

const snap = (versionNo) => ({ versionNo, label: versionNo === 1 ? "Awal" : "Revisi" });

test("formatFileSize uses id-ID decimals", () => {
  assert.equal(formatFileSize(6_710_886), "6,4 MB");
  assert.equal(formatFileSize(900), "900 B");
  assert.equal(formatFileSize(2048), "2 KB");
});

test("formatDuration", () => {
  assert.equal(formatDuration(38_000), "38 detik");
  assert.equal(formatDuration(72_000), "1 menit 12 detik");
  assert.equal(formatDuration(300), "kurang dari 1 detik");
  assert.equal(formatDuration(null), null);
});

test("rowAction: v1+v2 -> view, v1 only -> import v2, none -> import v1", () => {
  assert.equal(rowAction([snap(1), snap(2)], 3, true).kind, "view");
  assert.deepEqual(rowAction([snap(1)], 2, true), { kind: "import", versionNo: 2 });
  assert.deepEqual(rowAction([], 1, true), { kind: "import", versionNo: 1 });
  assert.equal(rowAction([snap(1)], 2, false).kind, "view");
  assert.equal(rowAction([], 1, false).kind, "none");
});

test("versionColumns always has v1 and v2", () => {
  assert.deepEqual(versionColumns([[]]), [1, 2]);
  assert.deepEqual(versionColumns([[snap(1), snap(2), snap(3)]]), [1, 2, 3]);
});

test("versionHint", () => {
  assert.equal(versionHint([]), "Label versi untuk snapshot baru.");
  assert.equal(versionHint([snap(1)]), "v1 · Awal sudah ada untuk eselon I ini.");
});

test("steps and percent", () => {
  assert.equal(currentStepLabel(waitingSteps()), "Membaca file");
  assert.equal(currentStepLabel([{ key: "baca_file", status: "selesai" }, { key: "simpan_item", status: "berjalan" }]), "Menyimpan item");
  assert.equal(clampPercent(140), 100);
  assert.equal(clampPercent(Number.NaN), 0);
});

test("row error text", () => {
  assert.equal(rowErrorValueText(null), "(kosong)");
  assert.equal(rowErrorValueText("12,5x"), "12,5x");
  assert.equal(rowErrorReasonText("bukan_angka", "x"), "Bukan angka");
  assert.equal(rowErrorReasonText("format_tidak_valid", "Tanggal salah."), "Tanggal salah.");
});

test("evidenceText prefers the note", () => {
  assert.equal(evidenceText({ fields: [], note: "Akun masih 522191" }), "Akun masih 522191");
  assert.equal(evidenceText({ fields: [{ field: "account_code", before: "532111", after: "526113" }] }), "532111 → 526113");
});

test("looksLikeSipeka reads only the header line", () => {
  assert.equal(looksLikeSipeka("﻿BAES1,TAHUN,VOLKEG\n1,2026,3"), true);
  assert.equal(looksLikeSipeka("a,b,c\nBAES1,TAHUN"), false);
});
