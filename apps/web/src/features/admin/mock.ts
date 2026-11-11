/**
 * Stateful mock for S12 (Katalog aturan, Bobot skor, Pengguna, Siklus, Audit log). Synthetic data only.
 * Mutations change the in-memory store and append audit rows, so flows can be tried end to end.
 * Request validation reuses the shared zod schemas, so 400 messages match the real API contract.
 */
import {
  createCycleBodySchema,
  createRiskConfigBodySchema,
  createUserBodySchema,
  markDipaIssuedBodySchema,
  parseRuleParams,
  recalculateBodySchema,
  setUserActiveBodySchema,
  setUserScopesBodySchema,
  toggleRuleBodySchema,
  updateCycleBodySchema,
  updateRuleBodySchema,
  updateUserBodySchema,
  ROLES,
  type AuditLogEntryDto,
  type FactorMetaDto,
  type OrganizationUnitDto,
  type RecalculateJobDto,
  type ReviewCycleDto,
  type RiskConfigDto,
  type RuleAdminDto,
  type UserAdminDto
} from "@nirmala/shared";
import { ApiError } from "../../lib/api-error";
import { MOCK_ORG_UNITS, currentMockRole, mockCycles, registerMockJob } from "../../lib/mock-defaults";
import { registerMock, respond } from "../../lib/mock";
import { readSession } from "../../lib/storage";

/* ---------------------------------------------------------------- helpers */

const currentRole = currentMockRole;

function requireAdmin(): void {
  if (currentRole() !== "admin") throw new ApiError(403, "Peran Anda tidak memiliki akses ke sumber daya ini.");
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Permintaan tidak valid.";
}

const at = (year: number, month: number, day: number, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute).getTime();
let sequence = 100;
const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;
const SELF = { id: "u6", name: "Admin 01" };

/* ---------------------------------------------------------------- audit */

const audit: AuditLogEntryDto[] = [];

function record(action: string, entityType: string, entityId: string, detail: string, before: unknown = null, after: unknown = null, actor: { id: string | null; name: string } = SELF, createdAt = Date.now()): void {
  audit.push({ id: nextId("al"), action, entityType, entityId, detail, before, after, createdAt, actor: actor.name, actorUserId: actor.id });
}

const R1 = { id: "u1", name: "Reviewer 01" };
const R2 = { id: "u2", name: "Reviewer 02" };
const SYSTEM = { id: null, name: "Sistem" };
record("cycle.created", "review_cycle", "c-alokasi", "TA 2026 · Alokasi anggaran · tenggat 12 Nov 2026", null, null, SELF, at(2026, 11, 2, 16, 0));
record("user.created", "user", "u1", "6 pengguna dibuat", null, null, SELF, at(2026, 11, 3, 8, 30));
record("snapshot.imported", "rka_document", "s1", "es1_90001_2026.csv · v1 Awal · 12.480 item", null, null, R1, at(2026, 11, 3, 9, 12));
record("item.confirmed", "rka_item", "i1", "3 item dikonfirmasi ke CHR draf", null, null, R1, at(2026, 11, 4, 8, 50));
record("chr.issued", "chr_document", "chr1", "014/CHR/2026 · Ditjen Contoh A · 3 catatan", null, null, R1, at(2026, 11, 4, 9, 5));
record("snapshot.imported", "rka_document", "s2", "es1_90002_2026.csv · v1 Awal · 8.915 item", null, null, R2, at(2026, 11, 4, 10, 30));
record("snapshot.imported", "rka_document", "s3", "es1_90001_2026.csv · v2 Revisi · 12.702 item", null, null, R1, at(2026, 11, 8, 16, 40));
record("note.checked", "chr_note", "n1", "3 catatan dicek terhadap snapshot v2: 2 terpenuhi, 1 belum", null, null, SYSTEM, at(2026, 11, 8, 16, 41));
record("note.approved", "chr_note", "n2", "Pakaian seragam hari besar · Perlu Verifikasi → Closed", "perlu_verifikasi", "closed", R1, at(2026, 11, 9, 10, 22));
record("note.approved", "chr_note", "n3", "Rehabilitasi madrasah desa · Perlu Verifikasi → Closed", "perlu_verifikasi", "closed", R1, at(2026, 11, 9, 10, 22));

