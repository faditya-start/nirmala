import { desc, eq } from "drizzle-orm";
import type { FactorMetaDto, RiskConfigDto } from "@nirmala/shared";
import { FACTOR_CODES, FACTOR_KEYS } from "@nirmala/shared";
import type { Db } from "../db/client.js";
import { riskConfig, users } from "../db/schema.js";
import { newId } from "../lib/security.js";
import { FACTOR_META } from "../services/riskScoring.js";

export type RiskConfigRow = typeof riskConfig.$inferSelect;

/** Konfigurasi aktif = yang terbaru (hanya insert). */
export async function activeRiskConfig(db: Db): Promise<RiskConfigRow> {
  const [row] = await db.select().from(riskConfig).orderBy(desc(riskConfig.createdAt), desc(riskConfig.id)).limit(1);
  if (!row) throw new Error("Konfigurasi skor belum ada. Jalankan seed master data.");
  return row;
}

export async function listRiskConfigs(db: Db) {
  return db.select({ row: riskConfig, createdByName: users.displayName }).from(riskConfig)
    .leftJoin(users, eq(users.id, riskConfig.createdBy)).orderBy(desc(riskConfig.createdAt), desc(riskConfig.id));
}

export function toRiskConfigDto(row: RiskConfigRow, createdByName: string | null, activeId: string): RiskConfigDto {
  return { id: row.id, version: row.version, weights: row.weights, thresholds: row.thresholds, params: row.params, createdByName, createdAt: row.createdAt, active: row.id === activeId };
}

/** Versi berikutnya = bilangan bulat terbesar + 1 (versi non-numerik seperti "rules-v1" dihitung 0). */
export async function nextRiskConfigVersion(db: Db) {
  const rows = await db.select({ version: riskConfig.version }).from(riskConfig);
  const max = rows.reduce((top, row) => (/^\d+$/.test(row.version) ? Math.max(top, Number(row.version)) : top), 0);
  return String(max + 1);
}

export async function insertRiskConfig(db: Db, input: { weights: RiskConfigRow["weights"]; thresholds: RiskConfigRow["thresholds"]; params: RiskConfigRow["params"]; createdBy: string }) {
  const latest = await activeRiskConfig(db);
  const id = newId("riskcfg");
  // Waktu dibuat dijamin lebih besar dari versi terbaru supaya "terbaru = aktif" tidak ambigu di milidetik yang sama.
  const createdAt = Math.max(Date.now(), latest.createdAt + 1);
  await db.insert(riskConfig).values({ id, version: await nextRiskConfigVersion(db), createdAt, ...input });
  const [row] = await db.select().from(riskConfig).where(eq(riskConfig.id, id));
  return row;
}

export const FACTOR_META_LIST: FactorMetaDto[] = FACTOR_CODES.map((code) => ({ code, key: FACTOR_KEYS[code], label: FACTOR_META[code].label, description: FACTOR_META[code].description }));
