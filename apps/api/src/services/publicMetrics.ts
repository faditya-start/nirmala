/**
 * Agregat publik (docs/api-contract.md §2.8, §6.3; contracts/publik.ts). Ditulis saat siklus ditandai DIPA terbit; endpoint
 * publik hanya membaca `public_metrics` (+ `review_cycles` untuk daftar siklus), tidak pernah item, Satker, atau rupiah.
 */
import { and, desc, eq, isNotNull } from "drizzle-orm";
import {
  NOTE_CATEGORIES, PUBLIC_MIN_NOTES_DEFAULT,
  type NoteCategory, type PublicCycleDto, type PublicCycleListResponse, type PublicOrganizationRow, type PublicTransparencyResponse
} from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { publicMetrics, reviewCycles } from "../db/schema.js";
import { newId } from "../lib/security.js";
import { loadCoverageOrgs } from "./coverage.js";
import { closeDays, emptyCategoryCounts, isIssued, loadNotes, median, percent, type NoteRecord } from "./noteMetrics.js";

export const PUBLIC_TOTAL_LABEL = "__TOTAL__";
export const PUBLIC_TOTAL_CATEGORY = "__ALL__";
export const PUBLIC_OTHERS_LABEL = "Lainnya";

export type PublicGroup = { label: string; orgIds: string[] };

/**
 * Pengelompokan eselon I: yang total catatan terbitnya < k digabung ke `Lainnya`. Bila gabungan hanya berasal dari satu
 * eselon I, eselon I terkecil berikutnya (>= k) ikut digabung; bila tidak ada yang >= k, semuanya menjadi `Lainnya`.
 * Eselon I tanpa catatan terbit tidak muncul.
 */
export function groupOrganizations(orgs: { id: string; label: string; total: number }[], minNotes: number): PublicGroup[] {
  const present = orgs.filter((org) => org.total > 0);
  if (present.length === 1) return [{ label: PUBLIC_OTHERS_LABEL, orgIds: [present[0].id] }]; // satu eselon I saja: tidak boleh ditelusuri
  const small = present.filter((org) => org.total < minNotes);
  let large = present.filter((org) => org.total >= minNotes).sort((a, b) => a.total - b.total || a.label.localeCompare(b.label));
  const merged = [...small];
  if (merged.length === 1 && large.length > 0) merged.push(large.shift()!);
  const groups: PublicGroup[] = large.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)).map((org) => ({ label: org.label, orgIds: [org.id] }));
  if (merged.length > 0) groups.push({ label: PUBLIC_OTHERS_LABEL, orgIds: merged.map((org) => org.id) });
  return groups;
}

/**
 * Menghitung ulang `public_metrics` siklus (hapus lalu isi). Harus dipanggil di dalam transaksi. Mengembalikan jumlah baris
 * yang ditulis (termasuk baris rekap).
 */
export async function generatePublicMetrics(db: Db, cycleId: string, adkDeadline: number | null, minNotes: number): Promise<number> {
  await db.delete(publicMetrics).where(eq(publicMetrics.cycleId, cycleId));
  const now = Date.now();
  const orgs = await loadCoverageOrgs(db, null);
  const issued = (await loadNotes(db, cycleId, null)).filter(isIssued);
  const groups = groupOrganizations(orgs.map((org) => ({ id: org.id, label: org.shortName, total: issued.filter((note) => note.organizationUnitId === org.id).length })), minNotes);

  const rows: (typeof publicMetrics.$inferInsert)[] = [];
  const summarize = (list: NoteRecord[]) => ({
    notesTotal: list.length,
    closedBeforeDeadline: adkDeadline === null ? 0 : list.filter((note) => note.status === "closed" && note.closedAt !== null && note.closedAt <= adkDeadline).length,
    medianDaysToClose: median(closeDays(list))
  });
  for (const group of groups) {
    const own = issued.filter((note) => group.orgIds.includes(note.organizationUnitId));
    for (const category of NOTE_CATEGORIES) {
      const cell = own.filter((note) => note.category === category);
      if (cell.length > 0) rows.push({ id: newId("pubm"), cycleId, organizationUnitLabel: group.label, category, ...summarize(cell), generatedAt: now });
    }
  }
  // Rekap siklus: median keseluruhan tidak dapat diturunkan dari median per sel.
  rows.push({ id: newId("pubm"), cycleId, organizationUnitLabel: PUBLIC_TOTAL_LABEL, category: PUBLIC_TOTAL_CATEGORY, ...summarize(issued), generatedAt: now });
  await db.insert(publicMetrics).values(rows);
  return rows.length;
}

