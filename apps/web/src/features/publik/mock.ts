/**
 * Mocks for P1/P2 (synthetic data only). Real contract paths:
 *   GET /api/public/cycles          -> PublicCycleListResponse
 *   GET /api/public/transparency    -> PublicTransparencyResponse (?cycleId)
 * Public: no session needed. Try the other states with `?mock=kosong` (no public cycle),
 * `?mock=galat` (500) or `?mock=hilang` (cycle 404), or from the console:
 *   __nirmalaPublik.setScenario("kosong" | "galat" | "hilang" | null)
 */
import { NOTE_CATEGORIES, type NoteCategory, type PublicCycleDto, type PublicOrganizationRow, type PublicTransparencyResponse } from "@nirmala/shared";
import { ApiError } from "../../lib/api-error";
import { registerMock } from "../../lib/mock";

type Counts = Record<NoteCategory, number>;
interface RawRow {
  kind: "eselon" | "lainnya";
  label: string;
  byCategory: Counts;
}
interface Scenario {
  cycle: PublicCycleDto;
  rows: RawRow[];
  closedBeforeDeadline: number;
  medianDaysToClose: number | null;
}

const counts = (akun: number, efisiensi: number, satuan: number, lainnya: number): Counts => ({ AKUN: akun, EFISIENSI: efisiensi, SATUAN_BIAYA: satuan, LAINNYA: lainnya });
const at = (year: number, month: number, day: number): number => new Date(year, month - 1, day, 10, 0, 0).getTime();

const CYCLES: Scenario[] = [
  {
    cycle: { id: "pub-2026-alokasi", name: "Reviu RKA TA 2026 tahap alokasi", fiscalYear: 2026, stage: "alokasi", dipaIssuedAt: at(2026, 11, 3) },
    rows: [
      { kind: "eselon", label: "Ditjen Contoh A", byCategory: counts(21, 12, 5, 2) },
      { kind: "eselon", label: "Ditjen Contoh B", byCategory: counts(11, 9, 4, 0) },
      { kind: "eselon", label: "Ditjen Contoh C", byCategory: counts(6, 5, 1, 1) },
      { kind: "lainnya", label: "Lainnya", byCategory: counts(2, 1, 0, 0) }
    ],
    closedBeforeDeadline: 54,
    medianDaysToClose: 5.5
  },
  {
    cycle: { id: "pub-2025-alokasi", name: "Reviu RKA TA 2025 tahap alokasi", fiscalYear: 2025, stage: "alokasi", dipaIssuedAt: at(2025, 12, 12) },
    rows: [
      { kind: "eselon", label: "Ditjen Contoh A", byCategory: counts(14, 9, 3, 1) },
      { kind: "eselon", label: "Ditjen Contoh B", byCategory: counts(8, 7, 2, 0) },
      { kind: "lainnya", label: "Lainnya", byCategory: counts(1, 1, 0, 0) }
    ],
    closedBeforeDeadline: 38,
    medianDaysToClose: 6
  },
  {
    cycle: { id: "pub-2025-pagu", name: "Reviu RKA TA 2025 tahap pagu", fiscalYear: 2025, stage: "pagu", dipaIssuedAt: at(2025, 6, 20) },
    // Every eselon I is small, so the whole cycle collapses into one merged row.
    rows: [{ kind: "lainnya", label: "Lainnya", byCategory: counts(2, 2, 1, 0) }],
    closedBeforeDeadline: 0,
    medianDaysToClose: null
  }
];

let scenario: "kosong" | "galat" | "hilang" | null = null;

function activeScenario(): typeof scenario {
  if (scenario) return scenario;
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("mock");
  return value === "kosong" || value === "galat" || value === "hilang" ? value : null;
}

if (typeof window !== "undefined") {
  (window as unknown as { __nirmalaPublik: unknown }).__nirmalaPublik = {
    setScenario(next: typeof scenario) {
      scenario = next;
    }
  };
}

function build(spec: Scenario): PublicTransparencyResponse {
  const rows: PublicOrganizationRow[] = spec.rows.map((row) => ({
    ...row,
    total: NOTE_CATEGORIES.reduce((sum, key) => sum + row.byCategory[key], 0)
  }));
  const byCategory = Object.fromEntries(NOTE_CATEGORIES.map((key) => [key, rows.reduce((sum, row) => sum + row.byCategory[key], 0)])) as Counts;
  const notesTotal = rows.reduce((sum, row) => sum + row.total, 0);
  return {
    cycle: spec.cycle,
    synthetic: true,
    generatedAt: Date.now(),
    minNotes: 5,
    kpis: {
      notesTotal,
      closedBeforeDeadline: spec.closedBeforeDeadline,
      closedBeforeDeadlinePercent: notesTotal > 0 ? Math.round((spec.closedBeforeDeadline / notesTotal) * 100) : null,
      medianDaysToClose: spec.medianDaysToClose
    },
    rows,
    totals: { byCategory, total: notesTotal }
  };
}

registerMock("GET", "/public/cycles", () => {
  const state = activeScenario();
  if (state === "galat") throw new ApiError(500, "Terjadi kesalahan pada server.");
  return { cycles: state === "kosong" ? [] : CYCLES.map((item) => item.cycle) };
});

registerMock("GET", "/public/transparency", ({ query }) => {
  const state = activeScenario();
  if (state === "galat") throw new ApiError(500, "Terjadi kesalahan pada server.");
  if (state === "kosong" || state === "hilang") throw new ApiError(404, "Siklus tidak ditemukan.");
  const spec = query.cycleId ? CYCLES.find((item) => item.cycle.id === query.cycleId) : CYCLES[0];
  if (!spec) throw new ApiError(404, "Siklus tidak ditemukan.");
  return build(spec);
});
