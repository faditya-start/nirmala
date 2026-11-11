/**
 * Mock Risk Triage (VITE_MOCK=1). Stateful: konfirmasi, dismiss, dan pembatalan keputusan mengubah data
 * dalam memori, sehingga daftar, ringkasan, dan halaman detail ikut berubah. Mengikuti DTO kontrak
 * (diperiksa compiler) dan peran (`?as=uki|leader|admin`). Semua data rekaan.
 */
import {
  confirmItemBodySchema,
  dismissItemBodySchema,
  triageDetailQuerySchema,
  triageListQuerySchema,
  toPagination,
  type AccountDto,
  type ChrNoteDto,
  type ChrRefDto,
  type ConfirmItemResponse,
  type DismissItemResponse,
  type NoteStatus,
  type RuleHitDto,
  type ScoreFactorDto,
  type TriageDecisionDto,
  type TriageFilter,
  type TriageItemDetailResponse,
  type TriageItemRow,
  type TriageListResponse,
  type TriageNavigationDto,
  type TriageSort
} from "@nirmala/shared";
import { ApiError } from "../../lib/api-error";
import { registerMock, respond } from "../../lib/mock";
import { readSession } from "../../lib/storage";
import {
  ACCOUNTS,
  CYCLE_FACTOR_WEIGHTS,
  DISMISS_REASONS,
  FACTOR_META,
  ORGS,
  RISK_THRESHOLDS,
  RULES,
  WORK_UNITS,
  buildSeeds,
  explanationFor,
  hierarchyFor,
  historyFor,
  peerFor,
  previousVersionFor,
  riskCategory,
  solveFactors,
  type MockSeed
} from "./mock-data";

type Role = "reviewer" | "uki" | "leader" | "admin";

function currentRole(): Role {
  const raw = readSession("nirmala.mock.user");
  try {
    const role = raw ? (JSON.parse(raw) as { role?: Role }).role : undefined;
    return role ?? "reviewer";
  } catch {
    return "reviewer";
  }
}

/** Reviewer dan PIC UKI hanya melihat Ditjen Contoh A; Pimpinan dan Admin melihat semuanya. */
function scopeOrgIds(): string[] {
  return currentRole() === "leader" || currentRole() === "admin" ? ORGS.map((org) => org.id) : ["oa"];
}

const canWrite = () => currentRole() === "reviewer" || currentRole() === "admin";

const seeds = buildSeeds();
const seedById = new Map(seeds.map((seed) => [seed.id, seed]));
const factorCache = new Map<string, ReturnType<typeof solveFactors>>();
function factorsOf(seed: MockSeed) {
  let cached = factorCache.get(seed.id);
  if (!cached) {
    cached = solveFactors(seed);
    factorCache.set(seed.id, cached);
  }
  return cached;
}

/** Urutan bawaan (kena aturan, skor menurun, total menurun, id) dihitung sekali; filter memakai urutan ini. */
const defaultOrder = [...seeds].sort((a, b) => {
  const flagA = a.ruleCodes.length > 0 ? 0 : 1;
  const flagB = b.ruleCodes.length > 0 ? 0 : 1;
  if (flagA !== flagB) return flagA - flagB;
  const scoreDiff = factorsOf(b).score - factorsOf(a).score;
  if (scoreDiff) return scoreDiff;
  const totalDiff = b.quantity * b.unitPrice - a.quantity * a.unitPrice;
  return totalDiff || a.id.localeCompare(b.id);
});

// ------------------------------------------------------------------ Keputusan (state)

interface DecisionRecord {
  decision: "confirm" | "dismiss";
  reasonCategory: string | null;
  note: string | null;
  decidedAt: number;
  inherited: boolean;
  chrNote: ChrNoteDto | null;
}

const decisions = new Map<string, DecisionRecord>();
const chrs = new Map<string, ChrRefDto>();
let noteCounter = 0;
const now = Date.now();

function ensureChr(orgId: string): ChrRefDto {
  let chr = chrs.get(orgId);
  if (!chr) {
    const org = ORGS.find((entry) => entry.id === orgId)!;
    chr = { id: `chr-${orgId}`, documentNumber: null, status: "draft", organizationUnitName: org.shortName };
    chrs.set(orgId, chr);
  }
  return chr;
}

