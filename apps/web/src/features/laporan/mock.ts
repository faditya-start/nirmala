/** Mock for S11 Laporan (synthetic data). Follows contracts/laporan.ts; scope follows the signed-in role. */
import type { EngineValidationResponse, OrganizationUnitDto, ReportSummaryResponse } from "@nirmala/shared";
import { ApiError } from "../../lib/api-error";
import { registerMock } from "../../lib/mock";
import { MOCK_ORG_UNITS, currentMockRole, mockCycles, visibleMockUnits } from "../../lib/mock-defaults";

const [, UNIT_B] = MOCK_ORG_UNITS;
const visibleUnits = visibleMockUnits;
const role = currentMockRole;

function resolveScope(query: Record<string, string>): OrganizationUnitDto | null {
  const visible = visibleUnits();
  if (query.organizationUnitId) {
    const unit = visible.find((item) => item.id === query.organizationUnitId);
    if (!unit) throw new ApiError(403, "Anda tidak memiliki akses ke eselon I ini.");
    return unit;
  }
  return visible.length === 1 ? visible[0] : null;
}

const DATA_AS_OF = new Date(2026, 10, 9, 16, 41).getTime();

registerMock("GET", "/reports/summary", ({ query }): ReportSummaryResponse => {
  const unit = resolveScope(query);
  const cycle = mockCycles.find((item) => item.id === query.cycleId);
  if (!cycle) throw new ApiError(404, "Siklus tidak ditemukan.");
  const empty = cycle.id !== "c-alokasi" || unit?.id === UNIT_B.id;
  if (empty) {
    return {
      cycle, organizationUnit: unit, dataAsOf: cycle.id === "c-alokasi" ? null : DATA_AS_OF, notesIssued: 0, notesClosed: 0, percentClosed: null, medianDaysToClose: null,
      closedSampleSize: 0, isFinal: cycle.status === "selesai", chrDocuments: [], notesByCategory: { AKUN: 0, EFISIENSI: 0, SATUAN_BIAYA: 0, LAINNYA: 0 },
      dismissReasons: [], dismissedItems: 0, flaggedItems: 0
    };
  }
  return {
    cycle,
    organizationUnit: unit,
    dataAsOf: DATA_AS_OF,
    notesIssued: 3,
    notesClosed: 2,
    percentClosed: 67,
    medianDaysToClose: 5,
    closedSampleSize: 2,
    isFinal: false,
    chrDocuments: [{ documentNumber: "014/CHR/2026", issuedAt: new Date(2026, 10, 4, 9, 5).getTime() }],
    notesByCategory: { AKUN: 2, EFISIENSI: 1, SATUAN_BIAYA: 0, LAINNYA: 0 },
    dismissReasons: [
      { code: "akun_sudah_tepat", label: "Akun sudah tepat", count: 8 },
      { code: "dasar_hukum", label: "Sudah ada dasar hukum", count: 5 },
      { code: "fungsi_utama", label: "Item esensial untuk fungsi utama", count: 4 },
      { code: "harga_wajar", label: "Harga wajar karena lokasi", count: 2 },
      { code: "data_salah", label: "Data tidak lengkap / salah impor", count: 2 },
      { code: "lainnya", label: "Lainnya", count: 1 }
    ],
    dismissedItems: 22,
    flaggedItems: 108
  };
});

registerMock("GET", "/reports/engine-validation", ({ query }): EngineValidationResponse => {
  resolveScope(query);
  return {
    synthetic: true,
    sets: [
      { code: "L1", title: "Catatan akun dan lainnya", description: "Item berlabel di snapshot Awal", metric: "recall", totalItems: 20, caught: 14, value: 0.7, n: null, ruleCodes: ["R02", "R03", "R04", "R05"], missedCount: 6 },
      { code: "L2", title: "Catatan inefisiensi", description: "Item berlabel di snapshot Revisi", metric: "recall", totalItems: 10, caught: 8, value: 0.8, n: null, ruleCodes: ["R01", "R02", "R07"], missedCount: 2 }
    ],
    note: '8 item belum tertangkap, misalnya "kebutuhan atribut peringatan hari besar, 1 KEG" tanpa kata pakaian dan "jasa perawatan taman gedung" di akun 522191.'
  };
});
