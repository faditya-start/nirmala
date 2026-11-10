/**
 * Stateful mock for the CHR endpoints (docs/api-contract.md section 4). Loaded only with VITE_MOCK=1.
 * Issue locks a document and moves its notes to menunggu_revisi; an addendum adds a version; edits to a locked
 * document answer 409 like the server. All data is synthetic. Roles come from the mock session (`?as=uki|leader|admin`).
 */
import {
  addendumBodySchema,
  buildChrNumber,
  createChrBodySchema,
  createNoteBodySchema,
  groupLetter,
  NOTE_CATEGORIES,
  NOTE_STATUSES,
  recommendationBodySchema,
  unitResponseBodySchema,
  updateNoteBodySchema
} from "@nirmala/shared";
import type {
  AccountDto,
  ChrDetailResponse,
  ChrDocumentDto,
  ChrListItemDto,
  ChrNoteDto,
  ChrNoteGroupDto,
  ChrPermissionsDto,
  ChrPrintResponse,
  ChrVersionSnapshot,
  ChrVersionSummaryDto,
  CreateNoteBody,
  NoteCategory,
  NoteStatus,
  NoteStatusCounts,
  OrganizationUnitDto,
  Role,
  WorkUnitDto
} from "@nirmala/shared";
import { ApiError } from "../../lib/api-error";
import { registerMock, respond, type MockContext } from "../../lib/mock";
import { isRole } from "../../lib/roles";
import { readSession } from "../../lib/storage";

const YEAR = new Date().getFullYear();
const ALOKASI = "c-alokasi";
const PAGU = "c-pagu";

