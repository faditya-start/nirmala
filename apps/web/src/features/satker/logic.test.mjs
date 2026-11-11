import assert from "node:assert/strict";
import test from "node:test";
import { deadlineText, openNotesHint, relativeDays } from "./logic.ts";

test("relativeDays counts calendar days", () => {
  const now = new Date(2026, 10, 10, 9, 0).getTime();
  assert.equal(relativeDays(new Date(2026, 10, 10, 0, 5).getTime(), now), "hari ini");
  assert.equal(relativeDays(new Date(2026, 10, 9, 23, 0).getTime(), now), "1 hari lalu");
  assert.equal(relativeDays(new Date(2026, 9, 1, 12, 0).getTime(), now), "40 hari lalu");
});

test("deadlineText covers future, today, past and missing", () => {
  assert.deepEqual(deadlineText(3), { label: "Sisa hari ke tenggat ADK", value: "3 hari" });
  assert.equal(deadlineText(0).value, "Hari ini");
  assert.deepEqual(deadlineText(-2), { label: "Lewat tenggat ADK", value: "2 hari" });
  assert.equal(deadlineText(null).value, "-");
});

test("openNotesHint names the first open note and counts the rest", () => {
  const one = [{ noteId: "n", workUnitName: "Satker Contoh 02", title: "t", status: "perlu_verifikasi", latestCheckResult: "belum_terpenuhi" }];
  assert.equal(openNotesHint(one, 1), "Satker Contoh 02 · belum terpenuhi");
  assert.equal(openNotesHint(one, 4), "Satker Contoh 02 · belum terpenuhi dan 3 lainnya");
  assert.equal(openNotesHint([], 0), "Semua catatan terbit sudah Closed");
});
