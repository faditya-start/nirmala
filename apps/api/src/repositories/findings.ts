import type { Db } from "../db/client.js";
import { satkerFindingStats } from "../db/schema.js";
import type { FindingProfile } from "../services/riskScoring.js";

export const NO_PROFILE: FindingProfile = { hasProfile: false, total: 0, open: 0 };

/** Profil temuan BPK per kode Satker. Satker yang tidak ada di peta = tanpa profil. */
export async function loadFindingProfiles(db: Db): Promise<Map<string, FindingProfile>> {
  const rows = await db.select().from(satkerFindingStats);
  const profiles = new Map<string, FindingProfile>();
  for (const row of rows) {
    const profile = profiles.get(row.workUnitCode) ?? { hasProfile: true, total: 0, open: 0 };
    if (row.theme === "penganggaran") { profile.total = row.countTotal; profile.open = row.countOpen; }
    profiles.set(row.workUnitCode, profile);
  }
  return profiles;
}
