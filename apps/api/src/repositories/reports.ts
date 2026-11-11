/** Kueri agregat untuk laporan (docs/api-contract.md §6.2): keputusan dismiss pada item snapshot terbaru. */
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { DismissReasonCount } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { dismissReasons, reviewerDecisions, rkaItems } from "../db/schema.js";

/** Keputusan dismiss milik item sendiri (keputusan yang diwarisi tidak dihitung ganda). */
export async function countDismissedItems(db: Db, documentIds: string[]): Promise<number> {
  if (documentIds.length === 0) return 0;
  const [row] = await db.select({ total: count() }).from(reviewerDecisions).innerJoin(rkaItems, eq(rkaItems.id, reviewerDecisions.rkaItemId))
    .where(and(inArray(rkaItems.documentId, documentIds), eq(reviewerDecisions.decision, "dismiss")));
  return row.total;
}

/** Alasan dismiss, urut jumlah menurun lalu kode; hanya yang count > 0. Dismiss tanpa alasan tersimpan tidak dihitung. */
export async function dismissReasonCounts(db: Db, documentIds: string[]): Promise<DismissReasonCount[]> {
  if (documentIds.length === 0) return [];
  const total = count();
  const rows = await db.select({ code: dismissReasons.code, label: dismissReasons.label, total }).from(reviewerDecisions)
    .innerJoin(rkaItems, eq(rkaItems.id, reviewerDecisions.rkaItemId))
    .innerJoin(dismissReasons, eq(dismissReasons.code, reviewerDecisions.reasonCategory))
    .where(and(inArray(rkaItems.documentId, documentIds), eq(reviewerDecisions.decision, "dismiss")))
    .groupBy(dismissReasons.code, dismissReasons.label).orderBy(desc(total), dismissReasons.code);
  return rows.map((row) => ({ code: row.code, label: row.label, count: row.total }));
}