function at(daysAgo: number, hour = 9, minute = 5): number {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

/* ---------------------------------------------------------------- reference data */

const ORGS: OrganizationUnitDto[] = [
  { id: "org-a", code: "90001", shortName: "Ditjen Contoh A", name: "Direktorat Jenderal Contoh A" },
  { id: "org-b", code: "90002", shortName: "Ditjen Contoh B", name: "Direktorat Jenderal Contoh B" },
  { id: "org-c", code: "90003", shortName: "Ditjen Contoh C", name: "Direktorat Jenderal Contoh C" },
  { id: "org-d", code: "90004", shortName: "Setjen Contoh", name: "Sekretariat Jenderal Contoh" }
];

const WORK_UNITS: WorkUnitDto[] = ORGS.flatMap((org, orgIndex) =>
  [1, 2, 3, 4].map((n) => ({
    id: `wu-${org.id}-${n}`,
    code: String(100100 + orgIndex * 100 + n),
    name: `Satker Contoh ${String(orgIndex * 4 + n).padStart(2, "0")}`,
    organizationUnitId: org.id
  }))
);
const unitByName = (name: string) => WORK_UNITS.find((unit) => unit.name === name) ?? WORK_UNITS[0];

const ACCOUNTS: AccountDto[] = [
  { code: "521111", name: "Belanja Keperluan Perkantoran" },
  { code: "521211", name: "Belanja Bahan" },
  { code: "521219", name: "Belanja Barang Non Operasional Lainnya" },
  { code: "522191", name: "Belanja Jasa Lainnya" },
  { code: "524111", name: "Belanja Perjalanan Dinas Biasa" },
  { code: "526113", name: "Belanja Gedung dan Bangunan untuk Diserahkan kepada Masyarakat/Pemda" },
  { code: "532111", name: "Belanja Modal Peralatan dan Mesin" }
];

/* ------------------------------------------------------------------- session */

function currentRole(): Role | null {
  const raw = readSession("nirmala.mock.user");
  if (raw === null) return "reviewer";
  if (raw === "none") return null;
  try {
    const role = (JSON.parse(raw) as { role?: unknown }).role;
    return isRole(role) ? role : null;
  } catch {
    return null;
  }
}

function requireRole(): Role {
  const role = currentRole();
  if (!role) throw new ApiError(401, "Silakan masuk untuk melanjutkan.");
  return role;
}

const USER_NAME: Record<Role, string> = { reviewer: "Reviewer 01", uki: "PIC UKI 01", leader: "Pimpinan 01", admin: "Admin 01" };

function scopeOf(role: Role): string[] | null {
  if (role === "reviewer") return ["org-a", "org-b"];
  if (role === "uki") return ["org-a"];
  return null;
}

const FORBIDDEN_ORG = "Anda tidak memiliki akses ke eselon I ini.";
const FORBIDDEN_ROLE = "Peran Anda tidak memiliki akses ke sumber daya ini.";
const LOCKED = "CHR sudah terbit dan terkunci. Gunakan adendum.";

/* --------------------------------------------------------------------- state */

interface StoredVersion {
  summary: ChrVersionSummaryDto;
  snapshot: ChrVersionSnapshot;
}

interface StoredChr {
  doc: ChrDocumentDto;
  notes: ChrNoteDto[];
  versions: StoredVersion[];
}

let idCounter = 100;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

function makeNote(doc: string, orgId: string, partial: Partial<ChrNoteDto> & Pick<ChrNoteDto, "title" | "text" | "category" | "expectation" | "createdAt">, workUnitName: string, accountCode: string | null): ChrNoteDto {
  const unit = unitByName(workUnitName);
  void orgId;
  return {
    id: nextId("note"),
    chrDocumentId: doc,
    number: 0,
    rkaItemId: partial.rkaItemId === undefined ? nextId("item") : partial.rkaItemId,
    workUnitId: unit.id,
    workUnitCode: unit.code,
    workUnitName: unit.name,
    accountCode,
    status: "draf",
    ruleId: null,
    ruleCode: null,
    justification: null,
    closedAt: null,
    latestCheckResult: null,
    createdByName: "Reviewer 01",
    updatedAt: partial.createdAt,
    ...partial
  };
}

function makeDoc(id: string, cycleId: string, org: OrganizationUnitDto, stage: "pagu" | "alokasi", patch: Partial<ChrDocumentDto> = {}): ChrDocumentDto {
  return {
    id,
    cycleId,
    cycleName: `Reviu RKA TA ${YEAR} tahap ${stage}`,
    fiscalYear: YEAR,
    stage,
    organizationUnitId: org.id,
    organizationUnitCode: org.code,
    organizationUnitName: org.shortName,
    status: "draft",
    documentNumber: null,
    recommendation: null,
    unitResponse: null,
    unitResponseByName: null,
    unitResponseAt: null,
    issuedAt: null,
    issuedByName: null,
    completedAt: null,
    currentVersion: 0,
    createdAt: at(8),
    updatedAt: at(1),
    ...patch
  };
}

const store = new Map<string, StoredChr>();

function snapshotOf(entry: StoredChr, addendumReason: string | null): ChrVersionSnapshot {
  const numbered = renumber(entry.notes);
  return {
    document: {
      documentNumber: entry.doc.documentNumber,
      recommendation: entry.doc.recommendation,
      unitResponse: entry.doc.unitResponse,
      status: entry.doc.status,
      issuedAt: entry.doc.issuedAt
    },
    notes: JSON.parse(JSON.stringify(numbered)) as ChrNoteDto[],
    addendumReason
  };
}

function seed(): void {
  store.clear();
  const [orgA, orgB, orgC] = ORGS;

  // A: draft, mirrors the Pencil frame AbBPt.
  const a = "chr-a";
  store.set(a, {
    doc: makeDoc(a, ALOKASI, orgA, "alokasi", {
      recommendation: "Eselon I agar menindaklanjuti seluruh catatan sebelum RKA disampaikan ke Kemenkeu pada tenggat ADK 12 Nov 2026."
    }),
    notes: [
      makeNote(a, orgA.id, { title: "Pakaian seragam hari besar", text: "Alokasi pakaian hari besar tidak memiliki standar penetapan biaya dan tidak esensial dalam mendukung fungsi utama.", category: "EFISIENSI", expectation: { type: "hapus_item" }, ruleCode: "R01", ruleId: "rule-01", createdAt: at(3, 10) }, "Satker Contoh 01", "521211"),
      makeNote(a, orgA.id, { title: "Outsourcing jasa kebersihan", text: "Biaya tenaga outsourcing (satpam, pengemudi, kebersihan) menggunakan akun 521111 sesuai KEP-331/PB/2021 tentang Kodefikasi Segmen Akun pada BAS.", category: "AKUN", expectation: { type: "ganti_akun", to: "521111" }, ruleCode: "R02", ruleId: "rule-02", createdAt: at(3, 11) }, "Satker Contoh 02", "522191"),
      makeNote(a, orgA.id, { title: "Rehabilitasi madrasah desa", text: "Belanja rehabilitasi sarana yang diserahkan kepada masyarakat menggunakan akun 526113 (Belanja Gedung dan Bangunan untuk Diserahkan kepada Masyarakat/Pemda).", category: "AKUN", expectation: { type: "ganti_akun", to: "526113" }, ruleCode: "R05", ruleId: "rule-05", createdAt: at(2, 9) }, "Satker Contoh 03", "532111")
    ],
    versions: []
  });

  // B: issued and locked, mirrors gjkcp.
  const b = "chr-b";
  const bNotes = [
    makeNote(b, orgB.id, { title: "Pakaian seragam hari besar", text: "Alokasi pakaian hari besar tidak memiliki standar penetapan biaya dan tidak esensial dalam mendukung fungsi utama.", category: "EFISIENSI", expectation: { type: "hapus_item" }, ruleCode: "R01", ruleId: "rule-01", createdAt: at(6, 10), status: "perlu_verifikasi", latestCheckResult: "belum_terpenuhi" }, "Satker Contoh 05", "521211"),
    makeNote(b, orgB.id, { title: "Outsourcing jasa kebersihan", text: "Biaya tenaga outsourcing (satpam, pengemudi, kebersihan) menggunakan akun 521111 sesuai KEP-331/PB/2021 tentang Kodefikasi Segmen Akun pada BAS.", category: "AKUN", expectation: { type: "ganti_akun", to: "521111" }, ruleCode: "R02", ruleId: "rule-02", createdAt: at(6, 11), status: "perlu_verifikasi", latestCheckResult: "terpenuhi" }, "Satker Contoh 06", "522191"),
    makeNote(b, orgB.id, { title: "Rehabilitasi madrasah desa", text: "Belanja rehabilitasi sarana yang diserahkan kepada masyarakat menggunakan akun 526113 (Belanja Gedung dan Bangunan untuk Diserahkan kepada Masyarakat/Pemda).", category: "AKUN", expectation: { type: "ganti_akun", to: "526113" }, ruleCode: "R05", ruleId: "rule-05", createdAt: at(5, 9), status: "perlu_verifikasi", latestCheckResult: "data_tidak_cukup" }, "Satker Contoh 07", "532111")
  ];
  const bEntry: StoredChr = {
    doc: makeDoc(b, ALOKASI, orgB, "alokasi", {
      status: "issued",
      documentNumber: buildChrNumber({ organizationCode: orgB.code, fiscalYear: YEAR, stage: "alokasi", sequence: 1 }),
      recommendation: "Eselon I agar menindaklanjuti seluruh catatan sebelum RKA disampaikan ke Kemenkeu pada tenggat ADK 12 Nov 2026.",
      unitResponse: "Seluruh catatan sudah diteruskan ke Satker terkait. Perbaikan di SAKTI dijadwalkan sebelum 10 Nov 2026.",
      unitResponseByName: "PIC UKI 02",
      unitResponseAt: at(4, 15, 30),
      issuedAt: at(5, 9, 5),
      issuedByName: "Reviewer 01",
      currentVersion: 1
    }),
    notes: bNotes,
    versions: []
  };
  bEntry.versions.push({
    summary: { versionNumber: 1, reason: "terbit", createdByName: "Reviewer 01", createdAt: at(5, 9, 5), notesCount: 3, addendumReason: null },
    snapshot: { ...snapshotOf(bEntry, null), notes: snapshotOf(bEntry, null).notes.map((note) => ({ ...note, status: "menunggu_revisi" as NoteStatus, latestCheckResult: null })) }
  });
  store.set(b, bEntry);

  // C: completed with an addendum, long text and a manual note, to exercise wrapping and the version history.
  const c = "chr-c";
  const longText =
    "Rincian kebutuhan belanja jasa konsultansi tidak memuat dasar penetapan satuan biaya, volume pekerjaan, maupun keluaran yang diharapkan. Satker agar melengkapi kerangka acuan kerja, rincian perhitungan harga satuan, dan dokumen pendukung lain sebelum RKA disampaikan, serta menyesuaikan nilai dengan standar biaya yang berlaku untuk tahun anggaran berjalan.";
  const cNotes = [
    makeNote(c, orgC.id, { title: "Honorarium tim pelaksana kegiatan", text: "Jumlah tim pelaksana melebihi batas yang ditetapkan dalam standar biaya masukan.", category: "SATUAN_BIAYA", expectation: { type: "turunkan_nilai", maxUnitPrice: 350000, maxTotal: 48600000 }, ruleCode: "R04", ruleId: "rule-04", createdAt: at(12, 10), status: "closed", closedAt: at(3), latestCheckResult: "terpenuhi" }, "Satker Contoh 09", "521115"),
    makeNote(c, orgC.id, { title: "Jasa konsultansi penyusunan kajian kebijakan dan evaluasi program prioritas nasional tahun berjalan", text: longText, category: "LAINNYA", expectation: { type: "rinci_item" }, createdAt: at(12, 11), status: "closed", closedAt: at(2), latestCheckResult: "terpenuhi" }, "Satker Contoh 10", "522151"),
    makeNote(c, orgC.id, { title: "Belanja perjalanan dinas paket meeting", text: "Paket meeting luar kota perlu dirinci per komponen agar dapat dibandingkan dengan standar biaya.", category: "SATUAN_BIAYA", expectation: { type: "manual", instruction: "Rinci komponen paket meeting (akomodasi, konsumsi, ruang rapat) dan lampirkan perhitungannya." }, createdAt: at(11, 9), status: "closed", closedAt: at(2), latestCheckResult: "terpenuhi" }, "Satker Contoh 11", "524119")
  ];
  const cAdded = makeNote(c, orgC.id, { title: "Honorarium narasumber kegiatan sosialisasi", text: "Tarif honorarium narasumber melebihi standar yang berlaku.", category: "SATUAN_BIAYA", expectation: { type: "turunkan_nilai", maxUnitPrice: 1700000 }, createdAt: at(7, 14), status: "closed", closedAt: at(2), latestCheckResult: "terpenuhi", rkaItemId: null }, "Satker Contoh 12", null);
  const cEntry: StoredChr = {
    doc: makeDoc(c, ALOKASI, orgC, "alokasi", {
      status: "completed",
      documentNumber: buildChrNumber({ organizationCode: orgC.code, fiscalYear: YEAR, stage: "alokasi", sequence: 2 }),
      recommendation: "Seluruh catatan agar ditindaklanjuti sebelum penelaahan RKA oleh Kemenkeu.",
      issuedAt: at(11, 9, 40),
      issuedByName: "Reviewer 01",
      completedAt: at(2),
      currentVersion: 2
    }),
    notes: [...cNotes, cAdded],
    versions: []
  };
  const v1Notes = { ...cEntry, notes: cNotes };
  cEntry.versions.push({
    summary: { versionNumber: 1, reason: "terbit", createdByName: "Reviewer 01", createdAt: at(11, 9, 40), notesCount: 3, addendumReason: null },
    snapshot: { ...snapshotOf(v1Notes, null), notes: snapshotOf(v1Notes, null).notes.map((note) => ({ ...note, status: "menunggu_revisi" as NoteStatus })) }
  });
  cEntry.versions.push({
    summary: { versionNumber: 2, reason: "adendum", createdByName: "Reviewer 01", createdAt: at(7, 14, 20), notesCount: 4, addendumReason: "Tambahan catatan honorarium narasumber dari hasil telaah lanjutan." },
    snapshot: snapshotOf(cEntry, "Tambahan catatan honorarium narasumber dari hasil telaah lanjutan.")
  });
  store.set(c, cEntry);

  // P: previous (pagu) cycle, completed.
  const p = "chr-p";
  const pEntry: StoredChr = {
    doc: makeDoc(p, PAGU, orgA, "pagu", {
      status: "completed",
      documentNumber: buildChrNumber({ organizationCode: orgA.code, fiscalYear: YEAR, stage: "pagu", sequence: 1 }),
      recommendation: "Tindak lanjuti catatan sebelum penetapan alokasi.",
      issuedAt: at(70, 10),
      issuedByName: "Reviewer 01",
      completedAt: at(50),
      currentVersion: 1
    }),
    notes: [
      makeNote(p, orgA.id, { title: "Perjalanan dinas pimpinan", text: "Frekuensi perjalanan dinas melampaui kebutuhan kegiatan.", category: "EFISIENSI", expectation: { type: "turunkan_nilai", maxTotal: 90000000 }, createdAt: at(72), status: "closed", closedAt: at(50), latestCheckResult: "terpenuhi" }, "Satker Contoh 01", "524111")
    ],
    versions: []
  };
  pEntry.versions.push({
    summary: { versionNumber: 1, reason: "terbit", createdByName: "Reviewer 01", createdAt: at(70, 10), notesCount: 1, addendumReason: null },
    snapshot: snapshotOf(pEntry, null)
  });
  store.set(p, pEntry);
}

seed();

/* ------------------------------------------------------------------ helpers */

const categoryIndex = (category: NoteCategory) => NOTE_CATEGORIES.indexOf(category);

/** Numbers notes 1..n across groups (category order, then createdAt), as the server does. */
function renumber(notes: ChrNoteDto[]): ChrNoteDto[] {
  const sorted = [...notes].sort((x, y) => categoryIndex(x.category) - categoryIndex(y.category) || x.createdAt - y.createdAt);
  sorted.forEach((note, index) => {
    note.number = index + 1;
  });
  return sorted;
}

function countsOf(notes: ChrNoteDto[]): NoteStatusCounts {
  const counts = Object.fromEntries(NOTE_STATUSES.map((status) => [status, 0])) as NoteStatusCounts;
  for (const note of notes) counts[note.status] += 1;
  return counts;
}

function groupsOf(notes: ChrNoteDto[]): ChrNoteGroupDto[] {
  const sorted = renumber(notes);
  const groups: ChrNoteGroupDto[] = [];
  for (const category of NOTE_CATEGORIES) {
    const inGroup = sorted.filter((note) => note.category === category);
    if (inGroup.length > 0) groups.push({ category, letter: groupLetter(groups.length), notes: inGroup.map((note) => ({ ...note })) });
  }
  return groups;
}

function permissionsOf(role: Role, entry: StoredChr): ChrPermissionsDto {
  const write = role === "reviewer" || role === "admin";
  const respond = role === "uki" || role === "admin";
  const draft = entry.doc.status === "draft";
  return {
    canEditNotes: write && draft,
    canEditRecommendation: write && draft,
    canIssue: write && draft && entry.notes.some((note) => note.status === "draf"),
    canAddAddendum: write && !draft,
    canRespond: respond && !draft
  };
}

function find(role: Role, id: string): StoredChr {
  const entry = store.get(id);
  if (!entry) throw new ApiError(404, "CHR tidak ditemukan.");
  const scope = scopeOf(role);
  if (scope && !scope.includes(entry.doc.organizationUnitId)) throw new ApiError(403, FORBIDDEN_ORG);
  return entry;
}

function requireWrite(role: Role): void {
  if (role !== "reviewer" && role !== "admin") throw new ApiError(403, FORBIDDEN_ROLE);
}

function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Permintaan tidak valid.";
}

