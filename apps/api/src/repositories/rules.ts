import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { rules } from "../db/schema.js";
import type { EngineRule } from "../detection/rules.js";

export type RuleRow = typeof rules.$inferSelect;

export async function listRules(db: Db) {
  return db.select().from(rules).orderBy(asc(rules.code));
}

export async function findRule(db: Db, id: string) {
  const [rule] = await db.select().from(rules).where(eq(rules.id, id)).limit(1);
  return rule;
}

export const toEngineRule = (rule: RuleRow): EngineRule => ({ id: rule.id, code: rule.code, kind: rule.kind, params: rule.params, reasonTemplate: rule.reasonTemplate });

export async function listActiveEngineRules(db: Db): Promise<EngineRule[]> {
  return (await db.select().from(rules).where(eq(rules.active, true)).orderBy(asc(rules.code))).map(toEngineRule);
}
