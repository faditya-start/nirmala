/**
 * Kunci jawaban SINTETIS untuk "Validasi engine" (S11; docs/rule-catalog.md §5). Dibangun dari `fixtures/synthetic/manifest.json`
 * (`ruleCases`) dan snapshot Awal sintetis yang sudah diimpor. Idempoten. Kunci jawaban data asli TIDAK pernah dibuat di sini:
 * bangun lokal lewat `npm run import:answer-key -w @nirmala/api -- <berkas.json>` (lihat docs/deploy.md).
 *
 * - L1 (recall, Awal): kasus akun R02-R06 + 2 item filler yang sengaja tidak ditangkap aturan manapun (agar `missedCount` tampil).
 * - L2 (recall, Awal): kasus efisiensi R01 dan R07.
 * - L3 (precision@5, Revisi): item berblokir (kasus R08); baru dievaluasi setelah snapshot Revisi diimpor.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { asc, eq, inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import { answerKeyItems, answerKeySets, rkaDocuments, rkaItems, ruleHits, workUnits } from "./schema.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/synthetic");
interface RuleCase { rule: string; satker: string; description: string }

export const SYNTHETIC_ANSWER_KEY_SETS = [
  { code: "L1", title: "Catatan akun dan lainnya", description: "Item berlabel di snapshot Awal", metric: "recall", n: null, note: "Dua item kunci jawaban sintetis sengaja tidak tertangkap aturan manapun." },
  { code: "L2", title: "Catatan inefisiensi", description: "Item efisiensi berlabel di snapshot Awal", metric: "recall", n: null, note: null },
  { code: "L3", title: "Item berblokir", description: "Item berblokir di snapshot Revisi (label lemah)", metric: "precision_at_n", n: 5, note: null }
] as const;

export async function seedSyntheticAnswerKey({ db }: Database): Promise<{ sets: number; items: number }> {
  const manifest = JSON.parse(await readFile(join(fixtureDir, "manifest.json"), "utf8")) as { ruleCases: RuleCase[] };
  await db.insert(answerKeySets).values(SYNTHETIC_ANSWER_KEY_SETS.map((set) => ({ ...set, synthetic: true }))).onConflictDoNothing();

  const awal = await db.select({ id: rkaDocuments.id, organizationUnitId: rkaDocuments.organizationUnitId }).from(rkaDocuments).where(eq(rkaDocuments.label, "Awal"));
  if (awal.length === 0) return { sets: SYNTHETIC_ANSWER_KEY_SETS.length, items: 0 };
  const items = await db.select({ id: rkaItems.id, documentId: rkaItems.documentId, itemKey: rkaItems.itemKey, satker: workUnits.code, description: rkaItems.description })
    .from(rkaItems).innerJoin(workUnits, eq(workUnits.id, rkaItems.workUnitId)).where(inArray(rkaItems.documentId, awal.map((document) => document.id))).orderBy(asc(workUnits.code), asc(rkaItems.itemKey));
  const orgOf = new Map(awal.map((document) => [document.id, document.organizationUnitId]));

  const rows: (typeof answerKeyItems.$inferInsert)[] = [];
  const add = (setCode: string, item: (typeof items)[number], snapshotLabel: "Awal" | "Revisi") => rows.push({
    id: `ak_${setCode}_${item.satker}_${rows.length}`, setCode, rkaItemId: snapshotLabel === "Awal" ? item.id : null, itemKey: item.itemKey, organizationUnitId: orgOf.get(item.documentId)!, snapshotLabel
  });
  const caseItem = (ruleCase: RuleCase) => items.find((item) => item.satker === ruleCase.satker && item.description === ruleCase.description);
  for (const ruleCase of manifest.ruleCases) {
    const item = caseItem(ruleCase);
    if (!item) continue;
    if (["R02", "R03", "R04", "R05", "R06"].includes(ruleCase.rule)) add("L1", item, "Awal");
    else if (["R01", "R07"].includes(ruleCase.rule)) add("L2", item, "Awal");
    else if (ruleCase.rule === "R08") add("L3", item, "Revisi");
  }
  // Dua item filler tanpa hit aturan sebagai item kunci jawaban yang tidak tertangkap (deterministik: Satker, lalu kunci).
  const flagged = (await db.select({ id: ruleHits.rkaItemId }).from(ruleHits)).map((row) => row.id);
  const flaggedSet = new Set(flagged);
  for (const item of items.filter((entry) => !flaggedSet.has(entry.id)).slice(0, 2)) add("L1", item, "Awal");

  if (rows.length) await db.insert(answerKeyItems).values(rows).onConflictDoNothing();
  return { sets: SYNTHETIC_ANSWER_KEY_SETS.length, items: rows.length };
}
