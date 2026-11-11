import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import type { RecalculateJobDto, RiskConfigResponse, RuleListResponse, RuleResponse, TriageItemDetailResponse } from "@nirmala/shared";
import { auditLogs, ruleHits } from "../src/db/schema.ts";
import { setupSeeded } from "./helpers.ts";

const weights = { price_vs_peer: 10, risky_account: 40, satker_history: 10, description_quality: 20, change_from_previous: 20 };

test("endpoint admin: 401 tanpa sesi, 403 untuk selain admin", async () => {
  const env = await setupSeeded();
  const calls: [string, string, unknown?][] = [
    ["GET", "/api/admin/rules"], ["PUT", "/api/admin/rules/rule_R01", { active: false }], ["PUT", "/api/admin/rules/rule_R01/active", { active: false }],
    ["GET", "/api/admin/risk-config"], ["POST", "/api/admin/risk-config", { weights, thresholds: { medium: 30, high: 60 } }],
    ["POST", "/api/admin/risk-config/recalculate", { cycleId: env.cycleId }]
  ];
  for (const [method, path, body] of calls) {
    assert.equal((await env.call(method, path, undefined, body)).status, 401, `${method} ${path}`);
    for (const role of ["reviewer", "uki", "leader"] as const) assert.equal((await env.call(method, path, env.sessions[role].cookie, body)).status, 403, `${role} ${method} ${path}`);
  }
  env.close();
});

