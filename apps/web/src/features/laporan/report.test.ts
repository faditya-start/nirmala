// @ts-nocheck node --test runs this file directly (type stripping); the ".ts" import suffix is not allowed by tsc.
import assert from "node:assert/strict";
import test from "node:test";
import { barPercent, dismissSubtitle, formatDays, formatRatio, validationNote } from "./report.ts";

test("barPercent: zero stays empty, positive stays visible, scaled to max", () => {
  assert.equal(barPercent(0, 8), 0);
  assert.equal(barPercent(8, 8), 100);
  assert.equal(barPercent(2, 8), 25);
  assert.equal(barPercent(1, 1000), 2);
  assert.equal(barPercent(3, 0), 0);
});

test("formatters keep a dash for missing values", () => {
  assert.equal(formatRatio(null), "—");
  assert.equal(formatRatio(0.7), "70%");
  assert.equal(formatDays(null), "—");
  assert.equal(formatDays(5), "5 hari");
});

test("dismissSubtitle uses id-ID grouping", () => {
  assert.equal(dismissSubtitle(22, 1080), "22 item di-dismiss dari 1.080 item kena aturan.");
});

test("validationNote joins the synthetic notice and the server note", () => {
  assert.equal(validationNote(false, null), null);
  assert.match(validationNote(true, "8 item belum tertangkap."), /sintetis demo\..*8 item belum tertangkap\.$/);
});