function touch(entry: StoredChr): void {
  entry.doc.updatedAt = Date.now();
}

function validateNoteScope(entry: StoredChr, body: CreateNoteBody): WorkUnitDto {
  const unit = WORK_UNITS.find((candidate) => candidate.id === body.workUnitId);
  if (!unit) throw new ApiError(404, "Satker tidak ditemukan.");
  if (unit.organizationUnitId !== entry.doc.organizationUnitId) throw new ApiError(409, "Satker bukan dari eselon I CHR ini.");
  return unit;
}

function noteFromBody(entry: StoredChr, body: CreateNoteBody, status: NoteStatus, role: Role): ChrNoteDto {
  const unit = validateNoteScope(entry, body);
  const now = Date.now();
  return {
    id: nextId("note"),
    chrDocumentId: entry.doc.id,
    number: 0,
    rkaItemId: null,
    workUnitId: unit.id,
    workUnitCode: unit.code,
    workUnitName: unit.name,
    accountCode: null,
    title: body.title ?? "Catatan",
    category: body.category,
    text: body.text,
    expectation: body.expectation,
    status,
    ruleId: null,
    ruleCode: null,
    justification: null,
    closedAt: null,
    latestCheckResult: null,
    createdByName: USER_NAME[role],
    createdAt: now,
    updatedAt: now
  };
}

