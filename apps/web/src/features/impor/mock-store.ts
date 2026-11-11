/**
 * In-memory state shared by the impor and dashboard mocks (VITE_MOCK=1 only). All data is synthetic:
 * fictional Ditjen and Satker, invented item descriptions.
 */
import type {
  DiffSummary,
  ImportJobDto,
  ImportOverviewRow,
  ImportRecheckedNote,
  ImportResultDto,
  ImportRowError,
  ImportRuleHitCount,
  OrganizationUnitDto,
  ReviewCycleDto,
  Role,
  SnapshotDto
} from "@nirmala/shared";
import { request } from "../../lib/api";

export const ORGS: Array<OrganizationUnitDto & { satkerCount: number }> = [
  { id: "org-a", code: "90001", shortName: "Ditjen Contoh A", name: "Direktorat Jenderal Contoh A", satkerCount: 6 },
  { id: "org-b", code: "90002", shortName: "Ditjen Contoh B", name: "Direktorat Jenderal Contoh B", satkerCount: 5 },
  { id: "org-c", code: "90003", shortName: "Ditjen Contoh C", name: "Direktorat Jenderal Contoh C", satkerCount: 4 }
];

export const ACTIVE_CYCLE_ID = "c-alokasi";

/** Eselon I the signed-in role can see in S3 (reviewer sees all three, as designed) and on the dashboard. */
export function importScope(role: Role): string[] {
  return role === "uki" ? ["org-a"] : ORGS.map((org) => org.id);
}
export function dashboardScope(role: Role): string[] {
  return role === "reviewer" || role === "uki" ? ["org-a"] : ORGS.map((org) => org.id);
}

export async function currentRole(): Promise<Role> {
  const { user } = await request<{ user: { role: Role } | null }>("GET", "/auth/me");
  return user?.role ?? "reviewer";
}

export async function getCycles(): Promise<ReviewCycleDto[]> {
  return (await request<{ cycles: ReviewCycleDto[] }>("GET", "/cycles")).cycles;
}

export interface StoredSnapshot {
  dto: SnapshotDto;
  hash: string | null;
  rowErrors: ImportRowError[];
  diff: DiffSummary | null;
  ruleHits: ImportRuleHitCount[];
  rechecked: ImportRecheckedNote[];
}

export const RULES: Array<{ code: string; name: string; weight: number }> = [
  { code: "R01", name: "Pakaian / seragam hari besar", weight: 9 },
  { code: "R02", name: "Outsourcing di luar akun 521111", weight: 14 },
  { code: "R03", name: "Internet di luar akun 521111", weight: 22 },
  { code: "R04", name: "Kop surat, amplop, map di akun 521111", weight: 3 },
  { code: "R05", name: "Sarana masyarakat di belanja modal", weight: 7 },
  { code: "R06", name: "Barang modal di belanja barang", weight: 41 },
  { code: "R07", name: "Nilai tanpa volume", weight: 6 },
  { code: "R08", name: "Item pernah diblokir", weight: 15 }
];

function at(day: number, hour: number, minute: number): number {
  return new Date(2026, 10, day, hour, minute).getTime();
}

function ruleHitsFor(rowCount: number, seeded: boolean): ImportRuleHitCount[] {
  const scale = seeded ? 1 : rowCount / 12702;
  return RULES.map((rule) => ({ ruleId: `rule-${rule.code}`, code: rule.code, name: rule.name, itemCount: Math.max(1, Math.round(rule.weight * scale)) }));
}

const RECHECKED: ImportRecheckedNote[] = [
  {
    noteId: "note-1",
    title: "Pakaian seragam hari besar",
    workUnitName: "Satker Contoh 01",
    category: "EFISIENSI",
    expectation: { type: "hapus_item" },
    result: "terpenuhi",
    evidence: { fields: [], note: "Item tidak ada di revisi" }
  },
  {
    noteId: "note-2",
    title: "Outsourcing jasa kebersihan",
    workUnitName: "Satker Contoh 02",
    category: "AKUN",
    expectation: { type: "ganti_akun", to: "521111" },
    result: "belum_terpenuhi",
    evidence: { fields: [{ field: "account_code", before: "522191", after: "522191" }], note: "Akun masih 522191" }
  },
  {
    noteId: "note-3",
    title: "Rehabilitasi madrasah desa",
    workUnitName: "Satker Contoh 03",
    category: "AKUN",
    expectation: { type: "ganti_akun", to: "526113" },
    result: "terpenuhi",
    evidence: { fields: [{ field: "account_code", before: "532111", after: "526113" }] }
  }
];

