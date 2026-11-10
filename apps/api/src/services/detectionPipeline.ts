/**
 * Pipeline deteksi: aturan aktif -> `rule_hits`, lalu skor 5 faktor dengan konfigurasi aktif -> `risk_assessments`.
 * Dijalankan di dalam transaksi pemanggil (impor atau hitung ulang). docs/api-contract.md §2.5 langkah 2.
 *
 * - mode `import`: item `baru` / `berubah` dievaluasi penuh; item `tetap` mewarisi `rule_hits` padanannya
 *   (kecuali aturan `blokir_history`, yang bergantung pada jenis snapshot dan selalu dievaluasi ulang).
 *   Semua item mendapat `risk_assessments` (F5 = 0 untuk `tetap`).
 * - mode `recalculate`: semua item dievaluasi penuh dengan aturan aktif; `rule_hits` lama di snapshot itu diganti,
 *   `risk_assessments` (item x konfigurasi aktif) ditimpa.
 */
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { riskAssessments, rkaDocuments, rkaItems, ruleHits, rules, workUnits } from "../db/schema.js";
import { comparePeer, loadPeerGroups } from "../detection/peer.js";
import { compileRules, evaluateRules, type RuleMatch } from "../detection/rules.js";
import { newId } from "../lib/security.js";
import { loadFindingProfiles, NO_PROFILE } from "../repositories/findings.js";
import { activeRiskConfig } from "../repositories/riskConfig.js";
import { listActiveEngineRules } from "../repositories/rules.js";
import type { IngestHooks } from "../ingest/ingestService.js";
import { scoreItem, type ScoreConfig } from "./riskScoring.js";

const PAGE = 500;

export interface PipelineResult {
  itemsAssessed: number;
  ruleHits: number;
  riskConfigId: string;
  riskConfigVersion: string;
}

export interface PipelineOptions {
  mode: "import" | "recalculate";
  onProgress?: (done: number, total: number) => void;
}

