/** Pure helpers for Progres per Satker (no runtime imports, loadable by `node --test`). */
import type { CheckResult, SatkerOpenNotePreview, SatkerReadiness } from "@nirmala/shared";

const DAY = 86_400_000;

function startOfDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "hari ini", "1 hari lalu", "12 hari lalu" by calendar day, not by 24 hour blocks. */
export function relativeDays(then: number, now: number = Date.now()): string {
  const days = Math.max(0, Math.round((startOfDay(now) - startOfDay(then)) / DAY));
  if (days === 0) return "hari ini";
  return `${new Intl.NumberFormat("id-ID").format(days)} hari lalu`;
}

export const READINESS_TEXT: Record<SatkerReadiness, string> = {
  siap_diajukan: "Siap diajukan",
  belum_siap: "Belum siap",
  tidak_ada_catatan: "Tidak ada catatan"
};

const CHECK_LOWER: Record<CheckResult, string> = {
  terpenuhi: "terpenuhi",
  belum_terpenuhi: "belum terpenuhi",
  data_tidak_cukup: "data tidak cukup",
  item_tidak_ditemukan: "item tidak ditemukan"
};

/** "Satker Contoh 02 · belum terpenuhi", plus "dan 3 lainnya" when more notes are open than the preview shows. */
export function openNotesHint(preview: SatkerOpenNotePreview[], openNotes: number): string {
  if (openNotes === 0) return "Semua catatan terbit sudah Closed";
  const first = preview[0];
  if (!first) return "";
  const result = first.latestCheckResult ? CHECK_LOWER[first.latestCheckResult] : "belum dicek";
  const head = `${first.workUnitName ?? "Satker"} · ${result}`;
  const more = openNotes - 1;
  return more > 0 ? `${head} dan ${new Intl.NumberFormat("id-ID").format(more)} lainnya` : head;
}

/** Text for the deadline card: value and caption, also for a deadline that has passed or is not set. */
export function deadlineText(days: number | null): { label: string; value: string } {
  if (days === null) return { label: "Tenggat ADK", value: "-" };
  if (days < 0) return { label: "Lewat tenggat ADK", value: `${Math.abs(days)} hari` };
  if (days === 0) return { label: "Tenggat ADK", value: "Hari ini" };
  return { label: "Sisa hari ke tenggat ADK", value: `${days} hari` };
}
