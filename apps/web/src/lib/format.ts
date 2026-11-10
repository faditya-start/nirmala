const idNumber = new Intl.NumberFormat("id-ID");
const idDecimal1 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** 1250000000 -> "1.250.000.000" (no currency prefix; columns say "(Rp)"). */
export function formatNumber(value: number): string {
  return idNumber.format(value);
}

/** 30 -> "30,0" (score contribution style). */
export function formatDecimal1(value: number): string {
  return idDecimal1.format(value);
}

export function formatRupiah(value: number): string {
  return `Rp ${idNumber.format(value)}`;
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(ratio * 100)}%`;
}

export function toDate(input: string | number | Date | null | undefined): Date | null {
  if (input === null || input === undefined || input === "") return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12 Nov 2026" */
export function formatDate(input: string | number | Date | null | undefined): string {
  const date = toDate(input);
  if (!date) return "-";
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

/** "12 Nov" */
export function formatDayMonth(input: string | number | Date | null | undefined): string {
  const date = toDate(input);
  if (!date) return "-";
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** "3 Nov 2026 · 14.20" (timeline timestamps) */
export function formatDateTime(input: string | number | Date | null | undefined): string {
  const date = toDate(input);
  if (!date) return "-";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${formatDate(date)} · ${hh}.${mm}`;
}

/** Whole calendar days from `from` (default now) to `to`; negative when past. */
export function daysUntil(to: string | number | Date | null | undefined, from: Date = new Date()): number | null {
  const target = toDate(to);
  if (!target) return null;
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** "sisa 3 hari" / "hari ini" / "lewat 2 hari" */
export function formatCountdown(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "hari ini";
  if (days > 0) return `sisa ${days} hari`;
  return `lewat ${Math.abs(days)} hari`;
}
