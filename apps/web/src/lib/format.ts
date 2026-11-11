const idNumber = new Intl.NumberFormat("id-ID");
const idDecimal1 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const DASH = "–";

/** True for numbers that can be formatted (not null, undefined, NaN or Infinity). */
function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 1250000000 -> "1.250.000.000" (no currency prefix; columns say "(Rp)"). null, undefined and NaN give "–". */
export function formatNumber(value: number | null | undefined): string {
  return isFiniteNumber(value) ? idNumber.format(value) : DASH;
}

/** 12.5 -> "12,5" with exactly `digits` decimals (id-ID uses a comma). */
export function formatDecimal(value: number | null | undefined, digits = 1): string {
  if (!isFiniteNumber(value)) return DASH;
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** 30 -> "30,0" (score contribution style). */
export function formatDecimal1(value: number | null | undefined): string {
  return isFiniteNumber(value) ? idDecimal1.format(value) : DASH;
}

/** 1250000 -> "Rp 1.250.000". */
export function formatRupiah(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `Rp ${idNumber.format(value)}` : DASH;
}

/** 0.275 -> "27,5%" with up to `digits` decimals (ratio in, percent out). */
export function formatPercent(ratio: number | null | undefined, digits = 0): string {
  return isFiniteNumber(ratio) ? `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(ratio * 100)}%` : DASH;
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

const MONTHS_LONG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "12 November 2026" (formal text, dialogs, print). */
export function formatDateLong(input: string | number | Date | null | undefined): string {
  const date = toDate(input);
  if (!date) return "-";
  return `${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** "14.20" (id-ID writes time with a dot). */
export function formatTime(input: string | number | Date | null | undefined): string {
  const date = toDate(input);
  if (!date) return "-";
  return `${String(date.getHours()).padStart(2, "0")}.${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Epoch ms -> "YYYY-MM-DD" for <input type="date"> (local calendar day). */
export function toDateInput(input: string | number | Date | null | undefined): string {
  const date = toDate(input);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** "3 Nov 2026 · 14.20" (timeline timestamps) */
export function formatDateTime(input: string | number | Date | null | undefined): string {
  const date = toDate(input);
  if (!date) return "-";
  return `${formatDate(date)} · ${formatTime(date)}`;
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