/* ----------------------------------------------------------------- handlers */

function detail(role: Role, entry: StoredChr): ChrDetailResponse {
  return {
    document: { ...entry.doc },
    groups: groupsOf(entry.notes),
    notesByStatus: countsOf(entry.notes),
    notesTotal: entry.notes.length,
    versions: entry.versions.map((version) => ({ ...version.summary })),
    permissions: permissionsOf(role, entry)
  };
}

registerMock("GET", "/chr", ({ query }: MockContext) => {
  const role = requireRole();
  if (!query.cycleId) throw new ApiError(400, "Siklus wajib dipilih.");
  const scope = scopeOf(role);
  const inScope = (orgId: string) => scope === null || scope.includes(orgId);
  const docs = [...store.values()].filter((entry) => entry.doc.cycleId === query.cycleId && inScope(entry.doc.organizationUnitId));
  const items: ChrListItemDto[] = docs
    .filter((entry) => !query.status || entry.doc.status === query.status)
    .map((entry) => ({
      id: entry.doc.id,
      cycleId: entry.doc.cycleId,
      organizationUnitId: entry.doc.organizationUnitId,
      organizationUnitCode: entry.doc.organizationUnitCode,
      organizationUnitName: entry.doc.organizationUnitName,
      status: entry.doc.status,
      documentNumber: entry.doc.documentNumber,
      notesByStatus: countsOf(entry.notes),
      notesTotal: entry.notes.length,
      issuedAt: entry.doc.issuedAt,
      completedAt: entry.doc.completedAt,
      updatedAt: entry.doc.updatedAt
    }));
  const withDoc = new Set(docs.map((entry) => entry.doc.organizationUnitId));
  return { items, organizationUnitsWithoutChr: ORGS.filter((org) => inScope(org.id) && !withDoc.has(org.id) && query.cycleId === ALOKASI) };
});