// `?audit=many` adds older rows so pagination can be tried.
if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("audit") === "many") {
  const actions: Array<[string, string, string]> = [
    ["item.dismissed", "rka_item", "1 item di-dismiss: Akun sudah tepat"],
    ["item.confirmed", "rka_item", "2 item dikonfirmasi ke CHR draf"],
    ["chr.note_created", "chr_note", "Catatan manual ditambahkan ke CHR draf"],
    ["auth.login", "user", "Masuk ke NIRMALA"]
  ];
  for (let index = 0; index < 52; index += 1) {
    const [action, entity, detail] = actions[index % actions.length];
    record(action, entity, `x${index}`, detail, null, null, index % 3 === 0 ? R2 : R1, at(2026, 10, 1 + (index % 28), 8 + (index % 9), (index * 7) % 60));
  }
}

/* ---------------------------------------------------------------- organization units */

const UNITS: OrganizationUnitDto[] = MOCK_ORG_UNITS;

/* ---------------------------------------------------------------- cycles */

const cycles = mockCycles;
const STAGE_NAME = { pagu: "Pagu", alokasi: "Alokasi" } as const;
const SNAPSHOT_CYCLES = new Set(mockCycles.map((cycle) => cycle.id));

function findCycle(id: string): ReviewCycleDto {
  const cycle = cycles.find((item) => item.id === id);
  if (!cycle) throw new ApiError(404, "Siklus tidak ditemukan.");
  return cycle;
}

registerMock("POST", "/cycles", ({ body }) => {
  requireAdmin();
  const parsed = createCycleBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  const { fiscalYear, stage, name, adkDeadline } = parsed.data;
  if (cycles.some((cycle) => cycle.fiscalYear === fiscalYear && cycle.stage === stage)) {
    throw new ApiError(409, `Siklus TA ${fiscalYear} tahap ${STAGE_NAME[stage]} sudah ada.`);
  }
  const cycle: ReviewCycleDto = {
    id: nextId("c"), fiscalYear, stage, name: name ?? `TA ${fiscalYear} · ${STAGE_NAME[stage]}`, adkDeadline: adkDeadline ?? null, dipaIssuedAt: null, status: "aktif"
  };
  cycles.push(cycle);
  record("cycle.created", "review_cycle", cycle.id, `${cycle.name} · tenggat ${adkDeadline ? new Date(adkDeadline).toLocaleDateString("id-ID") : "belum diisi"}`);
  return respond(201, { cycle });
});

registerMock("PUT", "/cycles/:id", ({ params, body }) => {
  requireAdmin();
  const cycle = findCycle(params.id);
  const parsed = updateCycleBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  if (parsed.data.dipaIssuedAt) throw new ApiError(400, 'Gunakan "Tandai DIPA terbit" agar agregat publik ikut dibuat.');
  const { name, adkDeadline, status } = parsed.data;
  if (name !== undefined) cycle.name = name;
  if (adkDeadline !== undefined) cycle.adkDeadline = adkDeadline;
  if (status !== undefined) cycle.status = status;
  record("cycle.updated", "review_cycle", cycle.id, `${cycle.name} diubah`);
  return { cycle: { ...cycle } };
});

registerMock("DELETE", "/cycles/:id", ({ params }) => {
  requireAdmin();
  const cycle = findCycle(params.id);
  if (SNAPSHOT_CYCLES.has(cycle.id)) throw new ApiError(409, "Siklus ini sudah punya snapshot dan tidak bisa dihapus.");
  cycles.splice(cycles.indexOf(cycle), 1);
  record("cycle.deleted", "review_cycle", cycle.id, `${cycle.name} dihapus`);
  return respond(204);
});

registerMock("POST", "/cycles/:id/dipa-issued", ({ params, body }) => {
  requireAdmin();
  const cycle = findCycle(params.id);
  const parsed = markDipaIssuedBodySchema.safeParse(body ?? {});
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  if (cycle.dipaIssuedAt) throw new ApiError(409, "DIPA siklus ini sudah ditandai terbit.");
  cycle.dipaIssuedAt = parsed.data.issuedAt ?? Date.now();
  record("cycle.dipa_issued", "review_cycle", cycle.id, `${cycle.name} · DIPA terbit`);
  record("public_metrics.generated", "public_metrics", cycle.id, `Agregat publik ${cycle.name} dibuat`);
  return { cycle: { ...cycle }, publicMetricRows: 12 };
});

