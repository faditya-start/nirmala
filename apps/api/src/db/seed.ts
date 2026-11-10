import { fileURLToPath } from "node:url";
import type { Database } from "./client.js";
import { accounts, dismissReasons, organizationUnits, riskConfig, rules, userScopes, users } from "./schema.js";
import { hashPassword } from "../lib/security.js";
import { ACCOUNT_SEEDS, DEFAULT_RISK_PARAMS, DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS, DEMO_USER_SEEDS, DISMISS_REASON_SEEDS, ORGANIZATION_UNIT_SEEDS } from "./seeds/reference.js";
import { RULE_SEEDS } from "./seeds/rules.js";

/**
 * Seed master data + akun demo. Idempoten: baris yang sudah ada dibiarkan.
 * Semua data sintetis. Dipanggil setelah migrasi.
 */
export async function seedMasterData({ db }: Database) {
  const now = Date.now();
  await db.insert(organizationUnits).values(ORGANIZATION_UNIT_SEEDS.map((unit) => ({ ...unit, createdAt: now }))).onConflictDoNothing();
  await db.insert(accounts).values([...ACCOUNT_SEEDS]).onConflictDoNothing();
  await db.insert(dismissReasons).values(DISMISS_REASON_SEEDS.map((reason) => ({ ...reason, active: true }))).onConflictDoNothing();

  for (const user of DEMO_USER_SEEDS) {
    await db.insert(users).values({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, passwordHash: await hashPassword(user.password), createdAt: now }).onConflictDoNothing();
    if (user.scope.length) await db.insert(userScopes).values(user.scope.map((organizationUnitId) => ({ userId: user.id, organizationUnitId }))).onConflictDoNothing();
  }

  await db.insert(rules).values(RULE_SEEDS.map((rule) => ({
    id: `rule_${rule.code}`, code: rule.code, name: rule.name, category: rule.category, kind: rule.kind, params: rule.params,
    reasonTemplate: rule.reasonTemplate, source: rule.source, defaultExpectation: rule.defaultExpectation, active: true,
    validYear: null, validationNote: rule.validationNote, updatedAt: now
  }))).onConflictDoNothing();

  await db.insert(riskConfig).values({
    id: "risk_config_v1", version: "rules-v1", weights: DEFAULT_WEIGHTS, thresholds: DEFAULT_THRESHOLDS, params: DEFAULT_RISK_PARAMS, createdBy: "usr_admin", createdAt: now
  }).onConflictDoNothing();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await import("dotenv/config");
  const { getDatabase } = await import("./client.js");
  const { migrate } = await import("./migrate.js");
  const database = getDatabase();
  migrate(database);
  await seedMasterData(database);
  console.log("Seed sintetis NIRMALA selesai dibuat.");
}