function totalOf(seed: MockSeed): number {
  return seed.quantity * seed.unitPrice;
}

function workUnitOf(seed: MockSeed) {
  return WORK_UNITS.find((unit) => unit.id === seed.workUnitId)!;
}

function makeNote(seed: MockSeed, input: { category: ChrNoteDto["category"]; text: string; expectation: ChrNoteDto["expectation"]; status?: NoteStatus; ruleCode?: string | null }): ChrNoteDto {
  const unit = workUnitOf(seed);
  const chr = ensureChr(seed.orgId);
  noteCounter += 1;
  return {
    id: `note-${seed.id}`,
    chrDocumentId: chr.id,
    number: noteCounter,
    rkaItemId: seed.id,
    workUnitId: unit.id,
    workUnitCode: unit.code,
    workUnitName: unit.name,
    accountCode: seed.accountCode,
    title: seed.description,
    category: input.category,
    text: input.text,
    expectation: input.expectation,
    status: input.status ?? "draf",
    ruleId: input.ruleCode ? `rule-${input.ruleCode}` : null,
    ruleCode: input.ruleCode ?? null,
    justification: null,
    closedAt: null,
    latestCheckResult: null,
    createdByName: "Reviewer 01",
    createdAt: now - 86_400_000,
    updatedAt: now - 86_400_000
  };
}

function seedConfirm(seed: MockSeed, inherited = false) {
  const rule = RULES[seed.ruleCodes[0]];
  decisions.set(seed.id, {
    decision: "confirm",
    reasonCategory: null,
    note: null,
    decidedAt: now - 2 * 86_400_000,
    inherited,
    chrNote: makeNote(seed, { category: rule.category, text: rule.reason, expectation: rule.defaultExpectation ?? { type: "manual", instruction: "Tinjau ulang item ini." }, ruleCode: rule.code })
  });
}

function seedDismiss(seed: MockSeed, reason: string, inherited = false) {
  decisions.set(seed.id, { decision: "dismiss", reasonCategory: reason, note: null, decidedAt: now - 3 * 86_400_000, inherited, chrNote: null });
}

// Keputusan awal: 2 dari item contoh Pencil + 23 item lain di Ditjen Contoh A (83 dari 108 belum ditinjau), beberapa di B.
for (const seed of seeds) {
  if (seed.flaggedOrdinal === null) continue;
  if (seed.orgId === "oa" && seed.index === 3) seedConfirm(seed);
  else if (seed.orgId === "oa" && seed.index === 6) seedDismiss(seed, "akun_sudah_tepat");
  else if (seed.index > 10 && seed.flaggedOrdinal % 4 === 0 && seed.orgId === "oa" && seed.flaggedOrdinal >= 8 && decisions.size < 25) {
    const inherited = seed.changeType === "tetap" && seed.flaggedOrdinal % 12 === 0;
    if (seed.flaggedOrdinal % 8 === 0) seedConfirm(seed, inherited);
    else seedDismiss(seed, DISMISS_REASONS[seed.flaggedOrdinal % DISMISS_REASONS.length].code, inherited);
  } else if (seed.orgId === "ob" && seed.flaggedOrdinal % 5 === 0) seedDismiss(seed, "item_esensial");
}

// ------------------------------------------------------------------ Baris dan filter

function decisionOf(seed: MockSeed) {
  return decisions.get(seed.id);
}

function rowOf(seed: MockSeed): TriageItemRow {
  const unit = workUnitOf(seed);
  const factors = factorsOf(seed);
  const decision = decisionOf(seed);
  return {
    id: seed.id,
    documentId: `doc-${seed.orgId}`,
    organizationUnitId: seed.orgId,
    workUnitId: unit.id,
    workUnitCode: unit.code,
    workUnitName: unit.name,
    accountCode: seed.accountCode,
    description: seed.description,
    totalAmount: totalOf(seed),
    ruleCodes: [...seed.ruleCodes].sort(),
    score: factors.score,
    riskCategory: riskCategory(factors.score),
    changeType: seed.changeType,
    decision: decision?.decision ?? "belum_ditinjau",
    decisionInherited: decision?.inherited ?? false,
    noteId: decision?.chrNote?.id ?? null,
    noteStatus: decision?.chrNote?.status ?? null
  };
}

