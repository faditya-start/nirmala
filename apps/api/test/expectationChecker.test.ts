import test from "node:test";
import assert from "node:assert/strict";
import { NOTE_ACTIONS, NOTE_STATUSES, NOTE_TRANSITIONS, ROLES, canTransition } from "@nirmala/shared";
import { checkExpectation, type CheckableItem } from "../src/tracker/expectationChecker.ts";

const item = (overrides: Partial<CheckableItem> = {}): CheckableItem => ({
  accountCode: "521211", description: "Honor satpam", quantity: 12, unit: "bulan", unitPrice: 3_500_000, totalAmount: 42_000_000, blokirCode: null, volumeDetail: null, ...overrides
});
const fieldOf = (output: ReturnType<typeof checkExpectation>, name: string) => output.evidence.fields.find((entry) => entry.field === name);

test("ganti_akun: terpenuhi bila akun padanan = akun tujuan; bukti memuat akun, total, uraian dan expected", () => {
  const base = item({ accountCode: "521213" });
  const ok = checkExpectation({ expectation: { type: "ganti_akun", to: "521111" }, base, match: item({ accountCode: "521111" }) });
  assert.equal(ok.result, "terpenuhi");
  assert.deepEqual(ok.evidence.fields.map((entry) => entry.field), ["account_code", "total_amount", "description"]);
  assert.deepEqual(fieldOf(ok, "account_code"), { field: "account_code", before: "521213", after: "521111", expected: "521111" });

  const no = checkExpectation({ expectation: { type: "ganti_akun", to: "521111" }, base, match: item({ accountCode: "521213" }) });
  assert.equal(no.result, "belum_terpenuhi");
  assert.equal(fieldOf(no, "account_code")?.after, "521213");
});

test("ganti_akun: padanan tidak ada -> item_tidak_ditemukan dengan semua after = null; akun kosong -> data_tidak_cukup", () => {
  const missing = checkExpectation({ expectation: { type: "ganti_akun", to: "521111" }, base: item(), match: null });
  assert.equal(missing.result, "item_tidak_ditemukan");
  assert.ok(missing.evidence.fields.every((entry) => entry.after === null));
  assert.ok(missing.evidence.fields.every((entry) => entry.before !== null));
  const empty = checkExpectation({ expectation: { type: "ganti_akun", to: "521111" }, base: item(), match: item({ accountCode: "" }) });
  assert.equal(empty.result, "data_tidak_cukup");
});

test("hapus_item: terpenuhi bila padanan tidak ada atau total = 0; belum bila masih ada", () => {
  const gone = checkExpectation({ expectation: { type: "hapus_item" }, base: item(), match: null });
  assert.equal(gone.result, "terpenuhi");
  assert.deepEqual(fieldOf(gone, "total_amount"), { field: "total_amount", before: 42_000_000, after: null });
  assert.match(gone.evidence.note ?? "", /tidak ada/);
  assert.equal(checkExpectation({ expectation: { type: "hapus_item" }, base: item(), match: item({ totalAmount: 0, unitPrice: 0 }) }).result, "terpenuhi");
  assert.equal(checkExpectation({ expectation: { type: "hapus_item" }, base: item(), match: item() }).result, "belum_terpenuhi");
});

