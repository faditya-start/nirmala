/**
 * Validasi engine terhadap kunci jawaban (S11, docs/rule-catalog.md §5, docs/api-contract.md §6.2).
 * - `recall`: item kunci jawaban yang kena >= 1 aturan (`rule_hits`) pada snapshot berlabel yang sama di siklus.
 * - `precision_at_n`: dari N item berskor tertinggi pada snapshot-snapshot kunci jawaban, berapa yang ada di kunci jawaban.
 * Hanya item kunci jawaban pada (eselon I, label) yang punya snapshot di siklus itu yang dievaluasi.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ANSWER_KEY_CODES, type EngineValidationResponse, type EngineValidationSet } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { answerKeyItems, answerKeySets, riskAssessments, rkaDocuments, rkaItems, ruleHits, rules } from "../db/schema.js";
import { resolveScoreConfigId } from "../repositories/triage.js";

const CHUNK = 400;
const DEFAULT_N = 10;

async function chunked<T, R>(values: T[], fn: (part: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let index = 0; index < values.length; index += CHUNK) out.push(...await fn(values.slice(index, index + CHUNK)));
  return out;
}

export async function buildEngineValidation(db: Db, cycleId: string, orgIds: string[] | null): Promise<EngineValidationResponse> {
  const sets = await db.select().from(answerKeySets);
  if (sets.length === 0 || (orgIds && orgIds.length === 0)) return { synthetic: false, sets: [], note: null };

  const documents = await db.select({ id: rkaDocuments.id, organizationUnitId: rkaDocuments.organizationUnitId, label: rkaDocuments.label }).from(rkaDocuments)
    .where(and(eq(rkaDocuments.cycleId, cycleId), orgIds ? inArray(rkaDocuments.organizationUnitId, orgIds) : undefined));
  const documentFor = new Map(documents.map((document) => [`${document.organizationUnitId}|${document.label}`, document.id]));
  const keyItems = await db.select().from(answerKeyItems);

  const results: EngineValidationSet[] = [];
  const notes: string[] = [];
  for (const code of ANSWER_KEY_CODES) {
    const set = sets.find((entry) => entry.code === code);
    if (!set) continue;
    const own = keyItems.filter((item) => item.setCode === code);
    if (own.length === 0) continue;
    // Item evaluabel: (eselon I, label) punya snapshot di siklus ini.
    const evaluable = own.flatMap((item) => {
      const documentId = documentFor.get(`${item.organizationUnitId}|${item.snapshotLabel}`);
      return documentId ? [{ documentId, itemKey: item.itemKey }] : [];
    });
    if (set.metric === "precision_at_n" && evaluable.length === 0) continue; // L3 tampil bila ada datanya
    if (set.note) notes.push(set.note);

    const keyByDocument = new Map<string, Set<string>>();
    for (const item of evaluable) keyByDocument.set(item.documentId, (keyByDocument.get(item.documentId) ?? new Set()).add(item.itemKey));
    const documentIds = [...keyByDocument.keys()];
    const matched = documentIds.length
      ? (await chunked(documentIds, (part) => db.select({ id: rkaItems.id, documentId: rkaItems.documentId, itemKey: rkaItems.itemKey }).from(rkaItems).where(inArray(rkaItems.documentId, part))))
        .filter((item) => keyByDocument.get(item.documentId)?.has(item.itemKey))
      : [];

    let caughtIds: string[];
    let n: number | null = null;
    if (set.metric === "precision_at_n") {
      n = set.n ?? DEFAULT_N;
      const configId = await resolveScoreConfigId(db, documentIds);
      const top = configId
        ? await db.select({ id: rkaItems.id, documentId: rkaItems.documentId, itemKey: rkaItems.itemKey }).from(rkaItems)
          .innerJoin(riskAssessments, and(eq(riskAssessments.rkaItemId, rkaItems.id), eq(riskAssessments.riskConfigId, configId)))
          .where(inArray(rkaItems.documentId, documentIds)).orderBy(desc(riskAssessments.score), desc(rkaItems.totalAmount), asc(rkaItems.id)).limit(n)
        : [];
      const matchedIds = new Set(matched.map((item) => item.id));
      caughtIds = top.filter((item) => matchedIds.has(item.id)).map((item) => item.id);
    } else {
      const hit = new Set((await chunked(matched.map((item) => item.id), (part) => db.select({ id: ruleHits.rkaItemId }).from(ruleHits).where(inArray(ruleHits.rkaItemId, part)))).map((row) => row.id));
      caughtIds = matched.filter((item) => hit.has(item.id)).map((item) => item.id);
    }

    const codes = caughtIds.length
      ? (await chunked(caughtIds, (part) => db.select({ code: rules.code }).from(ruleHits).innerJoin(rules, eq(rules.id, ruleHits.ruleId)).where(inArray(ruleHits.rkaItemId, part)))).map((row) => row.code)
      : [];
    const totalItems = evaluable.length;
    const caught = caughtIds.length;
    results.push({
      code, title: set.title, description: set.description, metric: set.metric, totalItems, caught,
      value: set.metric === "precision_at_n" ? (n ? caught / n : null) : (totalItems === 0 ? null : caught / totalItems),
      n, ruleCodes: [...new Set(codes)].sort(), missedCount: totalItems - caught
    });
  }
  return { synthetic: results.length > 0 && results.every((result) => sets.find((set) => set.code === result.code)?.synthetic), sets: results, note: notes.length ? notes.join(" ") : null };
}
