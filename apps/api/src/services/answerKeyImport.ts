/**
 * Impor kunci jawaban dari berkas JSON yang dibuat LOKAL oleh tim (kunci jawaban data asli tidak pernah ada di repo).
 * Dipakai `scripts/import-answer-key.ts`. Bentuk berkas:
 * {
 *   "synthetic": false,
 *   "sets": [{ "code": "L1", "title": "...", "description": "...", "metric": "recall", "n": null, "note": null }],
 *   "items": [
 *     { "set": "L1", "organizationCode": "14504", "snapshotLabel": "Awal", "itemKey": "<item_key>" },
 *     { "set": "L1", "organizationCode": "14504", "snapshotLabel": "Awal", "satkerCode": "123456", "description": "uraian item" }
 *   ]
 * }
 * Item boleh memakai `itemKey` langsung atau (`satkerCode` + `description`) yang dicari di snapshot berlabel itu pada siklus `cycleId`.
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { ANSWER_KEY_CODES } from "@nirmala/shared";
import type { Database } from "../db/client.js";
import { answerKeyItems, answerKeySets, organizationUnits, rkaDocuments, rkaItems, workUnits } from "../db/schema.js";
import { newId } from "../lib/security.js";

const labelSchema = z.enum(["Awal", "Revisi"]);
export const answerKeyFileSchema = z.object({
  synthetic: z.boolean().default(false),
  sets: z.array(z.object({
    code: z.enum(ANSWER_KEY_CODES), title: z.string().trim().min(1), description: z.string().trim().min(1),
    metric: z.enum(["recall", "precision_at_n"]), n: z.number().int().positive().nullable().optional(), note: z.string().trim().nullable().optional()
  })).min(1),
  items: z.array(z.object({
    set: z.enum(ANSWER_KEY_CODES), organizationCode: z.string().trim().min(1), snapshotLabel: labelSchema,
    itemKey: z.string().min(1).optional(), satkerCode: z.string().trim().min(1).optional(), description: z.string().trim().min(1).optional()
  }).refine((item) => item.itemKey || (item.satkerCode && item.description), "Isi itemKey, atau satkerCode dan description."))
});
export type AnswerKeyFile = z.infer<typeof answerKeyFileSchema>;

export interface AnswerKeyImportResult { sets: number; imported: number; unresolved: number }

/** Mengganti seluruh item set yang ada di berkas. `cycleId` dibutuhkan hanya untuk item bergaya (satkerCode, description). */
export async function importAnswerKey(database: Database, file: AnswerKeyFile, cycleId?: string): Promise<AnswerKeyImportResult> {
  const { db } = database;
  const orgs = await db.select({ id: organizationUnits.id, code: organizationUnits.code }).from(organizationUnits);
  const orgByCode = new Map(orgs.map((org) => [org.code, org.id]));
  const rows: (typeof answerKeyItems.$inferInsert)[] = [];
  let unresolved = 0;

  for (const item of file.items) {
    const organizationUnitId = orgByCode.get(item.organizationCode);
    if (!organizationUnitId) { unresolved += 1; continue; }
    let itemKey = item.itemKey ?? null;
    let rkaItemId: string | null = null;
    if (!itemKey) {
      if (!cycleId) throw new Error("Berkas memakai satkerCode + description; berikan --cycle <tahun>:<tahap>.");
      const [found] = await db.select({ id: rkaItems.id, itemKey: rkaItems.itemKey }).from(rkaItems)
        .innerJoin(rkaDocuments, eq(rkaDocuments.id, rkaItems.documentId)).innerJoin(workUnits, eq(workUnits.id, rkaItems.workUnitId))
        .where(and(eq(rkaDocuments.cycleId, cycleId), eq(rkaDocuments.organizationUnitId, organizationUnitId), eq(rkaDocuments.label, item.snapshotLabel), eq(workUnits.code, item.satkerCode!), eq(rkaItems.description, item.description!))).limit(1);
      if (!found) { unresolved += 1; continue; }
      itemKey = found.itemKey;
      rkaItemId = found.id;
    }
    rows.push({ id: newId("ak"), setCode: item.set, rkaItemId, itemKey, organizationUnitId, snapshotLabel: item.snapshotLabel });
  }

  await database.transaction(async () => {
    const codes = file.sets.map((set) => set.code);
    await db.delete(answerKeyItems).where(inArray(answerKeyItems.setCode, codes));
    for (const set of file.sets) {
      const values = { title: set.title, description: set.description, metric: set.metric, n: set.n ?? null, note: set.note ?? null, synthetic: file.synthetic };
      await db.insert(answerKeySets).values({ code: set.code, ...values }).onConflictDoUpdate({ target: answerKeySets.code, set: values });
    }
    for (let index = 0; index < rows.length; index += 200) await db.insert(answerKeyItems).values(rows.slice(index, index + 200)).onConflictDoNothing();
  });
  return { sets: file.sets.length, imported: rows.length, unresolved };
}
