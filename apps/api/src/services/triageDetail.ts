import { and, desc, eq } from "drizzle-orm";
import {
  FACTOR_KEYS, FINDING_THEMES,
  type ConfirmDefaultsDto, type HierarchyLevelDto, type PeerComparisonDto, type PreviousVersionDto, type PreviousVersionFieldDiff, type RuleHitDto,
  type SatkerHistoryDto, type ScoreBreakdownDto, type TriageDecisionDto, type TriageItemContext
} from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { accounts, chrNotes, dismissReasons, organizationUnits, reviewerDecisions, riskAssessments, riskConfig, rkaDocuments, rkaItems, ruleHits, rules, satkerFindingStats, users, workUnits } from "../db/schema.js";
import { loadNoteDto } from "../repositories/chr.js";

export interface ItemRecord {
  item: typeof rkaItems.$inferSelect;
  document: typeof rkaDocuments.$inferSelect;
  organizationUnitName: string;
  workUnit: { id: string; code: string; name: string };
}

/** Item beserta dokumen, eselon I, dan Satker-nya; undefined bila id tidak ada. */
export async function loadItemRecord(db: Db, itemId: string): Promise<ItemRecord | undefined> {
  const [row] = await db.select({ item: rkaItems, document: rkaDocuments, organizationUnitName: organizationUnits.shortName, workUnitId: workUnits.id, workUnitCode: workUnits.code, workUnitName: workUnits.name })
    .from(rkaItems).innerJoin(rkaDocuments, eq(rkaDocuments.id, rkaItems.documentId)).innerJoin(organizationUnits, eq(organizationUnits.id, rkaDocuments.organizationUnitId))
    .innerJoin(workUnits, eq(workUnits.id, rkaItems.workUnitId)).where(eq(rkaItems.id, itemId)).limit(1);
  return row && { item: row.item, document: row.document, organizationUnitName: row.organizationUnitName, workUnit: { id: row.workUnitId, code: row.workUnitCode, name: row.workUnitName } };
}

export async function isLatestSnapshot(db: Db, document: ItemRecord["document"]) {
  const later = await db.select({ id: rkaDocuments.id }).from(rkaDocuments)
    .where(and(eq(rkaDocuments.cycleId, document.cycleId), eq(rkaDocuments.organizationUnitId, document.organizationUnitId))).orderBy(desc(rkaDocuments.versionNo)).limit(1);
  return later[0]?.id === document.id;
}

export async function buildItemContext(db: Db, record: ItemRecord): Promise<TriageItemContext> {
  const { item, document } = record;
  const [account] = await db.select({ name: accounts.name }).from(accounts).where(eq(accounts.code, item.accountCode)).limit(1);
  const detail = item.volumeDetail ?? {};
  const volumeDetail = Number(detail.vol1 ?? 0) > 0
    ? [1, 2, 3, 4].flatMap((index) => {
      const volume = Number(detail[`vol${index}`] ?? 0);
      return volume > 0 ? [{ index, volume, unit: (detail[`sat${index}`] as string | null | undefined) ?? null }] : [];
    })
    : [];
  const names = item.hierarchyNames ?? {};
  const hierarchy: HierarchyLevelDto[] = [
    { level: "program", code: item.programCode, name: names.program ?? null },
    { level: "activity", code: item.activityCode, name: names.activity ?? null },
    { level: "output", code: item.outputCode, name: names.output ?? null },
    { level: "suboutput", code: item.suboutputCode, name: names.suboutput ?? null },
    { level: "component", code: item.componentCode, name: names.component ?? null },
    { level: "subcomponent", code: item.subcomponentCode, name: item.subcomponentName ?? null }
  ];
  return {
    id: item.id, documentId: item.documentId, cycleId: document.cycleId, organizationUnitId: document.organizationUnitId, organizationUnitName: record.organizationUnitName,
    snapshotVersionNo: document.versionNo, snapshotLabel: document.label, workUnitId: record.workUnit.id, workUnitCode: record.workUnit.code, workUnitName: record.workUnit.name,
    accountCode: item.accountCode, accountName: account?.name ?? null, description: item.description, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, totalAmount: item.totalAmount,
    volumeDetail, blokirCode: item.blokirCode, blokirAmount: item.blokirAmount, hierarchy, changeType: item.changeType
  };
}

/** Skor dan perbandingan harga dari penilaian tersimpan terbaru item ini; tidak dihitung ulang saat dibaca. */
export async function buildScore(db: Db, itemId: string, unitPrice: number): Promise<{ score: ScoreBreakdownDto | null; peer: PeerComparisonDto | null }> {
  const [row] = await db.select({ assessment: riskAssessments, config: riskConfig }).from(riskAssessments).innerJoin(riskConfig, eq(riskConfig.id, riskAssessments.riskConfigId))
    .where(eq(riskAssessments.rkaItemId, itemId)).orderBy(desc(riskAssessments.assessedAt), desc(riskAssessments.id)).limit(1);
  if (!row) return { score: null, peer: null };
  const { assessment, config } = row;
  const score: ScoreBreakdownDto = {
    value: assessment.score, category: assessment.category as ScoreBreakdownDto["category"], thresholds: config.thresholds, configVersion: config.version,
    factors: assessment.factors.map((factor) => ({ ...factor, code: factor.code as keyof typeof FACTOR_KEYS, key: FACTOR_KEYS[factor.code as keyof typeof FACTOR_KEYS] })),
    dataCompleteness: assessment.dataCompleteness as ScoreBreakdownDto["dataCompleteness"],
    activeWeight: assessment.factors.filter((factor) => factor.dataAvailable).reduce((sum, factor) => sum + factor.weight, 0)
  };
  const stats = assessment.peerStats;
  const peer: PeerComparisonDto | null = stats ? { itemUnitPrice: unitPrice, median: stats.median, satkerCount: stats.satkerCount, ratio: stats.ratio, min: stats.min, max: stats.max, unit: stats.unit, minSatker: config.params.peerMinSatker } : null;
  return { score, peer };
}

