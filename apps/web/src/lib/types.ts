/** Shapes the app infrastructure itself depends on. Feature DTOs live in the feature folder or @nirmala/shared. */

export interface Cycle {
  id: string;
  fiscalYear: number;
  /** "pagu" | "alokasi" */
  stage: string;
  name?: string | null;
  /** ISO date/datetime (or epoch ms) of the ADK deadline to Kemenkeu. */
  adkDeadline: string | number | null;
  /** When the DIPA was issued; null until then. Public pages only show cycles with a value. */
  dipaIssuedAt: string | number | null;
  status: string;
}

export interface CyclesResponse {
  cycles: Cycle[];
}

export interface NeedsActionItem {
  label: string;
  href: string;
  count: number;
}

export interface NeedsActionResponse {
  count: number;
  items: NeedsActionItem[];
}

/** "TA 2026 · Alokasi" */
export function cycleLabel(cycle: Pick<Cycle, "fiscalYear" | "stage">): string {
  const stage = cycle.stage ? cycle.stage.charAt(0).toUpperCase() + cycle.stage.slice(1) : "";
  return stage ? `TA ${cycle.fiscalYear} · ${stage}` : `TA ${cycle.fiscalYear}`;
}