test("turunkan_nilai: hanya field yang punya batas ikut dinilai dan tampil; dua batas keduanya harus dipenuhi", () => {
  const base = item({ unitPrice: 900_000, totalAmount: 108_000_000, quantity: 120 });
  const priceOnly = checkExpectation({ expectation: { type: "turunkan_nilai", maxUnitPrice: 500_000 }, base, match: item({ unitPrice: 450_000, totalAmount: 90_000_000, quantity: 120 }) });
  assert.equal(priceOnly.result, "terpenuhi");
  assert.deepEqual(priceOnly.evidence.fields.map((entry) => entry.field), ["unit_price", "quantity"]);
  assert.equal(fieldOf(priceOnly, "unit_price")?.expected, 500_000);
  assert.equal(fieldOf(priceOnly, "quantity")?.expected, undefined);

  const totalOnly = checkExpectation({ expectation: { type: "turunkan_nilai", maxTotal: 100_000_000 }, base, match: item({ unitPrice: 900_000, totalAmount: 108_000_000, quantity: 120 }) });
  assert.equal(totalOnly.result, "belum_terpenuhi");
  assert.deepEqual(totalOnly.evidence.fields.map((entry) => entry.field), ["total_amount", "quantity"]);

  const both = checkExpectation({ expectation: { type: "turunkan_nilai", maxUnitPrice: 500_000, maxTotal: 40_000_000 }, base, match: item({ unitPrice: 450_000, totalAmount: 54_000_000, quantity: 120 }) });
  assert.equal(both.result, "belum_terpenuhi", "harga memenuhi tetapi total melebihi batas");
  assert.equal(checkExpectation({ expectation: { type: "turunkan_nilai", maxUnitPrice: 500_000 }, base, match: null }).result, "item_tidak_ditemukan");
});

test("rinci_item: volume > 1 dengan satuan bukan paket/LS, atau uraian berubah dengan VOL_KEG terisi", () => {
  const base = item({ quantity: 0, unit: "paket", description: "Biaya koordinasi lain-lain", totalAmount: 25_000_000 });
  const expectation = { type: "rinci_item" } as const;
  const volume = checkExpectation({ expectation, base, match: item({ quantity: 5, unit: "orang", description: base.description }) });
  assert.equal(volume.result, "terpenuhi");
  assert.deepEqual(volume.evidence.fields.map((entry) => entry.field), ["quantity", "unit", "description"]);
  assert.equal(checkExpectation({ expectation, base, match: item({ quantity: 1, unit: "paket", description: base.description }) }).result, "belum_terpenuhi");
  assert.equal(checkExpectation({ expectation, base, match: item({ quantity: 12, unit: "LS", description: base.description }) }).result, "belum_terpenuhi");
  assert.equal(checkExpectation({ expectation, base, match: item({ quantity: 3, unit: "Paket", description: base.description }) }).result, "belum_terpenuhi");

  const described = checkExpectation({ expectation, base, match: item({ quantity: 1, unit: "paket", description: "Rapat koordinasi 3 kali", volumeDetail: { vol1: 3, sat1: "kali" } }) });
  assert.equal(described.result, "terpenuhi");
  const noBreakdown = checkExpectation({ expectation, base, match: item({ quantity: 1, unit: "paket", description: "Rapat koordinasi 3 kali", volumeDetail: { vol1: 0 } }) });
  assert.equal(noBreakdown.result, "belum_terpenuhi", "uraian berubah tetapi rincian VOL_KEG kosong");
  assert.equal(checkExpectation({ expectation, base, match: item({ quantity: 4, unit: null, description: base.description }) }).result, "data_tidak_cukup");
  assert.equal(checkExpectation({ expectation, base, match: null }).result, "item_tidak_ditemukan");
});

test("manual: selalu data_tidak_cukup; blokir_code hanya untuk aturan R08; catatan menjelaskan", () => {
  const expectation = { type: "manual", instruction: "Periksa kesesuaian dengan standar biaya." } as const;
  const base = item({ blokirCode: "A" });
  const r08 = checkExpectation({ expectation, base, match: item({ blokirCode: "2" }), ruleCode: "R08" });
  assert.equal(r08.result, "data_tidak_cukup");
  assert.deepEqual(r08.evidence.fields, [{ field: "blokir_code", before: "A", after: "2" }]);
  assert.match(r08.evidence.note ?? "", /tidak dapat dicek otomatis/);
  assert.match(r08.evidence.note ?? "", /standar biaya/);

  const other = checkExpectation({ expectation, base, match: item({ blokirCode: null }), ruleCode: "R02" });
  assert.equal(other.result, "data_tidak_cukup");
  assert.deepEqual(other.evidence.fields, []);
  // Catatan manual tanpa item sama sekali.
  assert.equal(checkExpectation({ expectation, base: null, match: null }).result, "data_tidak_cukup");
  // Padanan hilang: dilaporkan item_tidak_ditemukan (A46).
  assert.equal(checkExpectation({ expectation, base, match: null, ruleCode: "R08" }).result, "item_tidak_ditemukan");
});

