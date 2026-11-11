/** Administrasi Fase 3: katalog aturan (S12a) dan bobot skor (S12b). Hanya peran admin. docs/api-contract.md §3.4. */
import { count, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import {
  createRiskConfigBodySchema, parseRuleParams, recalculateBodySchema, ruleListQuerySchema, toggleRuleBodySchema, updateRuleBodySchema,
  type RecalculateAcceptedResponse, type RecalculateResult, type RiskConfigCreatedResponse, type RiskConfigResponse, type RuleAdminDto, type RuleListResponse
} from "@nirmala/shared";
import type { Database, Db } from "../db/client.js";
import { rkaItems, ruleHits, rules } from "../db/schema.js";
import { latestDocumentIds } from "../detection/peer.js";
import type { JobRegistry } from "../jobs/registry.js";
import { requireRole, type AppEnv } from "../middleware/auth.js";
import { recordAudit } from "../repositories/audit.js";
import { findCycle, latestActiveCycle } from "../repositories/cycles.js";
import { activeRiskConfig, FACTOR_META_LIST, insertRiskConfig, listRiskConfigs, toRiskConfigDto } from "../repositories/riskConfig.js";
import { findRule, listRules, type RuleRow } from "../repositories/rules.js";
import { runDetection } from "../services/detectionPipeline.js";
import { validateRiskConfig } from "../services/riskScoring.js";

const RULE_FIELDS = (rule: RuleRow) => ({
  name: rule.name, category: rule.category, params: rule.params, reasonTemplate: rule.reasonTemplate, defaultExpectation: rule.defaultExpectation, active: rule.active, validationNote: rule.validationNote
});

async function hitCounts(db: Db, cycleId: string | undefined): Promise<Map<string, number>> {
  if (!cycleId) return new Map();
  const documentIds = await latestDocumentIds(db, cycleId);
  if (documentIds.length === 0) return new Map();
  const rows = await db.select({ ruleId: ruleHits.ruleId, total: count() }).from(ruleHits).innerJoin(rkaItems, eq(rkaItems.id, ruleHits.rkaItemId)).where(inArray(rkaItems.documentId, documentIds)).groupBy(ruleHits.ruleId);
  return new Map(rows.map((row) => [row.ruleId, row.total]));
}

const toRuleDto = (rule: RuleRow, hits: Map<string, number>): RuleAdminDto => ({
  id: rule.id, code: rule.code, name: rule.name, category: rule.category, kind: rule.kind, params: rule.params, reasonTemplate: rule.reasonTemplate, source: rule.source,
  defaultExpectation: rule.defaultExpectation ?? null, active: rule.active, validYear: rule.validYear, validationNote: rule.validationNote,
  needsValidation: Boolean(rule.validationNote), appliesToRevisionOnly: rule.params.onlyRevision === true, hitCount: hits.get(rule.id) ?? 0, updatedAt: rule.updatedAt
});

export function adminRoutes(database: Database, jobs: JobRegistry) {
  const { db } = database;
  const routes = new Hono<AppEnv>();
  routes.use("*", requireRole("admin"));

  // ------------------------------------------------------------------ Aturan

  routes.get("/rules", async (context) => {
    const parsed = ruleListQuerySchema.safeParse(context.req.query());
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Parameter tidak valid." }, 400);
    const cycle = parsed.data.cycleId ? await findCycle(db, parsed.data.cycleId) : await latestActiveCycle(db);
    if (parsed.data.cycleId && !cycle) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    const hits = await hitCounts(db, cycle?.id);
    const all = await listRules(db);
    return context.json({ cycle: cycle ?? null, rules: all.map((rule) => toRuleDto(rule, hits)), totalRules: all.length, activeRules: all.filter((rule) => rule.active).length } satisfies RuleListResponse);
  });

  const respondWithRule = async (id: string) => {
    const rule = (await findRule(db, id))!;
    return { rule: toRuleDto(rule, await hitCounts(db, (await latestActiveCycle(db))?.id)) };
  };

  routes.put("/rules/:id", async (context) => {
    const actor = context.get("user")!;
    const before = await findRule(db, context.req.param("id"));
    if (!before) return context.json({ error: "Aturan tidak ditemukan." }, 404);
    const parsed = updateRuleBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Data aturan tidak valid." }, 400);
    const { params, ...rest } = parsed.data;
    let cleanParams: Record<string, unknown> | undefined;
    if (params !== undefined) {
      const checked = parseRuleParams(before.kind, params);
      if (!checked.ok) return context.json({ error: checked.error }, 400);
      cleanParams = checked.data as Record<string, unknown>;
    }
    const patch = { ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)), ...(cleanParams ? { params: cleanParams } : {}), updatedAt: Date.now() };
    await database.transaction(async () => {
      await db.update(rules).set(patch).where(eq(rules.id, before.id));
      const after = (await findRule(db, before.id))!;
      await recordAudit(db, { actorId: actor.id, action: "rule.updated", entityType: "rule", entityId: before.id, detail: `Aturan ${before.code} diperbarui.`, before: RULE_FIELDS(before), after: RULE_FIELDS(after) });
    });
    return context.json(await respondWithRule(before.id));
  });

  routes.put("/rules/:id/active", async (context) => {
    const actor = context.get("user")!;
    const before = await findRule(db, context.req.param("id"));
    if (!before) return context.json({ error: "Aturan tidak ditemukan." }, 404);
    const parsed = toggleRuleBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: "Nilai aktif harus true atau false." }, 400);
    await database.transaction(async () => {
      await db.update(rules).set({ active: parsed.data.active, updatedAt: Date.now() }).where(eq(rules.id, before.id));
      await recordAudit(db, { actorId: actor.id, action: "rule.toggled", entityType: "rule", entityId: before.id, detail: `Aturan ${before.code} ${parsed.data.active ? "diaktifkan" : "dinonaktifkan"}.`, before: { active: before.active }, after: { active: parsed.data.active } });
    });
    return context.json(await respondWithRule(before.id));
  });

  // ------------------------------------------------------------------ Bobot skor

  routes.get("/risk-config", async (context) => {
    const active = await activeRiskConfig(db);
    const versions = (await listRiskConfigs(db)).map(({ row, createdByName }) => toRiskConfigDto(row, createdByName, active.id));
    return context.json({ active: versions.find((version) => version.id === active.id)!, versions, factors: FACTOR_META_LIST } satisfies RiskConfigResponse);
  });

  routes.post("/risk-config", async (context) => {
    const actor = context.get("user")!;
    const parsed = createRiskConfigBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Konfigurasi tidak valid." }, 400);
    const invalid = validateRiskConfig(parsed.data);
    if (invalid) return context.json({ error: invalid }, 400);
    const created = await database.transaction(async () => {
      const current = await activeRiskConfig(db);
      const row = await insertRiskConfig(db, { weights: parsed.data.weights, thresholds: parsed.data.thresholds, params: parsed.data.params ?? current.params, createdBy: actor.id });
      await recordAudit(db, {
        actorId: actor.id, action: "risk_config.created", entityType: "risk_config", entityId: row.id, detail: `Konfigurasi skor versi ${row.version} dibuat.`,
        before: { version: current.version, weights: current.weights, thresholds: current.thresholds }, after: { version: row.version, weights: row.weights, thresholds: row.thresholds }
      });
      return row;
    });
    return context.json({ config: toRiskConfigDto(created, actor.name, created.id) } satisfies RiskConfigCreatedResponse, 201);
  });

  routes.post("/risk-config/recalculate", async (context) => {
    const actor = context.get("user")!;
    const parsed = recalculateBodySchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? "Siklus wajib dipilih." }, 400);
    const cycle = await findCycle(db, parsed.data.cycleId);
    if (!cycle) return context.json({ error: "Siklus tidak ditemukan." }, 404);
    const release = jobs.tryLock(`recalculate:${cycle.id}`);
    if (!release) return context.json({ error: "Hitung ulang untuk siklus ini sedang berjalan." }, 409);

    const handle = jobs.create("recalculate", actor.id, ["aturan", "skor"], release);
    handle.setStep("aturan", "berjalan");
    handle.setStep("skor", "berjalan");
    const startedAt = Date.now();
    // Satu transaksi untuk seluruh siklus: gagal di tengah = tidak ada yang berubah.
    void database.transaction(async () => {
      const documentIds = await latestDocumentIds(db, cycle.id);
      const totals = await Promise.all(documentIds.map(async (id) => (await db.select({ total: count() }).from(rkaItems).where(eq(rkaItems.documentId, id)))[0].total));
      const grand = totals.reduce((sum, total) => sum + total, 0);
      let done = 0;
      let hits = 0;
      let config = await activeRiskConfig(db);
      for (const [index, id] of documentIds.entries()) {
        const result = await runDetection(db, id, { mode: "recalculate", onProgress: (processed) => handle.progress({ rowsDone: done + processed, rowsTotal: grand, percent: grand ? (done + processed) * 100 / grand : 0 }) });
        done += totals[index];
        hits += result.ruleHits;
        config = { ...config, id: result.riskConfigId, version: result.riskConfigVersion };
      }
      const payload: RecalculateResult = { cycleId: cycle.id, riskConfigId: config.id, riskConfigVersion: config.version, itemsAssessed: done, ruleHits: hits, durationMs: Date.now() - startedAt };
      await recordAudit(db, { actorId: actor.id, action: "risk_config.recalculated", entityType: "risk_config", entityId: config.id, detail: `Aturan dan skor siklus ${cycle.name} dihitung ulang dengan konfigurasi versi ${config.version}: ${done} item.`, after: payload });
      return payload;
    }).then((payload) => handle.finish(payload)).catch((error: unknown) => {
      console.error("Hitung ulang gagal:", error);
      handle.fail("Hitung ulang gagal karena kesalahan di server. Tidak ada data yang berubah.");
    });
    return context.json({ jobId: handle.id } satisfies RecalculateAcceptedResponse, 202);
  });

  return routes;
}