registerMock("POST", "/chr", ({ body }: MockContext) => {
  const role = requireRole();
  requireWrite(role);
  const parsed = createChrBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, "Siklus dan eselon I wajib dipilih.");
  const scope = scopeOf(role);
  if (scope && !scope.includes(parsed.data.organizationUnitId)) throw new ApiError(403, FORBIDDEN_ORG);
  const org = ORGS.find((candidate) => candidate.id === parsed.data.organizationUnitId);
  if (!org) throw new ApiError(404, "Eselon I tidak ditemukan.");
  const existing = [...store.values()].find((entry) => entry.doc.cycleId === parsed.data.cycleId && entry.doc.organizationUnitId === org.id);
  if (existing) return respond(200, { document: { ...existing.doc } });
  if (parsed.data.cycleId === PAGU) throw new ApiError(409, "Siklus sudah selesai.");
  const id = nextId("chr");
  const entry: StoredChr = { doc: makeDoc(id, parsed.data.cycleId, org, "alokasi", { createdAt: Date.now(), updatedAt: Date.now() }), notes: [], versions: [] };
  store.set(id, entry);
  return respond(201, { document: { ...entry.doc } });
});

registerMock("GET", "/chr/:id", ({ params }: MockContext) => {
  const role = requireRole();
  return detail(role, find(role, params.id));
});

