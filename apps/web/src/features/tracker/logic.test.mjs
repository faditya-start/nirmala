import assert from "node:assert/strict";
import test from "node:test";
import {
  bulkResultMessage, checkSummary, evidenceRowViews, pickDefaultStatus, rowAccountLine, rowCheckLine,
  summarizeSelection, timelineViews, validateJustification, validateReturnReason
} from "./logic.ts";

const counts = (a, b, c, d) => ({ menunggu_revisi: a, perlu_verifikasi: b, dijustifikasi: c, closed: d });

test("checkSummary describes the proposal, never claims closure", () => {
  const ev = { fields: [{ field: "account_code", before: "522191", after: "522191" }] };
  assert.equal(checkSummary({ type: "ganti_akun", to: "521111" }, "belum_terpenuhi", { evidence: ev }), "Akun masih 522191");
  assert.equal(checkSummary({ type: "ganti_akun", to: "521111" }, "terpenuhi", { evidence: { fields: [{ field: "account_code", before: "1", after: "526113" }] } }), "Akun sudah 526113");
  assert.equal(checkSummary({ type: "hapus_item" }, "terpenuhi", null), "Item tidak ada di revisi");
  assert.equal(checkSummary({ type: "manual", instruction: "x" }, "data_tidak_cukup", null), "Ekspektasi manual tidak bisa dicek otomatis");
});

test("rowCheckLine handles notes that were never checked", () => {
  assert.equal(rowCheckLine({ expectation: { type: "hapus_item" }, latestCheck: null }), "Belum ada cek otomatis");
});

test("rowAccountLine shows base to checked account when it changed", () => {
  const latestCheck = { result: "terpenuhi", checkedAt: 0, snapshotVersionNo: 2, evidence: { fields: [{ field: "account_code", before: "532111", after: "526113" }] } };
  assert.deepEqual(rowAccountLine({ accountCode: "526113", ruleCode: "R05", latestCheck }), ["532111 → 526113", "R05"]);
  assert.deepEqual(rowAccountLine({ accountCode: "521211", ruleCode: "R01", latestCheck: null }), ["521211", "R01"]);
});

test("summarizeSelection separates notes that bulk approve will skip", () => {
  const s = summarizeSelection([{ id: "a", title: "A", bulkApprovable: true }, { id: "b", title: "B", bulkApprovable: false }]);
  assert.equal(s.total, 2);
  assert.deepEqual(s.approvable.map((r) => r.id), ["a"]);
  assert.deepEqual(s.skipped.map((r) => r.id), ["b"]);
});

test("bulkResultMessage reports approved, skipped and completed CHR", () => {
  assert.equal(bulkResultMessage(2, [], 0, "Reviewer 01"), "2 catatan ditutup atas nama Reviewer 01.");
  assert.match(bulkResultMessage(1, [{ reason: "belum_terpenuhi" }], 1), /1 dilewati \(hasil cek belum terpenuhi\)\. CHR menjadi Selesai/);
  assert.match(bulkResultMessage(0, [{ reason: "bukan_perlu_verifikasi" }], 0), /^Tidak ada catatan yang ditutup/);
});

test("pickDefaultStatus prefers Perlu Verifikasi, then the first non-empty tab", () => {
  assert.equal(pickDefaultStatus(counts(5, 2, 0, 0)), "perlu_verifikasi");
  assert.equal(pickDefaultStatus(counts(0, 0, 3, 1)), "dijustifikasi");
  assert.equal(pickDefaultStatus(counts(0, 0, 0, 0)), "menunggu_revisi");
});

test("evidenceRowViews marks unchanged expected field, changed field and manual expectation", () => {
  const ev = { checkId: "c", result: "belum_terpenuhi", checkedAt: 0, snapshotVersionNo: 2, snapshotLabel: "Revisi", note: null, rows: [
    { field: "account_code", before: "522191", after: "522191", changed: false, expected: "521111" },
    { field: "total_amount", before: 126000000, after: 126000000, changed: false, expected: null }
  ] };
  const rows = evidenceRowViews(ev, { type: "ganti_akun", to: "521111" });
  assert.equal(rows[0].state, "tidak_berubah");
  assert.equal(rows[0].value, "522191 · seharusnya 521111");
  assert.equal(rows[1].value, "126.000.000");
  const changed = evidenceRowViews({ ...ev, result: "terpenuhi", rows: [{ field: "account_code", before: "532111", after: "526113", changed: true, expected: "526113" }] }, { type: "ganti_akun", to: "526113" });
  assert.deepEqual([changed[0].state, changed[0].before, changed[0].after], ["berubah", "532111", "526113"]);
  const manual = evidenceRowViews({ ...ev, result: "data_tidak_cukup", rows: [{ field: "blokir_code", before: "B1", after: "B1", changed: false, expected: null }] }, { type: "manual", instruction: "x" });
  assert.equal(manual[0].badge, "data_tidak_cukup");
  assert.equal(manual[1].field, "Kode blokir v1");
  assert.equal(manual[2].field, "Kode blokir v2");
});

test("timelineViews adds the pending next step and maps the check tone", () => {
  const events = [{ type: "cek", at: 1, actorName: null, snapshotVersionNo: 2, checkResult: "belum_terpenuhi", statusAfter: "perlu_verifikasi" }];
  const ev = { checkId: "c", result: "belum_terpenuhi", checkedAt: 1, snapshotVersionNo: 2, snapshotLabel: "Revisi", note: null, rows: [{ field: "account_code", before: "522191", after: "522191", changed: false, expected: "521111" }] };
  const views = timelineViews(events, { kind: "keputusan_reviewer" }, [ev], { type: "ganti_akun", to: "521111" });
  assert.equal(views[0].tone, "flag");
  assert.equal(views[0].description, "Belum terpenuhi: akun masih 522191");
  assert.equal(views[1].pending, true);
  assert.equal(timelineViews([], null, [], { type: "hapus_item" }).length, 0);
});

test("form validation mirrors the contract limits", () => {
  assert.match(validateReturnReason("abc"), /minimal 5/);
  assert.equal(validateReturnReason("alasan cukup"), null);
  assert.match(validateJustification("pendek"), /minimal 10/);
  assert.equal(validateJustification("alasan yang cukup panjang"), null);
});