function checkScope(organizationUnitId: string | undefined): string[] {
  const scope = scopeOrgIds();
  if (organizationUnitId) {
    if (!scope.includes(organizationUnitId)) throw new ApiError(403, "Anda tidak memiliki akses ke eselon I ini.");
    return [organizationUnitId];
  }
  return scope;
}

function applyFilter(filter: Omit<TriageFilter, "cycleId"> & { cycleId?: string }, sort: TriageSort, dir: "asc" | "desc"): MockSeed[] {
  const orgIds = checkScope(filter.organizationUnitId);
  const needle = filter.q?.toLowerCase();
  let list = defaultOrder.filter((seed) => {
    if (!orgIds.includes(seed.orgId)) return false;
    if (filter.workUnitId && seed.workUnitId !== filter.workUnitId) return false;
    if (filter.onlyFlagged && seed.ruleCodes.length === 0) return false;
    if (filter.ruleCode && !seed.ruleCodes.includes(filter.ruleCode)) return false;
    if (filter.ruleCategory && !seed.ruleCodes.some((code) => RULES[code].category === filter.ruleCategory)) return false;
    if (filter.decision && (decisionOf(seed)?.decision ?? "belum_ditinjau") !== filter.decision) return false;
    if (needle && !seed.description.toLowerCase().includes(needle)) return false;
    return true;
  });
  if (sort !== "default") {
    const sign = dir === "asc" ? 1 : -1;
    const key = (seed: MockSeed) => (sort === "score" ? factorsOf(seed).score : sort === "total" ? totalOf(seed) : seed.description);
    list = [...list].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      const cmp = typeof ka === "string" ? ka.localeCompare(kb as string, "id") : (ka as number) - (kb as number);
      return cmp * sign || a.id.localeCompare(b.id);
    });
  }
  return list;
}

function scopeSummary(organizationUnitId: string | undefined, workUnitId: string | undefined): TriageListResponse["summary"] {
  const orgIds = checkScope(organizationUnitId);
  let analyzed = 0;
  let flagged = 0;
  let unreviewed = 0;
  for (const seed of seeds) {
    if (!orgIds.includes(seed.orgId) || (workUnitId && seed.workUnitId !== workUnitId)) continue;
    analyzed += 1;
    if (seed.ruleCodes.length > 0) {
      flagged += 1;
      if (!decisionOf(seed)) unreviewed += 1;
    }
  }
  return { analyzedItems: analyzed, flaggedItems: flagged, unreviewedFlaggedItems: unreviewed };
}

function parseOrThrow<T>(result: { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } }): T {
  if (result.success) return result.data;
  throw new ApiError(400, result.error.issues[0]?.message ?? "Permintaan tidak valid.");
}

// ------------------------------------------------------------------ Detail

