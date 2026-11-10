import { count, desc, eq } from "drizzle-orm";
import type { CycleStage, CycleStatus, ReviewCycleDto } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { reviewCycles, rkaDocuments } from "../db/schema.js";
import { newId } from "../lib/security.js";

const columns = {
  id: reviewCycles.id, fiscalYear: reviewCycles.fiscalYear, stage: reviewCycles.stage, name: reviewCycles.name,
  adkDeadline: reviewCycles.adkDeadline, dipaIssuedAt: reviewCycles.dipaIssuedAt, status: reviewCycles.status
};

export async function listCycles(db: Db): Promise<ReviewCycleDto[]> {
  return db.select(columns).from(reviewCycles).orderBy(desc(reviewCycles.fiscalYear), desc(reviewCycles.stage));
}

export async function findCycle(db: Db, id: string): Promise<ReviewCycleDto | undefined> {
  const [cycle] = await db.select(columns).from(reviewCycles).where(eq(reviewCycles.id, id)).limit(1);
  return cycle;
}

export async function findCycleByYearStage(db: Db, fiscalYear: number, stage: CycleStage) {
  const rows = await db.select(columns).from(reviewCycles).where(eq(reviewCycles.fiscalYear, fiscalYear));
  return rows.find((row) => row.stage === stage);
}

export async function createCycle(db: Db, input: { fiscalYear: number; stage: CycleStage; name: string; adkDeadline: number | null; dipaIssuedAt: number | null; createdBy: string | null }) {
  const id = newId("cycle");
  await db.insert(reviewCycles).values({ id, ...input, status: "aktif", createdAt: Date.now() });
  return id;
}

export async function updateCycle(db: Db, id: string, patch: { name?: string; adkDeadline?: number | null; dipaIssuedAt?: number | null; status?: CycleStatus }) {
  if (Object.keys(patch).length) await db.update(reviewCycles).set(patch).where(eq(reviewCycles.id, id));
}

export async function deleteCycle(db: Db, id: string) {
  await db.delete(reviewCycles).where(eq(reviewCycles.id, id));
}

export async function countCycleSnapshots(db: Db, cycleId: string) {
  const [{ total }] = await db.select({ total: count() }).from(rkaDocuments).where(eq(rkaDocuments.cycleId, cycleId));
  return total;
}