registerMock("POST", "/chr/:id/notes", ({ params, body }: MockContext) => {
  const role = requireRole();
  requireWrite(role);
  const entry = find(role, params.id);
  if (entry.doc.status !== "draft") throw new ApiError(409, LOCKED);
  const parsed = createNoteBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  const note = noteFromBody(entry, parsed.data, "draf", role);
  entry.notes.push(note);
  touch(entry);
  renumber(entry.notes);
  return respond(201, { note: { ...note } });
});

registerMock("PATCH", "/chr/:id/notes/:noteId", ({ params, body }: MockContext) => {
  const role = requireRole();
  requireWrite(role);
  const entry = find(role, params.id);
  const note = entry.notes.find((candidate) => candidate.id === params.noteId);
  if (!note) throw new ApiError(404, "Catatan tidak ditemukan.");
  if (entry.doc.status !== "draft" || note.status !== "draf") throw new ApiError(409, LOCKED);
  const parsed = updateNoteBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  Object.assign(note, parsed.data, { updatedAt: Date.now() });
  touch(entry);
  renumber(entry.notes);
  return { note: { ...note } };
});

registerMock("DELETE", "/chr/:id/notes/:noteId", ({ params }: MockContext) => {
  const role = requireRole();
  requireWrite(role);
  const entry = find(role, params.id);
  const index = entry.notes.findIndex((candidate) => candidate.id === params.noteId);
  if (index < 0) throw new ApiError(404, "Catatan tidak ditemukan.");
  if (entry.doc.status !== "draft") throw new ApiError(409, LOCKED);
  entry.notes.splice(index, 1);
  touch(entry);
  return respond(204);
});

