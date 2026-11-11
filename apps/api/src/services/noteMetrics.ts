/**
 * Data catatan untuk dashboard, laporan, ekspor CSV, dan agregat publik. "Catatan terbit" = catatan bukan `draf`
 * pada CHR yang bukan `draft` (docs/api-contract.md §2.4, §2.8).
 */
import { and, eq, inArray } from "drizzle-orm";
import { daysBetween, type CheckResult, type ChrStatus, type Expectation, type NoteCategory, type NoteStatus } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { chrDocuments, chrNotes, rkaItems, rules, workUnits } from "../db/schema.js";

export interface NoteRecord {
  id: string;
  chrId: string;
  chrStatus: ChrStatus;
  chrNumber: string | null;
  chrIssuedAt: number | null;
  organizationUnitId: string;
  workUnitId: string | null;
  workUnitCode: string | null;
  workUnitName: string | null;
  category: NoteCategory;
  status: NoteStatus;
  title: string | null;
  text: string;
  expectation: Expectation;
  ruleCode: string | null;
  accountCode: string | null;
  itemDescription: string | null;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}

export type { CheckResult };

/** Semua catatan (termasuk draf) pada siklus untuk eselon I dalam `orgIds` (null = semua). */
export async function loadNotes(db: Db, cycleId: string, orgIds: string[] | null): Promise<NoteRecord[]> {
  if (orgIds && orgIds.length === 0) return [];
  const rows = await db.select({
    id: chrNotes.id, chrId: chrDocuments.id, chrStatus: chrDocuments.status, chrNumber: chrDocuments.documentNumber, chrIssuedAt: chrDocuments.issuedAt,
    organizationUnitId: chrDocuments.organizationUnitId, workUnitId: chrNotes.workUnitId, workUnitCode: workUnits.code, workUnitName: workUnits.name,
    category: chrNotes.category, status: chrNotes.status, title: chrNotes.title, text: chrNotes.text, expectation: chrNotes.expectation,
    ruleCode: rules.code, accountCode: rkaItems.accountCode, itemDescription: rkaItems.description,
    createdAt: chrNotes.createdAt, updatedAt: chrNotes.updatedAt, closedAt: chrNotes.closedAt
  }).from(chrNotes)
    .innerJoin(chrDocuments, eq(chrDocuments.id, chrNotes.chrDocumentId))
    .leftJoin(workUnits, eq(workUnits.id, chrNotes.workUnitId))
    .leftJoin(rkaItems, eq(rkaItems.id, chrNotes.rkaItemId))
    .leftJoin(rules, eq(rules.id, chrNotes.ruleId))
    .where(and(eq(chrDocuments.cycleId, cycleId), orgIds ? inArray(chrDocuments.organizationUnitId, orgIds) : undefined));
  return rows.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export const isIssued = (note: NoteRecord) => note.chrStatus !== "draft" && note.status !== "draf";

/** Waktu terbit catatan = waktu terbit CHR-nya (sama dengan "umur" di Smart Tracker); draf tanpa terbit memakai waktu dibuat. */
export const issuedAtOf = (note: NoteRecord) => note.chrIssuedAt ?? note.createdAt;

export function emptyCategoryCounts(): Record<NoteCategory, number> {
  return { EFISIENSI: 0, SATUAN_BIAYA: 0, AKUN: 0, LAINNYA: 0 };
}

/** Hari dari terbit sampai closed untuk catatan closed (bulat, >= 0). */
export function closeDays(notes: NoteRecord[]): number[] {
  return notes.filter((note) => note.status === "closed" && note.closedAt !== null).map((note) => daysBetween(issuedAtOf(note), note.closedAt!));
}

/** Median; satu angka desimal. null bila kosong. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(value * 10) / 10;
}

export function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

/** Waktu data terbaru dari sekumpulan catatan dan waktu lain. */
export function latestTime(notes: NoteRecord[], extra: number[] = []): number | null {
  let latest: number | null = null;
  for (const at of [...extra, ...notes.flatMap((note) => [note.createdAt, note.updatedAt, note.closedAt ?? 0])]) if (at > 0 && (latest === null || at > latest)) latest = at;
  return latest;
}
