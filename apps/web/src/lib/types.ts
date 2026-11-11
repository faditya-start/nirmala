/** Shapes the app infrastructure itself depends on. Feature DTOs live in the feature folder or @nirmala/shared. */

import type { NeedsActionItem, NeedsActionResponse, ReviewCycleDto } from "@nirmala/shared";

export type Cycle = ReviewCycleDto;
export type { NeedsActionItem, NeedsActionResponse };

export interface CyclesResponse {
  cycles: Cycle[];
}

/** "TA 2026 · Alokasi" */
export function cycleLabel(cycle: Pick<Cycle, "fiscalYear" | "stage">): string {
  const stage = cycle.stage ? cycle.stage.charAt(0).toUpperCase() + cycle.stage.slice(1) : "";
  return stage ? `TA ${cycle.fiscalYear} · ${stage}` : `TA ${cycle.fiscalYear}`;
}