test("katalog aturan: daftar dengan hitCount, edit memvalidasi parameter, sakelar, dan audit", async () => {
  const env = await setupSeeded();
  const admin = env.sessions.admin.cookie;
  const body = (await (await env.get("/api/admin/rules", admin)).json()) as RuleListResponse;
  assert.equal(body.cycle!.id, env.cycleId);
  assert.deepEqual([body.totalRules, body.activeRules], [8, 8]);
  const byCode = Object.fromEntries(body.rules.map((rule) => [rule.code, rule]));
  assert.deepEqual(body.rules.map((rule) => rule.code), ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08"]);
  assert.deepEqual([byCode.R02.hitCount, byCode.R06.hitCount, byCode.R08.hitCount], [3, 2, 0]);
  assert.deepEqual([byCode.R08.appliesToRevisionOnly, byCode.R01.appliesToRevisionOnly, byCode.R01.needsValidation, byCode.R02.needsValidation], [true, false, true, false]);
  assert.equal((await env.get("/api/admin/rules?cycleId=nope", admin)).status, 404);

  const put = (id: string, payload: unknown) => env.call("PUT", `/api/admin/rules/${id}`, admin, payload);
  const bad = await put("rule_R01", { params: { all: ["("] } });
  assert.equal(bad.status, 400);
  assert.equal(((await bad.json()) as { error: string }).error, "Pola tidak valid (bukan ekspresi reguler yang benar).");
  assert.equal((await put("rule_R01", { params: { include: "x" } })).status, 400, "parameter jenis lain ditolak");
  assert.equal((await put("rule_R01", {})).status, 400);
  assert.equal((await put("rule_R01", { name: "x" })).status, 400);
  assert.equal((await put("rule_tidak_ada", { active: false })).status, 404);

  const updated = (await (await put("rule_R02", { params: { include: "satpam|sopir", akunSalah: ["522191"], akunBenar: "521111" }, validationNote: null, reasonTemplate: "Alasan baru yang cukup panjang." })).json()) as RuleResponse;
  assert.equal(updated.rule.reasonTemplate, "Alasan baru yang cukup panjang.");
  assert.equal(updated.rule.needsValidation, false);
  assert.equal(updated.rule.kind, "keyword_wrong_account");
  const audit = (await env.database.db.select().from(auditLogs).where(eq(auditLogs.action, "rule.updated")))[0];
  assert.equal((audit.before as { reasonTemplate: string }).reasonTemplate.startsWith("Biaya tenaga"), true);
  assert.equal((audit.after as { reasonTemplate: string }).reasonTemplate, "Alasan baru yang cukup panjang.");
  // hit lama tidak berubah oleh edit (berlaku untuk impor/hitung ulang berikutnya)
  assert.equal(((await (await env.get("/api/admin/rules", admin)).json()) as RuleListResponse).rules.find((rule) => rule.code === "R02")!.hitCount, 3);

  const toggled = (await (await env.call("PUT", "/api/admin/rules/rule_R01/active", admin, { active: false })).json()) as RuleResponse;
  assert.equal(toggled.rule.active, false);
  assert.equal((await env.call("PUT", "/api/admin/rules/rule_R01/active", admin, { active: "ya" })).status, 400);
  assert.equal(((await (await env.get("/api/admin/rules", admin)).json()) as RuleListResponse).activeRules, 7);
  assert.equal((await env.database.db.select().from(auditLogs).where(eq(auditLogs.action, "rule.toggled"))).length, 1);
  // A13: hit lama tetap sampai hitung ulang
  assert.equal((await env.database.db.select().from(ruleHits).where(eq(ruleHits.ruleId, "rule_R01"))).length, 2);
  env.close();
});

test("bobot skor: validasi, versi baru hanya insert, tidak otomatis hitung ulang, hitung ulang sebagai job", async () => {
  const env = await setupSeeded();
  const admin = env.sessions.admin.cookie;
  const config = (await (await env.get("/api/admin/risk-config", admin)).json()) as RiskConfigResponse;
  assert.deepEqual([config.active.version, config.versions.length, config.factors.map((factor) => factor.key)], ["1", 1, ["F1", "F2", "F3", "F4", "F5"]]);
  assert.equal(config.active.createdByName, "Ayu Admin");

  const post = (payload: unknown) => env.call("POST", "/api/admin/risk-config", admin, payload);
  const sum = await post({ weights: { ...weights, risky_account: 41 }, thresholds: { medium: 30, high: 60 } });
  assert.equal(sum.status, 400);
  assert.equal(((await sum.json()) as { error: string }).error, "Jumlah bobot faktor harus 100%.");
  assert.equal((await post({ weights, thresholds: { medium: 60, high: 60 } })).status, 400);
  assert.equal((await post({ weights: { ...weights, risky_account: 40.5 }, thresholds: { medium: 30, high: 60 } })).status, 400);
  assert.equal((await env.get("/api/admin/risk-config", admin).then((r) => r.json()) as RiskConfigResponse).versions.length, 1);

  const created = await post({ weights, thresholds: { medium: 30, high: 60 } });
  assert.equal(created.status, 201);
  const { config: v2 } = (await created.json()) as { config: RiskConfigResponse["active"] };
  assert.deepEqual([v2.version, v2.active, v2.params.peerMinSatker], ["2", true, 5]);
  const after = (await (await env.get("/api/admin/risk-config", admin)).json()) as RiskConfigResponse;
  assert.deepEqual([after.active.version, after.versions.map((version) => version.version), after.versions.map((version) => version.active)], ["2", ["2", "1"], [true, false]]);
  assert.equal(after.versions[1].weights.price_vs_peer, 30, "versi lama tidak berubah");

  // Belum dihitung ulang: tampilan tetap memakai skor versi 1.
  const item = (await env.findItem(admin, "Pengadaan kaos seragam peringatan HUT Kemerdekaan 17 Agustus", "900101"));
  const detailOf = async () => (await (await env.get(`/api/triage/items/${item.id}`, admin)).json()) as TriageItemDetailResponse;
  const before = await detailOf();
  assert.equal(before.score!.configVersion, "1");
  assert.equal((await env.list(admin)).summary.analyzedItems > 0, true);

  assert.equal((await env.call("POST", "/api/admin/risk-config/recalculate", admin, { cycleId: "nope" })).status, 404);
  assert.equal((await env.call("POST", "/api/admin/risk-config/recalculate", admin, {})).status, 400);
  const accepted = await env.call("POST", "/api/admin/risk-config/recalculate", admin, { cycleId: env.cycleId });
  assert.equal(accepted.status, 202);
  const { jobId } = (await accepted.json()) as { jobId: string };
  let job: RecalculateJobDto | undefined;
  for (let i = 0; i < 200 && job?.status !== "selesai" && job?.status !== "gagal"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    job = (await (await env.get(`/api/jobs/${jobId}`, admin)).json()) as RecalculateJobDto;
  }
  assert.equal(job!.status, "selesai");
  assert.deepEqual(job!.steps.map((step) => step.key), ["aturan", "skor"]);
  assert.equal(job!.result!.riskConfigVersion, "2");
  assert.equal(job!.result!.itemsAssessed, (await env.list(admin)).pagination.total);
  assert.equal(job!.result!.ruleHits, 13);
  env.close();
});

test("hitung ulang: aturan nonaktif hilang dari hit, skor memakai versi baru, keputusan reviewer tidak tersentuh", async () => {
  const env = await setupSeeded();
  const admin = env.sessions.admin.cookie;
  const item = await env.findItem(admin, "Pengadaan kaos seragam peringatan HUT Kemerdekaan 17 Agustus", "900101");
  await env.call("POST", `/api/triage/items/${item.id}/dismiss`, admin, { reasonCategory: "lainnya" });
  await env.call("PUT", "/api/admin/rules/rule_R01/active", admin, { active: false });
  await env.call("POST", "/api/admin/risk-config", admin, { weights, thresholds: { medium: 30, high: 60 } });
  const { jobId } = (await (await env.call("POST", "/api/admin/risk-config/recalculate", admin, { cycleId: env.cycleId })).json()) as { jobId: string };
  for (let i = 0; i < 200; i++) {
    const job = (await (await env.get(`/api/jobs/${jobId}`, admin)).json()) as RecalculateJobDto;
    if (job.status === "gagal") assert.fail(job.error ?? "gagal");
    if (job.status === "selesai") break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal((await env.database.db.select().from(ruleHits).where(eq(ruleHits.ruleId, "rule_R01"))).length, 0);
  const detail = (await (await env.get(`/api/triage/items/${item.id}`, admin)).json()) as TriageItemDetailResponse;
  assert.equal(detail.score!.configVersion, "2");
  assert.deepEqual(detail.score!.factors.map((factor) => factor.weight), [10, 40, 10, 20, 20]);
  assert.deepEqual(detail.ruleHits, []);
  assert.equal(detail.decision!.decision, "dismiss");
  assert.equal((await env.list(admin)).summary.flaggedItems, 11);
  assert.equal((await env.database.db.select().from(auditLogs).where(eq(auditLogs.action, "risk_config.recalculated"))).length, 1);
  env.close();
});