function detailOf(seed: MockSeed, navigation: TriageNavigationDto | null): TriageItemDetailResponse {
  const org = ORGS.find((entry) => entry.id === seed.orgId)!;
  const unit = workUnitOf(seed);
  const factors = factorsOf(seed);
  const peer = peerFor(seed, factors.values[0]);
  const total = totalOf(seed);

  const scoreFactors: ScoreFactorDto[] = FACTOR_META.map((meta, index) => {
    const value = factors.values[index];
    const available = value !== null;
    return {
      code: meta.code,
      key: meta.key,
      label: meta.label,
      normalizedScore: value,
      weight: CYCLE_FACTOR_WEIGHTS[index],
      contribution: available ? (value * CYCLE_FACTOR_WEIGHTS[index]) / 100 : null,
      explanation: explanationFor(meta.code, seed, peer, available),
      dataAvailable: available
    };
  });

  const ruleHits: RuleHitDto[] = [...seed.ruleCodes].sort().map((code) => {
    const rule = RULES[code];
    return {
      ruleId: `rule-${code}`,
      code,
      name: rule.name,
      category: rule.category,
      reason: rule.reason,
      matchedTerms: code === "R01" ? ["kaos", "hut"] : code === "R02" ? ["kebersihan"] : code === "R03" ? ["internet"] : code === "R04" ? ["kop surat"] : code === "R05" ? ["rehabilitasi"] : [],
      source: rule.source,
      defaultExpectation: rule.defaultExpectation
    };
  });

  const record = decisionOf(seed);
  const reason = DISMISS_REASONS.find((entry) => entry.code === record?.reasonCategory);
  const decision: TriageDecisionDto | null = record
    ? {
        decision: record.decision,
        reasonCategory: record.reasonCategory,
        reasonLabel: reason?.label ?? null,
        note: record.note,
        reviewerName: "Reviewer 01",
        decidedAt: record.decidedAt,
        inherited: record.inherited,
        chrNote: record.chrNote
      }
    : null;

  const first = ruleHits[0];
  const revertible = record ? !record.inherited && (record.decision === "dismiss" || record.chrNote?.status === "draf") : true;

  return {
    item: {
      id: seed.id,
      documentId: `doc-${seed.orgId}`,
      cycleId: "c-alokasi",
      organizationUnitId: org.id,
      organizationUnitName: org.shortName,
      snapshotVersionNo: org.snapshotNo,
      snapshotLabel: org.snapshotLabel,
      workUnitId: unit.id,
      workUnitCode: unit.code,
      workUnitName: unit.name,
      accountCode: seed.accountCode,
      accountName: ACCOUNTS.find((account) => account.code === seed.accountCode)?.name ?? null,
      description: seed.description,
      quantity: seed.quantity,
      unit: seed.unit,
      unitPrice: seed.unitPrice,
      totalAmount: total,
      volumeDetail: seed.volumeFilled ? [{ index: 1, volume: seed.quantity, unit: seed.unit }] : [],
      blokirCode: seed.blokirCode,
      blokirAmount: seed.blokirCode ? Math.round(total * 0.4) : null,
      hierarchy: hierarchyFor(seed),
      changeType: seed.changeType
    },
    score: {
      value: factors.score,
      category: riskCategory(factors.score),
      thresholds: RISK_THRESHOLDS,
      configVersion: "v1",
      factors: scoreFactors,
      dataCompleteness: scoreFactors.every((factor) => factor.dataAvailable) ? "sufficient" : "partial"
    },
    ruleHits,
    peer,
    satkerHistory: { workUnitId: unit.id, workUnitName: unit.name, themes: historyFor(unit.id), hasProfile: unit.id !== "wa5" && unit.id !== "wb14" },
    previousVersion: previousVersionFor(seed),
    decision,
    confirmDefaults: first
      ? { category: first.category, text: first.reason, expectation: first.defaultExpectation, ruleCode: first.code }
      : { category: "LAINNYA", text: "", expectation: null, ruleCode: null },
    chr: chrs.get(seed.orgId) ?? null,
    canDecide: canWrite() && revertible && orgScopeOk(seed),
    navigation
  };
}

function orgScopeOk(seed: MockSeed): boolean {
  return scopeOrgIds().includes(seed.orgId);
}

function itemOrThrow(id: string): MockSeed {
  const seed = seedById.get(id);
  if (!seed) throw new ApiError(404, "Item tidak ditemukan.");
  if (!orgScopeOk(seed)) throw new ApiError(403, "Anda tidak memiliki akses ke eselon I ini.");
  return seed;
}

function requireWriter() {
  if (!canWrite()) throw new ApiError(403, "Hanya reviewer yang dapat memutuskan item.");
}

// ------------------------------------------------------------------ Handler

registerMock("GET", "/work-units", ({ query }) => {
  const scope = scopeOrgIds();
  const orgId = query.organizationUnitId;
  return { workUnits: WORK_UNITS.filter((unit) => scope.includes(unit.organizationUnitId) && (!orgId || unit.organizationUnitId === orgId)) };
});

registerMock("GET", "/references/dismiss-reasons", () => ({ reasons: DISMISS_REASONS }));

