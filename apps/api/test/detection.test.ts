import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { and, eq, inArray } from "drizzle-orm";
import { compileRule, compileRules, evaluateRules, renderReason, type EngineContext, type EngineItem, type EngineRule } from "../src/detection/rules.ts";
import { buildPeerGroups, comparePeer, median } from "../src/detection/peer.ts";
import { riskAssessments, rkaDocuments, rkaItems, ruleHits, rules } from "../src/db/schema.ts";
import { RULE_SEEDS } from "../src/db/seeds/rules.ts";
import { ingestSnapshot } from "../src/ingest/ingestService.ts";
import { createCycle } from "../src/repositories/cycles.ts";
import { detectionHooks } from "../src/services/detectionPipeline.ts";
import { fixturePath, setup } from "./helpers.ts";

const seedRule = (code: string): EngineRule => {
  const seed = RULE_SEEDS.find((rule) => rule.code === code)!;
  return { id: `rule_${code}`, code, kind: seed.kind, params: seed.params, reasonTemplate: seed.reasonTemplate };
};
const item = (overrides: Partial<EngineItem>): EngineItem => ({ description: "x", accountCode: "521211", quantity: 1, unitPrice: 1000, totalAmount: 1000, blokirCode: null, ...overrides });
const context = (overrides: Partial<EngineContext> = {}): EngineContext => ({ isRevision: false, previousBlokirCode: null, ...overrides });
const hit = (code: string, subject: EngineItem, ctx = context()) => compileRule(seedRule(code))!.test(subject, ctx);

test("keyword (R01): semua pola harus cocok dan kata yang cocok dilaporkan", () => {
  assert.deepEqual(hit("R01", item({ description: "Pengadaan kaos seragam peringatan HUT Kemerdekaan 17 Agustus" })), ["kaos", "hut"]);
  assert.deepEqual(hit("R01", item({ description: "Seragam batik hari bakti" })), ["seragam", "hari bakti"]);
  assert.equal(hit("R01", item({ description: "Seragam kantor harian" })), null);
  assert.equal(hit("R01", item({ description: "Hutan kota" })), null, "\\bhut\\b tidak cocok dengan 'hutan'");
});

test("keyword_wrong_account: akun salah, pengecualian akun, exclude, dan batas harga (R02, R03, R04, R06)", () => {
  assert.deepEqual(hit("R02", item({ description: "Honor satpam dan pengemudi kantor", accountCode: "521213" })), ["satpam"]);
  assert.equal(hit("R02", item({ description: "Honor satpam", accountCode: "521111" })), null, "akun benar tidak ditandai");
  assert.deepEqual(hit("R03", item({ description: "Langganan internet kantor", accountCode: "522191" })), ["internet"]);
  assert.equal(hit("R03", item({ description: "Langganan internet kantor", accountCode: "521111" })), null, "akunSalahKecuali");
  assert.equal(hit("R03", item({ description: "Langganan internet kantor", accountCode: "532111" })), null, "bukan akun 52");
  assert.deepEqual(hit("R04", item({ description: "Cetak kop surat dan amplop dinas", accountCode: "521111" })), ["kop surat"]);
  assert.equal(hit("R04", item({ description: "Cetak kop surat dan amplop dinas", accountCode: "521211" })), null);
  assert.deepEqual(hit("R05", item({ description: "Rehabilitasi masjid binaan desa", accountCode: "533111", unitPrice: 850_000_000 })), ["masjid"]);
  assert.deepEqual(hit("R06", item({ description: "Pengadaan laptop untuk staf", unitPrice: 15_000_000 })), ["laptop"]);
  assert.equal(hit("R06", item({ description: "Pemeliharaan laptop dan printer", unitPrice: 1_200_000 })), null, "exclude pemeliharaan");
  assert.equal(hit("R06", item({ description: "Pembelian laptop murah", unitPrice: 900_000 })), null, "di bawah minUnitPrice");
});