export async function runDetection(db: Db, documentId: string, options: PipelineOptions): Promise<PipelineResult> {
  const [document] = await db.select().from(rkaDocuments).where(eq(rkaDocuments.id, documentId)).limit(1);
  if (!document) throw new Error(`Snapshot ${documentId} tidak ditemukan.`);
  const config = await activeRiskConfig(db);
  const scoreConfig: ScoreConfig = { weights: config.weights, thresholds: config.thresholds, params: config.params };
  const allRules = await db.select({ id: rules.id, kind: rules.kind }).from(rules);
  const kindOf = new Map(allRules.map((rule) => [rule.id, rule.kind]));
  const compiled = compileRules(await listActiveEngineRules(db));
  const blokirRules = compiled.filter((entry) => entry.rule.kind === "blokir_history");
  const peerGroups = await loadPeerGroups(db, document.cycleId, config.params.peerMinSatker);
  const findings = await loadFindingProfiles(db);
  const satkerCodes = new Map((await db.select({ id: workUnits.id, code: workUnits.code }).from(workUnits).where(eq(workUnits.organizationUnitId, document.organizationUnitId))).map((row) => [row.id, row.code]));
  const isRevision = document.versionNo >= 2;
  const now = Date.now();

  let after = "";
  let itemsAssessed = 0;
  let hitsWritten = 0;
  for (;;) {
    const page = await db.select().from(rkaItems).where(and(eq(rkaItems.documentId, documentId), gt(rkaItems.id, after))).orderBy(asc(rkaItems.id)).limit(PAGE);
    if (page.length === 0) break;
    after = page[page.length - 1].id;

    const previousIds = page.flatMap((item) => (item.previousItemId ? [item.previousItemId] : []));
    const previous = new Map((previousIds.length
      ? await db.select({ id: rkaItems.id, totalAmount: rkaItems.totalAmount, blokirCode: rkaItems.blokirCode }).from(rkaItems).where(inArray(rkaItems.id, previousIds))
      : []).map((row) => [row.id, row]));
    const inheritedIds = options.mode === "import" ? page.filter((item) => item.changeType === "tetap" && item.previousItemId).map((item) => item.previousItemId!) : [];
    const inherited = new Map<string, (typeof ruleHits.$inferSelect)[]>();
    if (inheritedIds.length) {
      for (const hit of await db.select().from(ruleHits).where(inArray(ruleHits.rkaItemId, inheritedIds))) {
        if (kindOf.get(hit.ruleId) === "blokir_history") continue;
        inherited.set(hit.rkaItemId, [...(inherited.get(hit.rkaItemId) ?? []), hit]);
      }
    }

    const hitRows: (typeof ruleHits.$inferInsert)[] = [];
    const assessmentRows: (typeof riskAssessments.$inferInsert)[] = [];
    for (const item of page) {
      const prior = item.previousItemId ? previous.get(item.previousItemId) : undefined;
      const context = { isRevision, previousBlokirCode: prior?.blokirCode ?? null };
      let matches: RuleMatch[];
      if (options.mode === "import" && item.changeType === "tetap" && item.previousItemId) {
        const copied: RuleMatch[] = (inherited.get(item.previousItemId) ?? []).map((hit) => ({ ruleId: hit.ruleId, code: "", reason: hit.reason, matchedTerms: hit.matchedTerms ?? [] }));
        matches = [...copied, ...evaluateRules(blokirRules, item, context)];
      } else matches = evaluateRules(compiled, item, context);
      for (const match of matches) hitRows.push({ id: newId("hit"), rkaItemId: item.id, ruleId: match.ruleId, reason: match.reason, matchedTerms: match.matchedTerms, createdAt: now });

      const peer = comparePeer(peerGroups, item);
      const result = scoreItem({
        item: { description: item.description, accountCode: item.accountCode, unit: item.unit, quantity: item.quantity, unitPrice: item.unitPrice, totalAmount: item.totalAmount, hasVolumeDetail: Number(item.volumeDetail?.vol1 ?? 0) > 0 },
        peer,
        finding: findings.get(satkerCodes.get(item.workUnitId) ?? "") ?? NO_PROFILE,
        change: { firstSnapshot: document.versionNo === 1, changeType: item.changeType, previousTotal: prior?.totalAmount ?? null }
      }, scoreConfig);
      assessmentRows.push({
        id: newId("assess"), rkaItemId: item.id, riskConfigId: config.id, score: result.score, category: result.category, factors: result.factors,
        peerStats: peer ? { median: peer.median, satkerCount: peer.satkerCount, ratio: Math.round(peer.ratio * 1000) / 1000, min: peer.min, max: peer.max, unit: peer.unit } : null,
        dataCompleteness: result.dataCompleteness, assessedAt: now
      });
    }

    const ids = page.map((item) => item.id);
    if (options.mode === "recalculate") {
      await db.delete(ruleHits).where(inArray(ruleHits.rkaItemId, ids));
      await db.delete(riskAssessments).where(and(inArray(riskAssessments.rkaItemId, ids), eq(riskAssessments.riskConfigId, config.id)));
    }
    if (hitRows.length) await db.insert(ruleHits).values(hitRows);
    await db.insert(riskAssessments).values(assessmentRows);
    itemsAssessed += page.length;
    hitsWritten += hitRows.length;
    options.onProgress?.(itemsAssessed, document.rowCount);
  }
  return { itemsAssessed, ruleHits: hitsWritten, riskConfigId: config.id, riskConfigVersion: config.version };
}

/** Hook impor: deteksi dan skor berjalan dalam transaksi impor yang sama (§2.5 langkah 2). */
export function detectionHooks(): IngestHooks {
  return {
    afterSnapshot: async ({ db, snapshot, onProgress }) => {
      await runDetection(db, snapshot.id, { mode: "import", onProgress });
    }
  };
}