registerMock("PUT", "/chr/:id/recommendation", ({ params, body }: MockContext) => {
  const role = requireRole();
  requireWrite(role);
  const entry = find(role, params.id);
  if (entry.doc.status !== "draft") throw new ApiError(409, LOCKED);
  const parsed = recommendationBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  entry.doc.recommendation = parsed.data.recommendation === "" ? null : parsed.data.recommendation;
  touch(entry);
  return { document: { ...entry.doc } };
});

registerMock("POST", "/chr/:id/issue", ({ params }: MockContext) => {
  const role = requireRole();
  requireWrite(role);
  const entry = find(role, params.id);
  if (entry.doc.status !== "draft") throw new ApiError(409, "CHR sudah terbit.");
  const drafts = entry.notes.filter((note) => note.status === "draf");
  if (drafts.length === 0) throw new ApiError(409, "Tidak ada catatan Draf untuk diterbitkan.");
  const sequence = [...store.values()].filter((other) => other.doc.cycleId === entry.doc.cycleId && other.doc.documentNumber).length + 1;
  const now = Date.now();
  drafts.forEach((note) => {
    note.status = "menunggu_revisi";
    note.updatedAt = now;
  });
  Object.assign(entry.doc, {
    status: "issued",
    documentNumber: buildChrNumber({ organizationCode: entry.doc.organizationUnitCode, fiscalYear: entry.doc.fiscalYear, stage: entry.doc.stage, sequence }),
    issuedAt: now,
    issuedByName: USER_NAME[role],
    currentVersion: 1,
    updatedAt: now
  });
  const summary: ChrVersionSummaryDto = { versionNumber: 1, reason: "terbit", createdByName: USER_NAME[role], createdAt: now, notesCount: entry.notes.length, addendumReason: null };
  entry.versions.push({ summary, snapshot: snapshotOf(entry, null) });
  return { document: { ...entry.doc }, version: { ...summary }, notesTransitioned: drafts.length };
});

registerMock("PUT", "/chr/:id/unit-response", ({ params, body }: MockContext) => {
  const role = requireRole();
  if (role !== "uki" && role !== "admin") throw new ApiError(403, FORBIDDEN_ROLE);
  const entry = find(role, params.id);
  if (entry.doc.status === "draft") throw new ApiError(409, "Tanggapan baru bisa diisi setelah CHR terbit.");
  const parsed = unitResponseBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  Object.assign(entry.doc, { unitResponse: parsed.data.unitResponse, unitResponseByName: USER_NAME[role], unitResponseAt: Date.now() });
  touch(entry);
  return { document: { ...entry.doc } };
});