export async function buildRuleHits(db: Db, itemId: string): Promise<RuleHitDto[]> {
  const rows = await db.select({ hit: ruleHits, rule: rules }).from(ruleHits).innerJoin(rules, eq(rules.id, ruleHits.ruleId)).where(eq(ruleHits.rkaItemId, itemId)).orderBy(rules.code);
  return rows.map(({ hit, rule }) => ({
    ruleId: rule.id, code: rule.code, name: rule.name, category: rule.category, reason: hit.reason, matchedTerms: hit.matchedTerms ?? [], source: rule.source, defaultExpectation: rule.defaultExpectation ?? null
  }));
}

export function buildConfirmDefaults(hits: RuleHitDto[]): ConfirmDefaultsDto {
  const first = hits[0]; // urut kode: aturan berkode terkecil
  return first
    ? { category: first.category, text: first.reason, expectation: first.defaultExpectation, ruleCode: first.code }
    : { category: "LAINNYA", text: "", expectation: null, ruleCode: null };
}

export async function buildSatkerHistory(db: Db, workUnit: { id: string; code: string; name: string }): Promise<SatkerHistoryDto> {
  const rows = await db.select().from(satkerFindingStats).where(eq(satkerFindingStats.workUnitCode, workUnit.code));
  return {
    workUnitId: workUnit.id, workUnitName: workUnit.name, hasProfile: rows.length > 0,
    themes: FINDING_THEMES.map((theme) => { const row = rows.find((entry) => entry.theme === theme); return { theme, countTotal: row?.countTotal ?? 0, countOpen: row?.countOpen ?? 0 }; })
  };
}

export async function buildPreviousVersion(db: Db, item: typeof rkaItems.$inferSelect): Promise<PreviousVersionDto | null> {
  if (!item.previousItemId) return null;
  const [row] = await db.select({ previous: rkaItems, versionNo: rkaDocuments.versionNo, label: rkaDocuments.label }).from(rkaItems)
    .innerJoin(rkaDocuments, eq(rkaDocuments.id, rkaItems.documentId)).where(eq(rkaItems.id, item.previousItemId)).limit(1);
  if (!row) return null;
  const field = <K extends PreviousVersionFieldDiff["field"]>(name: K, before: string | number | null, after: string | number | null): PreviousVersionFieldDiff => ({ field: name, before, after, changed: before !== after });
  return {
    previousItemId: row.previous.id, versionNo: row.versionNo, label: row.label,
    fields: [
      field("account_code", row.previous.accountCode, item.accountCode), field("unit_price", row.previous.unitPrice, item.unitPrice),
      field("total_amount", row.previous.totalAmount, item.totalAmount), field("quantity", row.previous.quantity, item.quantity),
      field("unit", row.previous.unit, item.unit), field("description", row.previous.description, item.description)
    ]
  };
}

export interface ResolvedDecision {
  row: typeof reviewerDecisions.$inferSelect;
  /** Diwarisi dari padanan (item `tetap`), read-only. */
  inherited: boolean;
}

/** Keputusan sendiri; bila tidak ada dan item `tetap`, keputusan padanannya (§2.7). */
export async function resolveDecision(db: Db, item: typeof rkaItems.$inferSelect): Promise<ResolvedDecision | null> {
  const [own] = await db.select().from(reviewerDecisions).where(eq(reviewerDecisions.rkaItemId, item.id)).limit(1);
  if (own) return { row: own, inherited: false };
  if (item.changeType !== "tetap" || !item.previousItemId) return null;
  const [inherited] = await db.select().from(reviewerDecisions).where(eq(reviewerDecisions.rkaItemId, item.previousItemId)).limit(1);
  return inherited ? { row: inherited, inherited: true } : null;
}

export async function buildDecisionDto(db: Db, decision: ResolvedDecision): Promise<TriageDecisionDto> {
  const { row } = decision;
  const [reviewer] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, row.reviewerUserId)).limit(1);
  const [reason] = row.reasonCategory ? await db.select({ label: dismissReasons.label }).from(dismissReasons).where(eq(dismissReasons.code, row.reasonCategory)).limit(1) : [];
  const [note] = row.decision === "confirm" ? await db.select({ id: chrNotes.id }).from(chrNotes).where(eq(chrNotes.rkaItemId, row.rkaItemId)).limit(1) : [];
  return {
    decision: row.decision, reasonCategory: row.reasonCategory, reasonLabel: reason?.label ?? null, note: row.note, reviewerName: reviewer?.name ?? "",
    decidedAt: row.createdAt, inherited: decision.inherited, chrNote: note ? await loadNoteDto(db, note.id) : null
  };
}