export async function listPublicCycles(db: Db): Promise<PublicCycleListResponse> {
  const rows = await db.select({ id: reviewCycles.id, name: reviewCycles.name, fiscalYear: reviewCycles.fiscalYear, stage: reviewCycles.stage, dipaIssuedAt: reviewCycles.dipaIssuedAt })
    .from(reviewCycles).innerJoin(publicMetrics, and(eq(publicMetrics.cycleId, reviewCycles.id), eq(publicMetrics.organizationUnitLabel, PUBLIC_TOTAL_LABEL)))
    .where(isNotNull(reviewCycles.dipaIssuedAt)).orderBy(desc(reviewCycles.dipaIssuedAt), desc(reviewCycles.fiscalYear), desc(reviewCycles.id));
  return { cycles: rows.map((row) => ({ ...row, dipaIssuedAt: row.dipaIssuedAt! }) satisfies PublicCycleDto) };
}

/** `undefined` = siklus tidak ada, DIPA belum terbit, atau agregat belum dibuat (404). */
export async function buildPublicTransparency(db: Db, cycleId: string | undefined, minNotes: number, synthetic: boolean): Promise<PublicTransparencyResponse | undefined> {
  const { cycles } = await listPublicCycles(db);
  const cycle = cycleId ? cycles.find((entry) => entry.id === cycleId) : cycles[0];
  if (!cycle) return undefined;
  const metrics = await db.select().from(publicMetrics).where(eq(publicMetrics.cycleId, cycle.id));
  const total = metrics.find((row) => row.organizationUnitLabel === PUBLIC_TOTAL_LABEL);
  if (!total) return undefined;

  const byLabel = new Map<string, PublicOrganizationRow>();
  for (const row of metrics) {
    if (row.organizationUnitLabel === PUBLIC_TOTAL_LABEL || !(NOTE_CATEGORIES as readonly string[]).includes(row.category)) continue;
    const entry = byLabel.get(row.organizationUnitLabel)
      ?? { kind: row.organizationUnitLabel === PUBLIC_OTHERS_LABEL ? "lainnya" as const : "eselon" as const, label: row.organizationUnitLabel, byCategory: emptyCategoryCounts(), total: 0 };
    entry.byCategory[row.category as NoteCategory] += row.notesTotal;
    entry.total += row.notesTotal;
    byLabel.set(row.organizationUnitLabel, entry);
  }
  const rows = [...byLabel.values()].sort((a, b) => (a.kind === "lainnya" ? 1 : 0) - (b.kind === "lainnya" ? 1 : 0) || b.total - a.total || a.label.localeCompare(b.label));
  const totals = { byCategory: emptyCategoryCounts(), total: 0 };
  for (const row of rows) { for (const category of NOTE_CATEGORIES) totals.byCategory[category] += row.byCategory[category]; totals.total += row.total; }

  return {
    cycle, synthetic, generatedAt: Math.max(...metrics.map((row) => row.generatedAt)), minNotes,
    kpis: { notesTotal: total.notesTotal, closedBeforeDeadline: total.closedBeforeDeadline, closedBeforeDeadlinePercent: percent(total.closedBeforeDeadline, total.notesTotal), medianDaysToClose: total.medianDaysToClose },
    rows, totals
  };
}

export { PUBLIC_MIN_NOTES_DEFAULT };