test("value_check (R07) dan blokir_history (R08, hanya revisi)", () => {
  assert.deepEqual(hit("R07", item({ quantity: 0, totalAmount: 25_000_000 })), []);
  assert.equal(hit("R07", item({ quantity: 0, totalAmount: 0 })), null);
  assert.equal(hit("R07", item({ quantity: 1, totalAmount: 25_000_000 })), null);
  assert.equal(hit("R08", item({ blokirCode: "A" }), context({ isRevision: false })), null, "R08 tidak berlaku di snapshot awal");
  assert.deepEqual(hit("R08", item({ blokirCode: "2" }), context({ isRevision: true })), []);
  assert.deepEqual(hit("R08", item({ blokirCode: null }), context({ isRevision: true, previousBlokirCode: "A" })), []);
  assert.equal(hit("R08", item({}), context({ isRevision: true })), null);
});

test("evaluateRules: hasil urut kode, alasan dirender dari template, parameter rusak dilewati", () => {
  const custom: EngineRule = { id: "x", code: "R99", kind: "keyword_wrong_account", params: { include: "laptop", akunSalah: ["52"], akunBenar: "532111" }, reasonTemplate: "Gunakan {akun_benar}, bukan {akun}. {tidakAda}" };
  const compiled = compileRules([custom, seedRule("R06"), { ...seedRule("R01"), params: { all: ["("] } }]);
  assert.equal(compiled.length, 2, "regex tidak valid dilewati");
  const matches = evaluateRules(compiled, item({ description: "Laptop kantor", unitPrice: 8_000_000 }), context());
  assert.deepEqual(matches.map((match) => match.code), ["R06", "R99"]);
  assert.equal(matches[1].reason, "Gunakan 532111, bukan 521211. {tidakAda}");
  assert.equal(renderReason("tanpa variabel", {}), "tanpa variabel");
});