registerMock("GET", "/references/accounts", ({ query }) => {
  const q = (query.q ?? "").trim().toLowerCase();
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const accounts: AccountDto[] = ACCOUNTS.filter((account) => !q || account.code.startsWith(q) || account.name.toLowerCase().includes(q)).slice(0, limit);
  return { accounts };
});

registerMock("GET", "/triage/items", ({ query }) => {
  const parsed = parseOrThrow(triageListQuerySchema.safeParse(query));
  const list = applyFilter(parsed, parsed.sort, parsed.dir);
  const start = (parsed.page - 1) * parsed.pageSize;
  const items = list.slice(start, start + parsed.pageSize).map(rowOf);
  const orgIds = checkScope(parsed.organizationUnitId);
  const response: TriageListResponse = {
    items,
    pagination: toPagination(parsed.page, parsed.pageSize, list.length),
    snapshots: ORGS.filter((org) => orgIds.includes(org.id)).map((org) => ({
      id: `snap-${org.id}-${org.snapshotNo}`,
      organizationUnitId: org.id,
      organizationUnitName: org.shortName,
      versionNo: org.snapshotNo,
      label: org.snapshotLabel,
      itemCount: org.itemCount
    })),
    summary: scopeSummary(parsed.organizationUnitId, parsed.workUnitId)
  };
  return response;
});

registerMock("GET", "/triage/items/:id", ({ params, query }) => {
  const seed = itemOrThrow(params.id);
  const parsed = parseOrThrow(triageDetailQuerySchema.safeParse(query));
  const hasFilter = Object.keys(query).some((key) => key !== "cycleId");
  let navigation: TriageNavigationDto | null = null;
  if (hasFilter) {
    const list = applyFilter({ ...parsed }, parsed.sort, parsed.dir);
    const index = list.findIndex((entry) => entry.id === seed.id);
    if (index >= 0) navigation = { position: index + 1, total: list.length, previousItemId: list[index - 1]?.id ?? null, nextItemId: list[index + 1]?.id ?? null };
  }
  return detailOf(seed, navigation);
});

registerMock("POST", "/triage/items/:id/confirm", ({ params, body }) => {
  requireWriter();
  const seed = itemOrThrow(params.id);
  const input = parseOrThrow(confirmItemBodySchema.safeParse(body));
  if (decisionOf(seed)) throw new ApiError(409, "Item ini sudah ditinjau.");
  const chr = ensureChr(seed.orgId);
  const note = makeNote(seed, { ...input, ruleCode: [...seed.ruleCodes].sort()[0] ?? null });
  decisions.set(seed.id, { decision: "confirm", reasonCategory: null, note: null, decidedAt: Date.now(), inherited: false, chrNote: note });
  const detail = detailOf(seed, null);
  const response: ConfirmItemResponse = { decision: detail.decision!, note, chr };
  return respond(201, response);
});

registerMock("POST", "/triage/items/:id/dismiss", ({ params, body }) => {
  requireWriter();
  const seed = itemOrThrow(params.id);
  const input = parseOrThrow(dismissItemBodySchema.safeParse(body));
  if (!DISMISS_REASONS.some((reason) => reason.code === input.reasonCategory)) throw new ApiError(400, "Kategori alasan tidak dikenal.");
  if (decisionOf(seed)) throw new ApiError(409, "Item ini sudah ditinjau.");
  decisions.set(seed.id, { decision: "dismiss", reasonCategory: input.reasonCategory, note: input.note?.trim() || null, decidedAt: Date.now(), inherited: false, chrNote: null });
  const response: DismissItemResponse = { decision: detailOf(seed, null).decision! };
  return respond(201, response);
});

registerMock("DELETE", "/triage/items/:id/decision", ({ params }) => {
  requireWriter();
  const seed = itemOrThrow(params.id);
  const record = decisionOf(seed);
  if (!record) throw new ApiError(404, "Item ini belum punya keputusan.");
  if (record.inherited) throw new ApiError(409, "Keputusan diwarisi dari versi sebelumnya dan tidak bisa dicabut di sini.");
  if (record.chrNote && record.chrNote.status !== "draf") throw new ApiError(409, "Catatan sudah terbit; keputusan tidak bisa dicabut.");
  decisions.delete(seed.id);
  return respond(204);
});
