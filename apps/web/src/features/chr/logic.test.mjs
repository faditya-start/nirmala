import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExpectation, chrSubtitle, emptyExpectationForm, estimatePages, expectationToForm, formatLongDate, parseRupiah, validateNoteForm, emptyNoteForm } from "./logic.ts";

test("parseRupiah accepts digits and id-ID dots only", () => {
  assert.equal(parseRupiah(""), undefined);
  assert.equal(parseRupiah("1.250.000"), 1250000);
  assert.equal(parseRupiah("12a"), null);
});

test("buildExpectation validates each kind with the shared schema", () => {
  assert.deepEqual(buildExpectation({ ...emptyExpectationForm("ganti_akun"), to: "521111" }), { ok: true, value: { type: "ganti_akun", to: "521111" } });
  assert.equal(buildExpectation({ ...emptyExpectationForm("ganti_akun"), to: "5211" }).ok, false);
  assert.equal(buildExpectation(emptyExpectationForm("turunkan_nilai")).ok, false);
  assert.deepEqual(buildExpectation({ ...emptyExpectationForm("turunkan_nilai"), maxTotal: "48.600.000" }), { ok: true, value: { type: "turunkan_nilai", maxTotal: 48600000 } });
  assert.equal(buildExpectation(emptyExpectationForm("hapus_item")).ok, true);
  assert.equal(buildExpectation(emptyExpectationForm("rinci_item")).ok, true);
  assert.equal(buildExpectation({ ...emptyExpectationForm("manual"), instruction: "  " }).ok, false);
});

test("expectationToForm round-trips", () => {
  const exp = { type: "turunkan_nilai", maxUnitPrice: 350000 };
  const result = buildExpectation(expectationToForm(exp));
  assert.deepEqual(result.ok && result.value, exp);
});

test("validateNoteForm reports Indonesian field messages", () => {
  const { errors } = validateNoteForm(emptyNoteForm(), { needsTitle: true, needsWorkUnit: true });
  assert.equal(errors.title, "Judul minimal 3 karakter.");
  assert.equal(errors.text, "Teks catatan minimal 5 karakter.");
  assert.equal(errors.workUnitId, "Pilih Satker yang dicatat.");
  assert.ok(errors.expectation);
});

test("subtitle, pages and dates", () => {
  assert.equal(chrSubtitle({ fiscalYear: 2026, stage: "alokasi", documentNumber: null, currentVersion: 0 }), "TA 2026 · Alokasi anggaran · Nomor dibuat saat CHR diterbitkan");
  assert.equal(chrSubtitle({ fiscalYear: 2026, stage: "pagu", documentNumber: "CHR/1/2026/pagu/001", currentVersion: 2 }), "TA 2026 · Pagu anggaran · No. CHR/1/2026/pagu/001 · versi 2");
  assert.equal(estimatePages(1123), 1);
  assert.equal(estimatePages(1124), 2);
  assert.equal(formatLongDate(new Date(2026, 10, 4).getTime()), "4 November 2026");
});
