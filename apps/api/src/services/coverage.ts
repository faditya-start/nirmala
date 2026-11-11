/** Cakupan eselon I untuk dashboard, laporan, dan ekspor: gabungan scope pengguna dan filter `organizationUnitId` (docs/api-contract.md §1.3). */
import { asc, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { organizationUnits } from "../db/schema.js";

export type Coverage = { forbidden: false; orgIds: string[] | null } | { forbidden: true };

/**
 * `scope` null = semua eselon I. `requested` di luar scope -> `forbidden`. `orgIds` null = semua eselon I;
 * array kosong = tidak melihat apa pun (hasil kosong, bukan galat).
 */
export function resolveCoverage(scope: string[] | null, requested?: string): Coverage {
  if (requested) return scope === null || scope.includes(requested) ? { forbidden: false, orgIds: [requested] } : { forbidden: true };
  return { forbidden: false, orgIds: scope };
}

export const FORBIDDEN_ORG_MESSAGE = "Anda tidak memiliki akses ke eselon I ini.";

export interface CoverageOrg { id: string; code: string; shortName: string; name: string }

/** Eselon I dalam cakupan, urut kode. */
export async function loadCoverageOrgs(db: Db, orgIds: string[] | null): Promise<CoverageOrg[]> {
  if (orgIds && orgIds.length === 0) return [];
  const query = db.select({ id: organizationUnits.id, code: organizationUnits.code, shortName: organizationUnits.shortName, name: organizationUnits.name }).from(organizationUnits);
  return (orgIds ? query.where(inArray(organizationUnits.id, orgIds)) : query).orderBy(asc(organizationUnits.code));
}
