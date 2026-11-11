/** Pure helpers for the Dashboard (S2). No React and no relative imports so `node --test` can run them. */
import type { CheckResult, DashboardActionCard, DashboardOrganizationRow } from "@nirmala/shared";

const integer = new Intl.NumberFormat("id-ID");

/** "0,9% dari 12.702 item dianalisis"; null when nothing was analysed. */
export function flaggedShareText(flagged: number, analyzed: number): string | null {
  if (analyzed <= 0) return null;
  const text = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format((flagged / analyzed) * 100);
  return `${text}% dari ${integer.format(analyzed)} item dianalisis`;
}

/** "3 hari", "Lewat 2 hari", "Hari ini"; "—" without a deadline. */
export function daysValue(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "Hari ini";
  if (days < 0) return `Lewat ${integer.format(Math.abs(days))} hari`;
  return `${integer.format(days)} hari`;
}

export interface RowProgress {
  /** 0..1, or null when there is nothing to measure. */
  ratio: number | null;
  text: string;
}

/** "Progres catatan" cell of the per-eselon table. */
export function rowProgress(row: DashboardOrganizationRow): RowProgress {
  if (!row.snapshot) return { ratio: null, text: "Belum ada snapshot" };
  if (row.notesIssued === 0) {
    return { ratio: 0, text: row.chrStatus === "draft" || row.notesDraft > 0 ? "CHR draf, belum terbit" : "Belum ada catatan terbit" };
  }
  return { ratio: Math.min(1, row.notesClosed / row.notesIssued), text: `${integer.format(row.notesClosed)} dari ${integer.format(row.notesIssued)} catatan closed` };
}

export function triageHref(organizationUnitId: string): string {
  return `/triage?organizationUnitId=${encodeURIComponent(organizationUnitId)}`;
}

const CHECK_TEXT: Record<CheckResult, string> = {
  terpenuhi: "terpenuhi",
  belum_terpenuhi: "belum terpenuhi",
  data_tidak_cukup: "data tidak cukup",
  item_tidak_ditemukan: "item tidak ditemukan"
};

function waiting(days: number): string {
  return days <= 0 ? "sejak hari ini" : `${integer.format(days)} hari`;
}

/** Sentence of an action card (design: "Outsourcing jasa kebersihan · Satker Contoh 02. Menunggu keputusan 5 hari. Hasil cek: akun belum berubah."). */
export function actionBody(card: DashboardActionCard, issuedDate: (epochMs: number) => string): string {
  if (card.kind === "chr_draf") {
    if (card.count > 0) return `Ada ${integer.format(card.count)} CHR draf yang belum terbit.`;
    const last = card.lastIssuedChr;
    if (!last) return "Tidak ada CHR draf.";
    return `Tidak ada CHR draf.${last.documentNumber ? ` CHR ${last.documentNumber} sudah terbit` : " CHR sudah terbit"} pada ${issuedDate(last.issuedAt)}.`;
  }
  const note = card.oldestNote;
  if (!note) return `${integer.format(card.count)} catatan menunggu.`;
  const head = `${note.title}${note.workUnitName ? ` · ${note.workUnitName}` : ""}.`;
  const days = note.waitingDays;
  const check = note.latestCheckResult ? ` Hasil cek: ${CHECK_TEXT[note.latestCheckResult]}.` : "";
  switch (card.kind) {
    case "perlu_verifikasi":
      return `${head} Menunggu keputusan ${waiting(days)}.${check}`;
    case "menunggu_revisi":
      return `${head} Menunggu revisi ${waiting(days)}.${check}`;
    case "belum_terpenuhi":
      return `${head} Hasil cek terakhir belum terpenuhi. Menunggu tindak lanjut ${waiting(days)}.`;
    case "tanggapan_belum_diisi":
      return `${head} Tanggapan belum diisi ${waiting(days)}.`;
  }
}

export function actionCountText(card: DashboardActionCard): string {
  return card.kind === "chr_draf" ? `${integer.format(card.count)} CHR` : `${integer.format(card.count)} catatan`;
}

export function actionButtonLabel(card: DashboardActionCard): string | null {
  switch (card.kind) {
    case "chr_draf":
      return card.count > 0 ? "Buka CHR" : null;
    case "tanggapan_belum_diisi":
      return "Isi tanggapan";
    default:
      return "Buka di Smart Tracker";
  }
}
