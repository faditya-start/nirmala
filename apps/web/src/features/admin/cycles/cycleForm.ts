/** Pure helpers for S12d Siklus. No app imports, so `node --test` can run cycleForm.test.ts. */

export interface CycleLike {
  fiscalYear: number;
  stage: "pagu" | "alokasi";
  adkDeadline: number | null;
  dipaIssuedAt: number | null;
}

/** Newest fiscal year first; within a year Alokasi (later stage) before Pagu. */
export function sortCycles<T extends CycleLike>(cycles: T[]): T[] {
  const rank = { alokasi: 0, pagu: 1 } as const;
  return [...cycles].sort((a, b) => b.fiscalYear - a.fiscalYear || rank[a.stage] - rank[b.stage]);
}

export interface CreateCycleForm {
  fiscalYear: string;
  stage: string;
  adkDeadline: string;
}

export type CreateCycleErrors = Partial<Record<keyof CreateCycleForm, string>>;

export function validateCycleForm(form: CreateCycleForm): CreateCycleErrors {
  const errors: CreateCycleErrors = {};
  if (!/^\d{4}$/.test(form.fiscalYear.trim())) errors.fiscalYear = "Isi tahun anggaran 4 digit, misalnya 2027.";
  else if (Number(form.fiscalYear) < 2000 || Number(form.fiscalYear) > 2100) errors.fiscalYear = "Tahun anggaran harus antara 2000 dan 2100.";
  if (form.stage !== "pagu" && form.stage !== "alokasi") errors.stage = "Pilih tahap.";
  if (form.adkDeadline && Number.isNaN(Date.parse(form.adkDeadline))) errors.adkDeadline = "Tanggal tidak valid.";
  return errors;
}

/** epoch ms -> "YYYY-MM-DD" in local time, for <input type="date">. */
export function toDateInput(value: number | null): string {
  if (value === null) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "YYYY-MM-DD" -> noon local epoch ms (noon avoids a shifted calendar day across time zones), or null. */
export function fromDateInput(value: string): number | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12).getTime();
}
