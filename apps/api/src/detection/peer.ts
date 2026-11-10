/**
 * Pembanding harga antar-Satker (faktor F1, rule-catalog.md §4). Kelompok = uraian ternormalisasi + satuan;
 * dipakai bila muncul di >= `minSatker` Satker berbeda dalam siklus yang sama (snapshot terbaru tiap eselon I).
 */
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { rkaDocuments, rkaItems } from "../db/schema.js";
import { normalizeDescription } from "../ingest/matcher.js";

export interface PeerRow {
  description: string;
  unit: string | null;
  unitPrice: number;
  workUnitId: string;
}

export interface PeerGroup {
  median: number;
  satkerCount: number;
  min: number;
  max: number;
  /** Satuan seperti tertulis di data (kemunculan pertama). */
  unit: string | null;
}

export const peerGroupKey = (description: string, unit: string | null) => `${normalizeDescription(description)}|${(unit ?? "").trim().toLowerCase()}`;

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Item berharga <= 0 tidak ikut dihitung. Kelompok dengan < `minSatker` Satker dibuang. */
export function buildPeerGroups(rows: Iterable<PeerRow>, minSatker: number): Map<string, PeerGroup> {
  const raw = new Map<string, { prices: number[]; satkers: Set<string>; unit: string | null }>();
  for (const row of rows) {
    if (row.unitPrice <= 0) continue;
    const key = peerGroupKey(row.description, row.unit);
    const entry = raw.get(key) ?? { prices: [], satkers: new Set<string>(), unit: row.unit };
    entry.prices.push(row.unitPrice);
    entry.satkers.add(row.workUnitId);
    raw.set(key, entry);
  }
  const groups = new Map<string, PeerGroup>();
  for (const [key, entry] of raw) {
    if (entry.satkers.size < minSatker) continue;
    groups.set(key, { median: median(entry.prices), satkerCount: entry.satkers.size, min: Math.min(...entry.prices), max: Math.max(...entry.prices), unit: entry.unit });
  }
  return groups;
}

export interface PeerComparison extends PeerGroup {
  /** Harga satuan item / median. */
  ratio: number;
}

export function comparePeer(groups: Map<string, PeerGroup>, item: { description: string; unit: string | null; unitPrice: number }): PeerComparison | null {
  if (item.unitPrice <= 0) return null;
  const group = groups.get(peerGroupKey(item.description, item.unit));
  if (!group || group.median <= 0) return null;
  return { ...group, ratio: item.unitPrice / group.median };
}

const PAGE = 20_000;

/** Snapshot terbaru tiap eselon I pada siklus. */
export async function latestDocumentIds(db: Db, cycleId: string): Promise<string[]> {
  const docs = await db.select({ id: rkaDocuments.id, organizationUnitId: rkaDocuments.organizationUnitId, versionNo: rkaDocuments.versionNo }).from(rkaDocuments).where(eq(rkaDocuments.cycleId, cycleId));
  const latest = new Map<string, { id: string; versionNo: number }>();
  for (const doc of docs) if (!latest.has(doc.organizationUnitId) || latest.get(doc.organizationUnitId)!.versionNo < doc.versionNo) latest.set(doc.organizationUnitId, doc);
  return [...latest.values()].map((doc) => doc.id);
}

export async function loadPeerGroups(db: Db, cycleId: string, minSatker: number): Promise<Map<string, PeerGroup>> {
  const documentIds = await latestDocumentIds(db, cycleId);
  if (documentIds.length === 0) return new Map();
  const rows: PeerRow[] = [];
  let after = "";
  for (;;) {
    const page = await db.select({ id: rkaItems.id, description: rkaItems.description, unit: rkaItems.unit, unitPrice: rkaItems.unitPrice, workUnitId: rkaItems.workUnitId })
      .from(rkaItems).where(and(inArray(rkaItems.documentId, documentIds), gt(rkaItems.id, after))).orderBy(asc(rkaItems.id)).limit(PAGE);
    rows.push(...page);
    if (page.length < PAGE) break;
    after = page[page.length - 1].id;
  }
  return buildPeerGroups(rows, minSatker);
}
