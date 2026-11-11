import assert from "node:assert/strict";
import { test } from "node:test";
import { daysUntil, formatCountdown, formatDate, formatDateLong, formatDateTime, formatDecimal, formatNumber, formatPercent, formatRupiah, formatTime, toDateInput } from "./format";

test("numbers use id-ID grouping and decimal comma", () => {
  assert.equal(formatNumber(1250000000), "1.250.000.000");
  assert.equal(formatNumber(0), "0");
  assert.equal(formatDecimal(30, 1), "30,0");
  assert.equal(formatDecimal(12.345, 2), "12,35");
  assert.equal(formatRupiah(48600000), "Rp 48.600.000");
  assert.equal(formatPercent(0.275, 1), "27,5%");
});

test("missing or invalid numbers render a dash, never NaN", () => {
  for (const fn of [formatNumber, formatRupiah, formatPercent, (v: number | null | undefined) => formatDecimal(v)]) {
    assert.equal(fn(null), "–");
    assert.equal(fn(undefined), "–");
    assert.equal(fn(Number.NaN), "–");
  }
});

test("dates are Indonesian and tolerate bad input", () => {
  const d = new Date(2026, 10, 3, 14, 20);
  assert.equal(formatDate(d), "3 Nov 2026");
  assert.equal(formatDateLong(d), "3 November 2026");
  assert.equal(formatTime(d), "14.20");
  assert.equal(formatDateTime(d), "3 Nov 2026 · 14.20");
  assert.equal(toDateInput(d), "2026-11-03");
  assert.equal(formatDate("not a date"), "-");
  assert.equal(formatDate(null), "-");
  assert.equal(toDateInput(undefined), "");
});

test("countdown counts calendar days", () => {
  const from = new Date(2026, 10, 9, 23, 30);
  assert.equal(daysUntil(new Date(2026, 10, 12, 1, 0), from), 3);
  assert.equal(formatCountdown(3), "sisa 3 hari");
  assert.equal(formatCountdown(0), "hari ini");
  assert.equal(formatCountdown(-2), "lewat 2 hari");
});