registerMock("DELETE", "/cycles/:id/dipa-issued", ({ params }) => {
  requireAdmin();
  const cycle = findCycle(params.id);
  if (!cycle.dipaIssuedAt) throw new ApiError(409, "DIPA siklus ini belum ditandai terbit.");
  cycle.dipaIssuedAt = null;
  record("cycle.dipa_retracted", "review_cycle", cycle.id, `${cycle.name} · penandaan DIPA ditarik`);
  return { cycle: { ...cycle } };
});

/* ---------------------------------------------------------------- rules */

const rules: RuleAdminDto[] = [
  { code: "R01", name: "Pakaian / seragam hari besar", category: "EFISIENSI", kind: "keyword", params: { all: ["pakaian|seragam|atribut"], akunPrefix: "521" }, reasonTemplate: "Belanja pakaian atau seragam untuk peringatan hari besar perlu dibandingkan dengan kebutuhan kegiatan dan ketentuan yang berlaku.", source: "Catatan reviu TA 2025", defaultExpectation: { type: "turunkan_nilai", maxTotal: 25000000 }, active: true, validYear: 2026, validationNote: "Pola perlu diuji ulang pada data revisi.", hit: 9 },
  { code: "R02", name: "Outsourcing di luar akun 521111", category: "AKUN", kind: "keyword_wrong_account", params: { include: "satpam|pengamanan|pengemudi|sopir|kebersihan|cleaning|pramubakti|outsourc", akunSalah: ["522191", "521119", "521213"], akunBenar: "521111" }, reasonTemplate: "Biaya tenaga outsourcing (satpam, pengemudi, kebersihan) menggunakan akun 521111 sesuai ketentuan kodefikasi segmen akun pada BAS.", source: "Ketentuan kodefikasi akun (sintetis)", defaultExpectation: { type: "ganti_akun", to: "521111" }, active: true, validYear: 2026, validationNote: null, hit: 14 },
  { code: "R03", name: "Internet di luar akun 521111", category: "AKUN", kind: "keyword_wrong_account", params: { include: "internet|langganan data|bandwidth", akunSalah: ["522111", "522119"], akunBenar: "521111" }, reasonTemplate: "Belanja langganan internet dicatat pada akun yang sesuai dengan sifat belanjanya, yaitu akun 521111.", source: "Ketentuan kodefikasi akun (sintetis)", defaultExpectation: { type: "ganti_akun", to: "521111" }, active: true, validYear: 2026, validationNote: "Menunggu validasi auditor.", hit: 22 },
  { code: "R04", name: "Kop surat, amplop, map di akun 521111", category: "AKUN", kind: "keyword_wrong_account", params: { include: "kop surat|amplop|map ", akunSalah: ["521111"], akunBenar: "521811" }, reasonTemplate: "Belanja barang habis pakai untuk keperluan perkantoran dicatat pada akun belanja barang operasional yang sesuai.", source: "Ketentuan kodefikasi akun (sintetis)", defaultExpectation: { type: "ganti_akun", to: "521811" }, active: true, validYear: 2026, validationNote: null, hit: 3 },
  { code: "R05", name: "Sarana masyarakat di belanja modal", category: "AKUN", kind: "keyword_wrong_account", params: { include: "sarana masyarakat|gapura|taman desa", akunSalah: ["53"], akunBenar: "521115" }, reasonTemplate: "Sarana yang diserahkan kepada masyarakat tidak menambah aset pemerintah sehingga dicatat sebagai belanja barang.", source: "Catatan reviu TA 2025", defaultExpectation: { type: "ganti_akun", to: "521115" }, active: true, validYear: 2026, validationNote: "Menunggu validasi auditor.", hit: 7 },
  { code: "R06", name: "Barang modal di belanja barang", category: "AKUN", kind: "keyword_wrong_account", params: { include: "laptop|komputer|printer|lemari|meja kerja", akunSalah: ["52"], akunBenar: "532111", minUnitPrice: 1000000 }, reasonTemplate: "Barang yang memenuhi batas kapitalisasi dicatat sebagai belanja modal pada akun 532111.", source: "Ketentuan kapitalisasi (sintetis)", defaultExpectation: { type: "ganti_akun", to: "532111" }, active: true, validYear: 2026, validationNote: "Batas kapitalisasi perlu dikonfirmasi.", hit: 41 },
  { code: "R07", name: "Nilai tanpa volume", category: "EFISIENSI", kind: "value_check", params: { condition: "volume_zero_total_positive" }, reasonTemplate: "Item bernilai tetapi volumenya nol, sehingga perlu dirinci atau dikoreksi sebelum diajukan.", source: "Catatan reviu TA 2025", defaultExpectation: { type: "rinci_item" }, active: true, validYear: 2026, validationNote: null, hit: 6 },
  { code: "R08", name: "Item pernah diblokir", category: "SATUAN_BIAYA", kind: "blokir_history", params: { onlyRevision: true }, reasonTemplate: "Item pernah diblokir pada tahap sebelumnya dan muncul kembali tanpa perubahan yang menjelaskan alasannya.", source: "Catatan reviu TA 2025", defaultExpectation: null, active: true, validYear: 2026, validationNote: "Menunggu validasi auditor.", hit: 15 }
].map((rule, index) => {
  const { hit, ...rest } = rule;
  return { ...rest, id: `rule-${index + 1}`, needsValidation: rest.validationNote !== null, appliesToRevisionOnly: rest.kind === "blokir_history", hitCount: hit, updatedAt: at(2026, 11, 2, 14) } as RuleAdminDto;
});