test("catatan tanpa item (bukan manual) -> data_tidak_cukup", () => {
  for (const expectation of [{ type: "ganti_akun", to: "521111" }, { type: "hapus_item" }, { type: "turunkan_nilai", maxTotal: 1 }, { type: "rinci_item" }] as const) {
    assert.equal(checkExpectation({ expectation, base: null, match: null }).result, "data_tidak_cukup", expectation.type);
  }
});

test("checker murni: tidak mengubah masukan dan menghasilkan hasil yang sama untuk masukan yang sama", () => {
  const base = item({ accountCode: "521213" });
  const match = item({ accountCode: "521111" });
  const snapshot = JSON.stringify({ base, match });
  const input = { expectation: { type: "ganti_akun", to: "521111" } as const, base, match };
  assert.deepEqual(checkExpectation(input), checkExpectation(input));
  assert.equal(JSON.stringify({ base, match }), snapshot);
});

test("mesin status: sistem tidak pernah mencapai closed; hanya reviewer/admin lewat setujui dan terima_justifikasi", () => {
  for (const action of NOTE_ACTIONS) for (const from of [null, ...NOTE_STATUSES]) {
    assert.notEqual(canTransition(action, from, "sistem"), "closed", `${action} dari ${from} oleh sistem`);
  }
  const closing = NOTE_TRANSITIONS.filter((transition) => transition.to === "closed");
  assert.deepEqual(closing.map((transition) => transition.action).sort(), ["setujui", "terima_justifikasi"]);
  for (const transition of closing) {
    assert.ok(!transition.actors.includes("sistem"));
    assert.deepEqual([...transition.actors].sort(), ["admin", "reviewer"]);
  }
  const systemActions = NOTE_TRANSITIONS.filter((transition) => (transition.actors as readonly string[]).includes("sistem"));
  assert.deepEqual(systemActions.map((transition) => `${transition.action}:${transition.to}`), ["cek_otomatis:perlu_verifikasi"]);
  // Pimpinan tidak punya aksi apa pun; UKI hanya justifikasi.
  for (const action of NOTE_ACTIONS) for (const from of [null, ...NOTE_STATUSES]) assert.equal(canTransition(action, from, "leader"), null);
  const ukiActions = NOTE_ACTIONS.filter((action) => NOTE_STATUSES.some((from) => canTransition(action, from, "uki") !== null));
  assert.deepEqual(ukiActions, ["justifikasi"]);
  assert.ok(ROLES.includes("uki"));
});

test("tidak ada kode di luar trackerService yang menetapkan status closed", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "../src");
  const files: string[] = [];
  const walk = (dir: string) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else if (path.endsWith(".ts")) files.push(path); } };
  walk(root);
  const writers = files.filter((file) => /status:\s*"closed"/.test(readFileSync(file, "utf8")) && !file.endsWith("schema.ts"));
  assert.deepEqual(writers.map((file) => file.slice(root.length + 1)), ["services/trackerService.ts"]);
  // Hook impor dan pengecek ekspektasi tidak boleh memuat jalur penutupan sama sekali.
  for (const name of ["tracker/followUp.ts", "tracker/expectationChecker.ts", "services/importHooks.ts"]) {
    assert.ok(!/closeNote|"closed"|closedAt|closedBy/.test(readFileSync(join(root, name), "utf8")), name);
  }
});