function snapshot(
  id: string,
  org: (typeof ORGS)[number],
  versionNo: number,
  importedAt: number,
  rowCount: number,
  fileName: string,
  by: string,
  durationMs: number
): SnapshotDto {
  return {
    id,
    cycleId: ACTIVE_CYCLE_ID,
    organizationUnitId: org.id,
    organizationUnitCode: org.code,
    organizationUnitName: org.shortName,
    versionNo,
    label: versionNo === 1 ? "Awal" : "Revisi",
    sourceFileName: fileName,
    rowCount,
    headerRowsSkipped: 1,
    importedAt,
    diffSummary: null,
    importedByUserId: by === "Reviewer 01" ? "u-reviewer" : "u-reviewer-2",
    importedByName: by,
    rowErrorCount: 0,
    importDurationMs: durationMs
  };
}

function seed(): StoredSnapshot[] {
  const a1 = snapshot("snap-a1", ORGS[0], 1, at(3, 9, 12), 12480, "es1_90001_2026.csv", "Reviewer 01", 36_000);
  const a2 = snapshot("snap-a2", ORGS[0], 2, at(8, 16, 40), 12702, "es1_90001_2026_rev.csv", "Reviewer 01", 38_000);
  const diff: DiffSummary = { baru: 234, berubah: 1038, tetap: 11430, hilang: 12 };
  a2.diffSummary = diff;
  const b1 = snapshot("snap-b1", ORGS[1], 1, at(4, 10, 30), 8915, "es1_90002_2026.csv", "Reviewer 02", 27_000);
  return [
    { dto: a1, hash: "a".repeat(64), rowErrors: [], diff: null, ruleHits: ruleHitsFor(12480, true), rechecked: [] },
    { dto: a2, hash: "b".repeat(64), rowErrors: [], diff, ruleHits: ruleHitsFor(12702, true), rechecked: RECHECKED },
    { dto: b1, hash: "c".repeat(64), rowErrors: [], diff: null, ruleHits: ruleHitsFor(8915, true), rechecked: [] }
  ];
}

export const store: { snapshots: StoredSnapshot[]; jobs: Map<string, MockJob>; seq: number } = {
  snapshots: seed(),
  jobs: new Map(),
  seq: 1
};

/** `?scenario=belum-snapshot` empties the snapshot list so the "Belum ada snapshot" state can be reviewed. */
export function applyScenario(name: string | null): void {
  if (name === "belum-snapshot") store.snapshots = [];
}

export function snapshotsFor(cycleId: string, orgId: string): StoredSnapshot[] {
  return store.snapshots.filter((s) => s.dto.cycleId === cycleId && s.dto.organizationUnitId === orgId).sort((a, b) => a.dto.versionNo - b.dto.versionNo);
}

export function overviewRows(cycleId: string, scope: string[]): ImportOverviewRow[] {
  return ORGS.filter((org) => scope.includes(org.id)).map((org) => {
    const list = snapshotsFor(cycleId, org.id);
    const next = (list[list.length - 1]?.dto.versionNo ?? 0) + 1;
    const { satkerCount, ...unit } = org;
    return { organizationUnit: unit, satkerCount, snapshots: list.map((s) => s.dto), nextVersionNo: next, nextLabel: next === 1 ? "Awal" : "Revisi" };
  });
}

export function findSnapshot(cycleId: string, snapshotId: string): StoredSnapshot | undefined {
  return store.snapshots.find((s) => s.dto.cycleId === cycleId && s.dto.id === snapshotId);
}

export function buildResult(stored: StoredSnapshot): ImportResultDto {
  const dto = stored.dto;
  const itemsAssessed = stored.diff ? stored.diff.baru + stored.diff.berubah : dto.rowCount;
  return {
    snapshot: dto,
    rowsRead: dto.rowCount + dto.headerRowsSkipped + dto.rowErrorCount,
    headerRowsSkipped: dto.headerRowsSkipped,
    itemsSaved: dto.rowCount,
    rowErrorCount: dto.rowErrorCount,
    rowErrors: stored.rowErrors.slice(0, 1000),
    diff: stored.diff,
    itemsAssessed,
    ruleHits: stored.ruleHits,
    recheckedNotes: stored.rechecked,
    notesMovedToVerification: stored.rechecked.length
  };
}

/* ------------------------------------------------------------------ jobs */

export interface MockJob {
  id: string;
  cycleId: string;
  orgId: string;
  versionNo: number;
  fileName: string;
  hash: string;
  startedAt: number;
  durationMs: number;
  rowsTotal: number;
  userId: string;
  userName: string;
  failMessage: string | null;
  snapshotId: string | null;
}

