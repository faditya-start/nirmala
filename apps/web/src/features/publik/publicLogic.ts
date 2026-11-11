/** Pure helpers for the public screens (P1, P2). No runtime imports so they run under plain `node --test`. */
import type { NoteCategory, PublicCycleDto, PublicKpis, PublicOrganizationRow } from "@nirmala/shared";

const idInteger = new Intl.NumberFormat("id-ID");
const idOneDecimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** Column order and labels as designed (rekTU, c1KqO). */
export const CATEGORY_COLUMNS: ReadonlyArray<{ key: NoteCategory; label: string }> = [
  { key: "AKUN", label: "Ketepatan akun" },
  { key: "EFISIENSI", label: "Efisiensi belanja" },
  { key: "SATUAN_BIAYA", label: "Satuan biaya" },
  { key: "LAINNYA", label: "Lainnya" }
];

const STAGE_LABEL: Record<string, string> = { alokasi: "Alokasi anggaran", pagu: "Pagu anggaran" };

/** "TA 2025 · Alokasi anggaran" */
export function cycleOptionLabel(cycle: Pick<PublicCycleDto, "fiscalYear" | "stage">): string {
  return `TA ${cycle.fiscalYear} · ${STAGE_LABEL[cycle.stage] ?? cycle.stage}`;
}

/** The merged group is shown as "Eselon I lainnya" (the API sends "Lainnya"). */
export function rowLabel(row: Pick<PublicOrganizationRow, "kind" | "label">): string {
  return row.kind === "lainnya" ? "Eselon I lainnya" : row.label;
}

/** Count for one category cell; missing or non-finite values read as 0 so a bad payload never prints "NaN". */
export function categoryCount(byCategory: Partial<Record<NoteCategory, number>> | undefined, key: NoteCategory): number {
  const value = byCategory?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function formatCount(value: number): string {
  return idInteger.format(Number.isFinite(value) ? value : 0);
}

export interface KpiView {
  notes: { value: string; hint: string };
  closed: { value: string; hint: string; progress?: number };
  median: { value: string; hint: string };
}

const DASH = "–";

export function kpiView(kpis: PublicKpis): KpiView {
  const total = kpis.notesTotal;
  const percent = kpis.closedBeforeDeadlinePercent;
  return {
    notes: { value: formatCount(total), hint: "Catatan CHR yang diterbitkan pada siklus ini" },
    closed:
      total > 0 && percent !== null
        ? {
            value: `${idInteger.format(percent)}%`,
            hint: `${formatCount(kpis.closedBeforeDeadline)} dari ${formatCount(total)} catatan ditutup sebelum ADK diajukan`,
            progress: Math.min(1, Math.max(0, percent / 100))
          }
        : { value: DASH, hint: "Belum ada catatan terbit pada siklus ini" },
    median:
      kpis.medianDaysToClose !== null
        ? { value: `${idOneDecimal.format(kpis.medianDaysToClose)} hari`, hint: "Dihitung dari catatan yang sudah closed" }
        : { value: DASH, hint: "Belum ada catatan yang closed pada siklus ini" }
  };
}

export type LoadFailure = "tidak_ditemukan" | "belum_tersedia" | "terlalu_sering" | "server" | "jaringan";

/** Maps an API client failure (ApiError-like or a network TypeError) to a screen state. */
export function classifyFailure(error: unknown): LoadFailure {
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : undefined;
  if (status === 404) return "tidak_ditemukan";
  if (status === 501) return "belum_tersedia";
  if (status === 429) return "terlalu_sering";
  if (status !== undefined && status >= 400) return "server";
  return "jaringan";
}

/** Picks the cycle to show: the requested one if it is public, otherwise the newest (the API sorts newest first). */
export function pickCycleId(requested: string | null, cycles: ReadonlyArray<Pick<PublicCycleDto, "id">>): string | null {
  if (requested && cycles.some((cycle) => cycle.id === requested)) return requested;
  return cycles[0]?.id ?? null;
}
