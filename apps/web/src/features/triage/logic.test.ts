import assert from "node:assert/strict";
import { test } from "node:test";
import { expectationFromForm, formFromExpectation, parseAmount, describeExpectation, EMPTY_EXPECTATION_FORM } from "./expectation.ts";
import { EMPTY_FILTER, filterToParams, itemPath, pageForPosition, parseUrlState, urlStateToParams } from "./filters.ts";

test("parseAmount menerima angka bulat dan pemisah ribuan titik", () => {
  assert.equal(parseAmount(""), undefined);
  assert.equal(parseAmount("350000"), 350000);
  assert.equal(parseAmount("350.000"), 350000);
  assert.equal(parseAmount("1.250.000.000"), 1250000000);
  assert.equal(parseAmount("12,5"), null);
  assert.equal(parseAmount("-1"), null);
  assert.equal(parseAmount("abc"), null);
});

test("ekspektasi: setiap tipe menghasilkan Expectation valid", () => {
  const base = { ...EMPTY_EXPECTATION_FORM };
  assert.deepEqual(expectationFromForm({ ...base, type: "hapus_item" }), { ok: true, value: { type: "hapus_item" } });
  assert.deepEqual(expectationFromForm({ ...base, type: "rinci_item" }), { ok: true, value: { type: "rinci_item" } });
  assert.deepEqual(expectationFromForm({ ...base, type: "ganti_akun", accountCode: "521111" }), { ok: true, value: { type: "ganti_akun", to: "521111" } });
  assert.deepEqual(expectationFromForm({ ...base, type: "manual", instruction: "  Rinci kebutuhan  " }), { ok: true, value: { type: "manual", instruction: "Rinci kebutuhan" } });
  assert.deepEqual(expectationFromForm({ ...base, type: "turunkan_nilai", maxUnitPrice: "184.000" }), { ok: true, value: { type: "turunkan_nilai", maxUnitPrice: 184000 } });
  assert.deepEqual(expectationFromForm({ ...base, type: "turunkan_nilai", maxTotal: "0", maxUnitPrice: "10" }), { ok: true, value: { type: "turunkan_nilai", maxUnitPrice: 10, maxTotal: 0 } });
});

test("ekspektasi: galat per isian", () => {
  const base = { ...EMPTY_EXPECTATION_FORM };
  assert.equal(expectationFromForm(base).ok, false);
  const akun = expectationFromForm({ ...base, type: "ganti_akun", accountCode: "5211" });
  assert.equal(akun.ok === false && akun.errors.accountCode, "Kode akun harus 6 digit.");
  const kosong = expectationFromForm({ ...base, type: "turunkan_nilai" });
  assert.equal(kosong.ok === false && kosong.errors.limit, "Isi batas harga satuan atau batas total.");
  const huruf = expectationFromForm({ ...base, type: "turunkan_nilai", maxTotal: "1,5" });
  assert.equal(huruf.ok, false);
  const manual = expectationFromForm({ ...base, type: "manual", instruction: "  " });
  assert.equal(manual.ok === false && Boolean(manual.errors.instruction), true);
});

test("ekspektasi: bolak-balik dari bawaan aturan", () => {
  for (const expectation of [
    { type: "hapus_item" as const },
    { type: "ganti_akun" as const, to: "521111" },
    { type: "turunkan_nilai" as const, maxTotal: 5000 },
    { type: "manual" as const, instruction: "Cek" }
  ]) {
    assert.deepEqual(expectationFromForm(formFromExpectation(expectation)), { ok: true, value: expectation });
  }
  assert.equal(formFromExpectation(null).type, "");
  assert.equal(describeExpectation({ type: "ganti_akun", to: "521111" }), "Ganti akun ke 521111");
});

test("filter URL: nilai default tidak ditulis, nilai tidak valid diabaikan", () => {
  assert.equal(filterToParams(EMPTY_FILTER).toString(), "");
  const state = parseUrlState(new URLSearchParams("onlyFlagged=true&decision=bogus&ruleCategory=AKUN&page=0&q=%20laptop&sort=score"));
  assert.equal(state.onlyFlagged, true);
  assert.equal(state.decision, "");
  assert.equal(state.ruleCategory, "AKUN");
  assert.equal(state.page, 1);
  assert.equal(state.sort, "score");
  const back = urlStateToParams({ ...state, page: 3 }).toString();
  assert.equal(parseUrlState(new URLSearchParams(back)).page, 3);
  assert.equal(itemPath("a b", { ...EMPTY_FILTER, onlyFlagged: true }), "/triage/a%20b?onlyFlagged=true");
  assert.equal(pageForPosition(26), 2);
  assert.equal(pageForPosition(25), 1);
});
