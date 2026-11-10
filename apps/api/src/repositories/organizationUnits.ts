import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { organizationUnits } from "../db/schema.js";

const columns = { id: organizationUnits.id, code: organizationUnits.code, shortName: organizationUnits.shortName, name: organizationUnits.name };

/** `scope` null = semua eselon I; array = hanya id tersebut. */
export async function listOrganizationUnits(db: Db, scope: string[] | null) {
  if (scope && scope.length === 0) return [];
  const query = db.select(columns).from(organizationUnits);
  return (scope ? query.where(inArray(organizationUnits.id, scope)) : query).orderBy(asc(organizationUnits.code));
}

export async function findOrganizationUnit(db: Db, id: string) {
  const [unit] = await db.select(columns).from(organizationUnits).where(eq(organizationUnits.id, id)).limit(1);
  return unit;
}