const DESIGN_ERRORS: ImportRowError[] = [
  { line: 412, column: "VOLKEG", value: "12,5x", reason: "bukan_angka", message: "VOLKEG bukan angka." },
  { line: 413, column: "HARGASAT", value: null, reason: "wajib_diisi", message: "HARGASAT wajib diisi." },
  { line: 887, column: "TOTAL", value: "-350.000", reason: "bernilai_negatif", message: "TOTAL tidak boleh negatif." },
  { line: 1204, column: "TOTAL", value: "4.200.000", reason: "bukan_angka", message: "TOTAL bukan angka." },
  { line: 2016, column: "VOLKEG", value: null, reason: "wajib_diisi", message: "VOLKEG wajib diisi." },
  { line: 2017, column: "HARGASAT", value: "n/a", reason: "bukan_angka", message: "HARGASAT bukan angka." }
];

/** Synthetic row errors: eselon I C always gets the designed six; file names with "galat" get them too. */
export function errorsFor(job: MockJob): ImportRowError[] {
  return job.orgId === "org-c" || /galat/i.test(job.fileName) ? DESIGN_ERRORS : [];
}

export function runningJobFor(cycleId: string, orgId: string, now: number): MockJob | undefined {
  for (const job of store.jobs.values()) {
    if (job.cycleId === cycleId && job.orgId === orgId && !job.snapshotId && !job.failMessage && now - job.startedAt < job.durationMs) return job;
  }
  return undefined;
}

function finishJob(job: MockJob): StoredSnapshot {
  const existing = job.snapshotId ? store.snapshots.find((s) => s.dto.id === job.snapshotId) : undefined;
  if (existing) return existing;
  const org = ORGS.find((o) => o.id === job.orgId)!;
  const errors = errorsFor(job);
  const previous = snapshotsFor(job.cycleId, job.orgId).at(-1);
  const rowCount = Math.max(1, job.rowsTotal - 1 - errors.length);
  const dto = snapshot(`snap-${++store.seq}-${job.orgId}`, org, job.versionNo, job.startedAt + job.durationMs, rowCount, job.fileName, job.userName, job.durationMs);
  dto.rowErrorCount = errors.length;
  let diff: DiffSummary | null = null;
  if (previous) {
    const baru = Math.round(rowCount * 0.02);
    const berubah = Math.round(rowCount * 0.08);
    diff = { baru, berubah, tetap: Math.max(0, rowCount - baru - berubah), hilang: Math.round(rowCount * 0.001) };
    dto.diffSummary = diff;
  }
  const stored: StoredSnapshot = {
    dto,
    hash: job.hash,
    rowErrors: errors,
    diff,
    ruleHits: errors.length > 0 ? [] : ruleHitsFor(rowCount, false),
    rechecked: previous ? RECHECKED : []
  };
  store.snapshots.push(stored);
  job.snapshotId = dto.id;
  return stored;
}

export function jobDto(job: MockJob, now: number): ImportJobDto {
  const fraction = Math.min(1, Math.max(0, (now - job.startedAt) / job.durationMs));
  const failed = job.failMessage !== null && fraction >= 0.5;
  const done = !failed && fraction >= 1;
  const stage = done ? 4 : fraction < 0.12 ? 0 : fraction < 0.2 ? 1 : fraction < 0.8 ? 2 : 3;
  const keys = ["baca_file", "saring_header", "simpan_item", "aturan_dan_skor"];
  const steps = keys.map((key, index) => ({ key, status: index < stage ? ("selesai" as const) : index === stage ? ("berjalan" as const) : ("menunggu" as const) }));
  const rowsDone = Math.min(job.rowsTotal, Math.round(job.rowsTotal * Math.min(1, fraction / 0.8)));
  const base = {
    id: job.id,
    kind: "import" as const,
    steps,
    rowsDone: failed ? Math.round(job.rowsTotal * 0.4) : rowsDone,
    rowsTotal: job.rowsTotal,
    percent: done ? 100 : Math.min(99, Math.round(fraction * 100)),
    startedAt: job.startedAt
  };
  if (failed) return { ...base, status: "gagal", finishedAt: now, error: job.failMessage, result: null };
  if (done) {
    const stored = finishJob(job);
    return { ...base, status: "selesai", finishedAt: job.startedAt + job.durationMs, error: null, result: { snapshot: stored.dto, alreadyImported: false } };
  }
  return { ...base, status: "berjalan", finishedAt: null, error: null, result: null };
}