function findRule(id: string): RuleAdminDto {
  const rule = rules.find((item) => item.id === id);
  if (!rule) throw new ApiError(404, "Aturan tidak ditemukan.");
  return rule;
}

function refreshRule(rule: RuleAdminDto): void {
  rule.needsValidation = rule.validationNote !== null && rule.validationNote !== "";
  rule.appliesToRevisionOnly = rule.params.onlyRevision === true;
  rule.updatedAt = Date.now();
}

registerMock("GET", "/admin/rules", () => {
  requireAdmin();
  return { cycle: { ...cycles[0] }, rules: rules.map((rule) => ({ ...rule })), totalRules: rules.length, activeRules: rules.filter((rule) => rule.active).length };
});

registerMock("PUT", "/admin/rules/:id", ({ params, body }) => {
  requireAdmin();
  const rule = findRule(params.id);
  const parsed = updateRuleBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  if (parsed.data.params) {
    const check = parseRuleParams(rule.kind, parsed.data.params);
    if (!check.ok) throw new ApiError(400, check.error);
  }
  const before = { name: rule.name, active: rule.active };
  Object.assign(rule, parsed.data);
  refreshRule(rule);
  record("rule.updated", "rule", rule.id, `${rule.code} · ${rule.name} diubah`, before, { name: rule.name, active: rule.active });
  return { rule: { ...rule } };
});

registerMock("PUT", "/admin/rules/:id/active", ({ params, body }) => {
  requireAdmin();
  const rule = findRule(params.id);
  const parsed = toggleRuleBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  const before = rule.active;
  rule.active = parsed.data.active;
  refreshRule(rule);
  record("rule.toggled", "rule", rule.id, `${rule.code} · ${rule.active ? "diaktifkan" : "dinonaktifkan"}`, before, rule.active);
  return { rule: { ...rule } };
});

/* ---------------------------------------------------------------- risk config */

const FACTORS: FactorMetaDto[] = [
  { code: "price_vs_peer", key: "F1", label: "Harga vs Satker lain", description: "Rasio harga satuan terhadap median Satker lain" },
  { code: "risky_account", key: "F2", label: "Akun rawan", description: "Skor tetap per akun dari daftar konfigurasi" },
  { code: "satker_history", key: "F3", label: "Riwayat temuan BPK Satker", description: "Jumlah rekomendasi BPK bertema penganggaran" },
  { code: "description_quality", key: "F4", label: "Kualitas uraian", description: "Uraian pendek, paket tanpa rincian, atau tanpa volume" },
  { code: "change_from_previous", key: "F5", label: "Perubahan dari versi sebelumnya", description: "Item baru atau nilai naik lebih dari 20%" }
];

const configs: RiskConfigDto[] = [
  {
    id: "rc-1", version: "1", weights: { price_vs_peer: 30, risky_account: 20, satker_history: 20, description_quality: 15, change_from_previous: 15 },
    thresholds: { medium: 35, high: 70 }, params: { riskyAccounts: { "521111": 40, "522191": 70 }, packageThreshold: 50000000, peerMinSatker: 3 }, createdByName: "Admin 01", createdAt: at(2026, 11, 3, 8, 45), active: true
  }
];

