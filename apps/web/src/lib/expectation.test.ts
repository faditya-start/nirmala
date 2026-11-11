import assert from "node:assert/strict";
import test from "node:test";
import { expectationSentence } from "./expectation";

const fmt = (value: number) => String(value);

test("expectationSentence reads every expectation in plain Indonesian", () => {
  assert.equal(expectationSentence({ type: "ganti_akun", to: "521111" }, fmt), "Ganti akun ke 521111");
  assert.equal(expectationSentence({ type: "hapus_item" }, fmt), "Hapus item");
  assert.equal(expectationSentence({ type: "turunkan_nilai", maxUnitPrice: 1700000 }, fmt), "Turunkan nilai: harga ≤ 1700000");
  assert.equal(expectationSentence({ type: "turunkan_nilai", maxUnitPrice: 10, maxTotal: 99 }, fmt), "Turunkan nilai: harga ≤ 10, total ≤ 99");
  assert.equal(expectationSentence({ type: "rinci_item" }, fmt), "Rinci item");
  assert.equal(expectationSentence({ type: "manual", instruction: "x" }, fmt), "Periksa manual");
});
