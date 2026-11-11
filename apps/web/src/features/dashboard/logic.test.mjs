import assert from "node:assert/strict";
import test from "node:test";
import { actionBody, actionButtonLabel, actionCountText, daysValue, flaggedShareText, rowProgress } from "./logic.ts";

const date = () => "4 Nov 2026";
const org = (over) => ({ snapshot: { versionNo: 2, label: "Revisi" }, notesIssued: 3, notesClosed: 2, notesDraft: 0, chrStatus: "issued", ...over });

test("flaggedShareText", () => {
  assert.equal(flaggedShareText(108, 12702), "0,9% dari 12.702 item dianalisis");
  assert.equal(flaggedShareText(0, 0), null);
});

test("daysValue", () => {
  assert.equal(daysValue(3), "3 hari");
  assert.equal(daysValue(0), "Hari ini");
  assert.equal(daysValue(-2), "Lewat 2 hari");
  assert.equal(daysValue(null), "—");
});

test("rowProgress", () => {
  assert.deepEqual(rowProgress(org({})), { ratio: 2 / 3, text: "2 dari 3 catatan closed" });
  assert.equal(rowProgress(org({ snapshot: null })).text, "Belum ada snapshot");
  assert.equal(rowProgress(org({ notesIssued: 0, notesClosed: 0, notesDraft: 4, chrStatus: "draft" })).text, "CHR draf, belum terbit");
  assert.equal(rowProgress(org({ notesIssued: 0, notesClosed: 0, chrStatus: null })).text, "Belum ada catatan terbit");
});

test("action cards", () => {
  const verif = { kind: "perlu_verifikasi", count: 1, href: "/tracker", oldestNote: { title: "Outsourcing jasa kebersihan", workUnitName: "Satker Contoh 02", waitingDays: 5, latestCheckResult: "belum_terpenuhi" }, lastIssuedChr: null };
  assert.equal(actionBody(verif, date), "Outsourcing jasa kebersihan · Satker Contoh 02. Menunggu keputusan 5 hari. Hasil cek: belum terpenuhi.");
  assert.equal(actionCountText(verif), "1 catatan");
  const chr = { kind: "chr_draf", count: 0, href: "/chr", oldestNote: null, lastIssuedChr: { documentNumber: "014/CHR/2026", issuedAt: 1 } };
  assert.equal(actionBody(chr, date), "Tidak ada CHR draf. CHR 014/CHR/2026 sudah terbit pada 4 Nov 2026.");
  assert.equal(actionCountText(chr), "0 CHR");
  assert.equal(actionButtonLabel(chr), null);
  assert.equal(actionButtonLabel({ ...chr, count: 2 }), "Buka CHR");
});