registerMock("GET", "/admin/risk-config", () => {
  requireAdmin();
  const list = [...configs].reverse();
  return { active: list[0], versions: list, factors: FACTORS };
});

registerMock("POST", "/admin/risk-config", ({ body }) => {
  requireAdmin();
  const parsed = createRiskConfigBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  const latest = configs[configs.length - 1];
  latest.active = false;
  const config: RiskConfigDto = {
    id: nextId("rc"), version: String(Number(latest.version) + 1), weights: parsed.data.weights, thresholds: parsed.data.thresholds,
    params: parsed.data.params ?? latest.params, createdByName: SELF.name, createdAt: Date.now(), active: true
  };
  configs.push(config);
  record("risk_config.created", "risk_config", config.id, `Bobot skor versi ${config.version} dibuat`);
  return respond(201, { config });
});

/* Recalculate runs for ~4 s; polling `GET /jobs/:id` reads progress from the clock. */
const JOB_MS = 4000;
const jobs = new Map<string, { id: string; cycleId: string; startedAt: number; version: string }>();

registerMock("POST", "/admin/risk-config/recalculate", ({ body }) => {
  requireAdmin();
  const parsed = recalculateBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  findCycle(parsed.data.cycleId);
  for (const job of jobs.values()) {
    if (job.cycleId === parsed.data.cycleId && Date.now() - job.startedAt < JOB_MS) throw new ApiError(409, "Hitung ulang siklus ini sedang berjalan.");
  }
  const job = { id: nextId("job"), cycleId: parsed.data.cycleId, startedAt: Date.now(), version: configs[configs.length - 1].version };
  jobs.set(job.id, job);
  registerMockJob(job.id, (now) => jobDto(job, now));
  record("risk_config.recalculated", "risk_config", job.id, `Hitung ulang ${findCycle(job.cycleId).name} dengan bobot versi ${job.version}`);
  return respond(202, { jobId: job.id });
});

function jobDto(job: { id: string; cycleId: string; startedAt: number; version: string }, now: number): RecalculateJobDto {
  const elapsed = now - job.startedAt;
  const done = elapsed >= JOB_MS;
  const percent = done ? 100 : Math.floor((elapsed / JOB_MS) * 100);
  const total = 12702;
  return {
    id: job.id, kind: "recalculate", status: done ? "selesai" : "berjalan",
    steps: [
      { key: "aturan", status: percent >= 50 ? "selesai" : "berjalan" },
      { key: "skor", status: done ? "selesai" : percent >= 50 ? "berjalan" : "menunggu" }
    ],
    rowsDone: Math.floor((total * percent) / 100), rowsTotal: total, percent, startedAt: job.startedAt, finishedAt: done ? job.startedAt + JOB_MS : null, error: null,
    result: done ? { cycleId: job.cycleId, riskConfigId: configs[configs.length - 1].id, riskConfigVersion: job.version, itemsAssessed: total, ruleHits: 117, durationMs: JOB_MS } : null
  };
}

/* ---------------------------------------------------------------- users */

const users: UserAdminDto[] = [];

function seedUser(id: string, username: string, displayName: string, role: UserAdminDto["role"], unitIds: string[], unitLabel: string | null): void {
  users.push({ id, username, displayName, role, active: true, unitLabel, organizationUnitIds: unitIds, organizationUnits: [], allOrganizations: role === "leader" || role === "admin", createdAt: at(2026, 11, 3, 8, 30) });
}
seedUser("u1", "reviewer01", "Reviewer 01", "reviewer", ["o-ditjen-a"], "Itjen");
seedUser("u2", "reviewer02", "Reviewer 02", "reviewer", ["o-ditjen-b"], "Itjen");
seedUser("u3", "uki01", "PIC UKI 01", "uki", ["o-ditjen-a"], null);
seedUser("u4", "uki02", "PIC UKI 02", "uki", ["o-ditjen-b"], null);
seedUser("u5", "pimpinan01", "Pimpinan 01", "leader", [], "Itjen");
seedUser("u6", "admin01", "Admin 01", "admin", [], "Itjen");

function view(user: UserAdminDto): UserAdminDto {
  const all = user.role === "leader" || user.role === "admin";
  return { ...user, allOrganizations: all, organizationUnits: UNITS.filter((unit) => user.organizationUnitIds.includes(unit.id)) };
}