test("peer: median per (uraian, satuan), minimal 5 Satker, harga 0 diabaikan", () => {
  assert.equal(median([1, 3, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 3);
  const rows = ["a", "b", "c", "d", "e"].map((workUnitId, index) => ({ description: "Honorarium  Narasumber", unit: "OJ", unitPrice: 1000 + index * 100, workUnitId }));
  const groups = buildPeerGroups([...rows, { description: "unik", unit: "OJ", unitPrice: 5, workUnitId: "a" }, { description: "honorarium narasumber", unit: "oj", unitPrice: 0, workUnitId: "z" }], 5);
  assert.equal(groups.size, 1);
  const comparison = comparePeer(groups, { description: "honorarium narasumber", unit: "OJ", unitPrice: 2000 })!;
  assert.equal(comparison.median, 1200);
  assert.equal(comparison.satkerCount, 5);
  assert.equal(comparison.ratio, 2000 / 1200);
  assert.equal(buildPeerGroups(rows.slice(0, 4), 5).size, 0, "4 Satker < ambang");
  assert.equal(comparePeer(groups, { description: "honorarium narasumber", unit: "paket", unitPrice: 2000 }), null, "satuan berbeda = kelompok berbeda");
});

// --------------------------------------------------------------------------- fixtures sintetis (docs/plan.md Fase 3 "Selesai bila")

interface Manifest { ruleCases: { rule: string; satker: string; description: string }[] }

async function importFixtures(withRevision: boolean) {
  const env = await setup();
  const cycleId = await createCycle(env.database.db, { fiscalYear: 2026, stage: "alokasi", name: "TA 2026 · Alokasi", adkDeadline: null, dipaIssuedAt: null, createdBy: null });
  const ids: Record<string, string> = {};
  for (const folder of withRevision ? ["awal", "revisi"] : ["awal"]) {
    for (const code of ["90001", "90002"]) {
      const name = `${folder}/es1_${code}_2026.csv`;
      const result = await ingestSnapshot(env.database, { cycleId, filePath: fixturePath(name), fileName: name, importedBy: "usr_admin", allowedOrganizationUnitIds: null }, detectionHooks());
      ids[`${folder}:${code}`] = result.snapshot.id;
    }
  }
  const manifest = JSON.parse(await readFile(fixturePath("manifest.json"), "utf8")) as Manifest;
  const hitsOf = async (documentId: string) => {
    const rows = await env.database.db.select({ description: rkaItems.description, satker: rkaItems.itemKey, code: rules.code }).from(ruleHits)
      .innerJoin(rkaItems, eq(rkaItems.id, ruleHits.rkaItemId)).innerJoin(rules, eq(rules.id, ruleHits.ruleId)).where(eq(rkaItems.documentId, documentId));
    return rows.map((row) => ({ description: row.description, satker: row.satker.split("|")[0], code: row.code }));
  };
  return { ...env, cycleId, ids, manifest, hitsOf };
}

test("setiap kasus R01-R07 di manifest ter-flag oleh aturan yang benar di snapshot awal (dan hanya itu)", async () => {
  const env = await importFixtures(false);
  const hits = [...await env.hitsOf(env.ids["awal:90001"]), ...await env.hitsOf(env.ids["awal:90002"])];
  const cases = env.manifest.ruleCases.filter((entry) => entry.rule !== "R08");
  assert.equal(cases.length, 13);
  for (const entry of cases) {
    const found = hits.filter((row) => row.satker === entry.satker && row.description === entry.description).map((row) => row.code);
    assert.deepEqual(found, [entry.rule], `${entry.description} (${entry.satker})`);
  }
  // Tidak ada hit lain di luar kasus skrip: decoy ("Pemeliharaan laptop dan printer", filler, dll.) tidak ter-flag.
  assert.equal(hits.length, cases.length, `hit tak terduga: ${JSON.stringify(hits.filter((row) => !cases.some((entry) => entry.satker === row.satker && entry.description === row.description)))}`);
  assert.ok(!hits.some((row) => row.description === "Pemeliharaan laptop dan printer"));
  assert.ok(!hits.some((row) => row.code === "R08"), "R08 tidak berlaku di snapshot awal");
  env.close();
});

test("R08 hanya di snapshot revisi: item berblokir sendiri atau padanannya berblokir", async () => {
  const env = await importFixtures(true);
  const hits = [...await env.hitsOf(env.ids["revisi:90001"]), ...await env.hitsOf(env.ids["revisi:90002"])];
  const r08 = env.manifest.ruleCases.filter((entry) => entry.rule === "R08");
  assert.equal(r08.length, 2);
  for (const entry of r08) assert.ok(hits.some((row) => row.code === "R08" && row.satker === entry.satker && row.description === entry.description), entry.description);
  assert.equal(hits.filter((row) => row.code === "R08").length, 2);
  // Kasus lain yang diperbaiki di revisi tidak lagi ter-flag (akun sudah benar), sedangkan yang belum diperbaiki tetap ter-flag.
  assert.ok(!hits.some((row) => row.description === "Honor satpam dan pengemudi kantor"));
  assert.ok(hits.some((row) => row.code === "R02" && row.description === "Jasa kebersihan kantor (cleaning service)"), "item tetap mewarisi hit padanannya");
  assert.ok(!hits.some((row) => row.code === "R01" && row.description.includes("kaos")), "item R01 dihapus di revisi");
  env.close();
});

test("rule_hits menyimpan alasan yang dirender dan matched_terms", async () => {
  const env = await importFixtures(false);
  const [row] = await env.database.db.select({ reason: ruleHits.reason, terms: ruleHits.matchedTerms }).from(ruleHits).innerJoin(rkaItems, eq(rkaItems.id, ruleHits.rkaItemId)).where(eq(rkaItems.description, "Pengadaan kaos seragam peringatan HUT Kemerdekaan 17 Agustus"));
  assert.deepEqual(row.terms, ["kaos", "hut"]);
  assert.match(row.reason, /Alokasi pakaian hari besar/);
  env.close();
});

test("skor: setiap item diskor sekali per konfigurasi, F1 menangkap pencilan harga, dan hasil reproducible", async () => {
  const env = await importFixtures(false);
  const { db } = env.database;
  const items = await db.select().from(rkaItems);
  const assessments = await db.select().from(riskAssessments);
  assert.equal(assessments.length, items.length);
  assert.equal(new Set(assessments.map((row) => `${row.rkaItemId}|${row.riskConfigId}`)).size, items.length);

  const byDescription = async (description: string, satkerPrefix: string) => {
    const [row] = (await db.select({ id: rkaItems.id, key: rkaItems.itemKey }).from(rkaItems).where(eq(rkaItems.description, description))).filter((entry) => entry.key.startsWith(`${satkerPrefix}|`));
    return (await db.select().from(riskAssessments).where(eq(riskAssessments.rkaItemId, row.id)))[0];
  };
  // Pembanding dihitung dari data yang ada saat sebuah snapshot diimpor; setelah semua eselon I masuk, hitung ulang menyamakan semuanya.
  const { runDetection } = await import("../src/services/detectionPipeline.ts");
  const recalculateAll = async () => { for (const id of Object.values(env.ids)) await env.database.transaction(() => runDetection(db, id, { mode: "recalculate" })); };
  await recalculateAll();
  const outlier = await byDescription("Honorarium narasumber", "900105");
  const typical = await byDescription("Honorarium narasumber", "900102");
  const f1 = (assessment: typeof outlier) => assessment.factors.find((entry) => entry.code === "price_vs_peer")!;
  assert.equal(f1(outlier).normalizedScore, 100, "4.000.000 vs median ~1,7 juta di 9 Satker");
  assert.ok(f1(typical).normalizedScore! < 15);
  assert.deepEqual([outlier.peerStats?.satkerCount, outlier.peerStats?.unit], [9, "OJ"]);
  assert.ok(outlier.score > typical.score);

  // Reproducible: menghitung ulang snapshot yang sama (config sama) menghasilkan skor, kategori, dan faktor yang identik.
  const before = new Map((await db.select().from(riskAssessments)).map((row) => [row.rkaItemId, [row.score, row.category, JSON.stringify(row.factors), JSON.stringify(row.peerStats)]]));
  await recalculateAll();
  const after = await db.select().from(riskAssessments);
  assert.equal(after.length, items.length, "tetap satu assessment per item x config");
  for (const row of after) assert.deepEqual([row.score, row.category, JSON.stringify(row.factors), JSON.stringify(row.peerStats)], before.get(row.rkaItemId));
  env.close();
});

test("revisi: F5 = 0 untuk item tetap, 60 untuk baru; item tetap mewarisi hit padanan", async () => {
  const env = await importFixtures(true);
  const { db } = env.database;
  const rows = await db.select({ change: rkaItems.changeType, factors: riskAssessments.factors, doc: rkaItems.documentId }).from(riskAssessments).innerJoin(rkaItems, eq(rkaItems.id, riskAssessments.rkaItemId))
    .where(inArray(rkaItems.documentId, [env.ids["revisi:90001"], env.ids["revisi:90002"]]));
  const f5 = (row: (typeof rows)[number]) => row.factors.find((entry) => entry.code === "change_from_previous")!;
  assert.ok(rows.filter((row) => row.change === "tetap").every((row) => f5(row).normalizedScore === 0 && f5(row).dataAvailable));
  assert.ok(rows.filter((row) => row.change === "baru").every((row) => f5(row).normalizedScore === 60));
  const awal = await db.select({ id: rkaDocuments.id }).from(rkaDocuments).where(and(eq(rkaDocuments.versionNo, 1)));
  const awalAssessments = await db.select({ factors: riskAssessments.factors }).from(riskAssessments).innerJoin(rkaItems, eq(rkaItems.id, riskAssessments.rkaItemId)).where(eq(rkaItems.documentId, awal[0].id));
  assert.ok(awalAssessments.every((row) => row.factors.find((entry) => entry.code === "change_from_previous")!.dataAvailable === false), "snapshot pertama: F5 tidak tersedia");
  env.close();
});