registerMock("POST", "/chr/:id/addendum", ({ params, body }: MockContext) => {
  const role = requireRole();
  requireWrite(role);
  const entry = find(role, params.id);
  if (entry.doc.status === "draft") throw new ApiError(409, "CHR masih draf; ubah langsung tanpa adendum.");
  const parsed = addendumBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, firstIssue(parsed.error));
  const added = parsed.data.notes.map((input) => noteFromBody(entry, input, "menunggu_revisi", role));
  entry.notes.push(...added);
  if (parsed.data.recommendation !== undefined) entry.doc.recommendation = parsed.data.recommendation === "" ? null : parsed.data.recommendation;
  if (entry.doc.status === "completed" && added.length > 0) {
    entry.doc.status = "issued";
    entry.doc.completedAt = null;
  }
  entry.doc.currentVersion += 1;
  touch(entry);
  const summary: ChrVersionSummaryDto = {
    versionNumber: entry.doc.currentVersion,
    reason: "adendum",
    createdByName: USER_NAME[role],
    createdAt: Date.now(),
    notesCount: entry.notes.length,
    addendumReason: parsed.data.reason
  };
  entry.versions.push({ summary, snapshot: snapshotOf(entry, parsed.data.reason) });
  return { document: { ...entry.doc }, version: { ...summary }, notesAdded: added.length };
});

registerMock("GET", "/chr/:id/versions", ({ params }: MockContext) => {
  const role = requireRole();
  return { versions: find(role, params.id).versions.map((version) => ({ ...version.summary })) };
});

registerMock("GET", "/chr/:id/versions/:n", ({ params }: MockContext) => {
  const role = requireRole();
  const version = find(role, params.id).versions.find((candidate) => candidate.summary.versionNumber === Number(params.n));
  if (!version) throw new ApiError(404, "Versi tidak ditemukan.");
  return { version: { ...version.summary }, snapshot: version.snapshot };
});

registerMock("GET", "/chr/:id/print", ({ params, query }: MockContext): ChrPrintResponse => {
  const role = requireRole();
  const entry = find(role, params.id);
  const wanted = query.version ? Number(query.version) : entry.versions[entry.versions.length - 1]?.summary.versionNumber;
  const stored = wanted ? entry.versions.find((version) => version.summary.versionNumber === wanted) : undefined;
  if (query.version && !stored) throw new ApiError(404, "Versi tidak ditemukan.");
  const notes = stored ? stored.snapshot.notes : entry.notes;
  const docPart = stored ? stored.snapshot.document : { documentNumber: null, recommendation: entry.doc.recommendation, unitResponse: entry.doc.unitResponse, status: entry.doc.status, issuedAt: entry.doc.issuedAt };
  const groups = groupsOf(notes).map((group) => ({
    category: group.category,
    letter: group.letter,
    rows: group.notes.map((note) => ({
      number: note.number,
      workUnitName: note.workUnitName,
      itemDescription: note.title,
      accountCode: note.accountCode,
      text: note.text,
      expectation: note.expectation
    }))
  }));
  return {
    letterhead: { organizationName: "Kementerian Contoh", unitName: "Inspektorat Jenderal", address: "Jl. Contoh Raya No. 1, Jakarta · Telepon (021) 000 0000" },
    signatory: { city: "Jakarta", title: "Inspektur Jenderal", name: null, nip: null },
    documentNumber: docPart.documentNumber,
    status: docPart.status,
    organizationUnitName: entry.doc.organizationUnitName,
    fiscalYear: entry.doc.fiscalYear,
    stage: entry.doc.stage,
    issuedAt: docPart.issuedAt,
    versionNumber: stored?.summary.versionNumber ?? 0,
    groups,
    recommendation: docPart.recommendation,
    unitResponse: docPart.unitResponse,
    generatedAt: Date.now()
  };
});

registerMock("GET", "/work-units", ({ query }: MockContext) => {
  requireRole();
  return { workUnits: WORK_UNITS.filter((unit) => !query.organizationUnitId || unit.organizationUnitId === query.organizationUnitId) };
});

registerMock("GET", "/references/accounts", ({ query }: MockContext) => {
  requireRole();
  const q = (query.q ?? "").trim().toLowerCase();
  const limit = Number(query.limit) || 50;
  return { accounts: ACCOUNTS.filter((account) => !q || account.code.startsWith(q) || account.name.toLowerCase().includes(q)).slice(0, limit) };
});