function findUser(id: string): UserAdminDto {
  const user = users.find((item) => item.id === id);
  if (!user) throw new ApiError(404, "Pengguna tidak ditemukan.");
  return user;
}

function checkUnits(ids: string[]): void {
  if (ids.some((id) => !UNITS.some((unit) => unit.id === id))) throw new ApiError(400, "Eselon I tidak ditemukan.");
}

registerMock("GET", "/users", () => {
  requireAdmin();
  return { users: users.map(view) };
});

registerMock("POST", "/users", ({ body }) => {
  requireAdmin();
  const parsed = createUserBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  const data = parsed.data;
  if (users.some((user) => user.username.toLowerCase() === data.username.toLowerCase())) throw new ApiError(409, "Username sudah dipakai.");
  checkUnits(data.organizationUnitIds);
  const user: UserAdminDto = {
    id: nextId("u"), username: data.username, displayName: data.displayName, role: data.role, active: true, unitLabel: data.unitLabel ?? null,
    organizationUnitIds: data.organizationUnitIds, organizationUnits: [], allOrganizations: false, createdAt: Date.now()
  };
  users.push(user);
  record("user.created", "user", user.id, `Pengguna ${user.username} dibuat`);
  return respond(201, { id: user.id });
});

registerMock("PUT", "/users/:id", ({ params, body }) => {
  requireAdmin();
  const user = findUser(params.id);
  const parsed = updateUserBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  user.displayName = parsed.data.displayName;
  if (parsed.data.unitLabel !== undefined) user.unitLabel = parsed.data.unitLabel;
  record("user.updated", "user", user.id, `Pengguna ${user.username} diubah`);
  return { id: user.id, displayName: user.displayName };
});

registerMock("PUT", "/users/:id/role", ({ params, body }) => {
  requireAdmin();
  const user = findUser(params.id);
  const role = (body as { role?: string } | undefined)?.role;
  if (!role || !(ROLES as readonly string[]).includes(role)) throw new ApiError(400, "Peran tidak valid.");
  if (user.id === SELF.id && role !== "admin") throw new ApiError(409, "Anda tidak dapat menurunkan peran akun sendiri.");
  const before = user.role;
  user.role = role as UserAdminDto["role"];
  record("user.role_changed", "user", user.id, `${user.username}: ${before} → ${role}`, before, role);
  return { id: user.id, role: user.role };
});

registerMock("PUT", "/users/:id/scopes", ({ params, body }) => {
  requireAdmin();
  const user = findUser(params.id);
  const parsed = setUserScopesBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  checkUnits(parsed.data.organizationUnitIds);
  const before = user.organizationUnitIds;
  user.organizationUnitIds = parsed.data.organizationUnitIds;
  record("user.scopes_changed", "user", user.id, `Akses eselon I ${user.username} diubah`, before, user.organizationUnitIds);
  return { user: view(user) };
});

registerMock("PUT", "/users/:id/active", ({ params, body }) => {
  requireAdmin();
  const user = findUser(params.id);
  const parsed = setUserActiveBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  if (user.id === SELF.id && !parsed.data.active) throw new ApiError(409, "Anda tidak dapat menonaktifkan akun sendiri.");
  user.active = parsed.data.active;
  record(user.active ? "user.activated" : "user.deactivated", "user", user.id, `${user.username} ${user.active ? "diaktifkan" : "dinonaktifkan"}`);
  return { user: view(user) };
});

/* ---------------------------------------------------------------- audit log */

registerMock("GET", "/audit-logs", ({ query }) => {
  requireAdmin();
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const rows = audit
    .filter((entry) => (!query.action || entry.action === query.action) && (!query.entityType || entry.entityType === query.entityType) && (!query.actorUserId || entry.actorUserId === query.actorUserId))
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  return { logs: rows.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) } };
});

registerMock("GET", "/audit-logs/facets", () => {
  requireAdmin();
  const actors = new Map<string, string>();
  for (const entry of audit) if (entry.actorUserId) actors.set(entry.actorUserId, entry.actor);
  return {
    actions: [...new Set(audit.map((entry) => entry.action))].sort(),
    entityTypes: [...new Set(audit.map((entry) => entry.entityType))].sort(),
    actors: [...actors].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  };
});
