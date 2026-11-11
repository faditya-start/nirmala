import type { ReportSummaryResponse } from "@nirmala/shared";
import { formatDate, formatDayMonth, formatNumber } from "../../lib/format";

/** Hint under "Catatan terbit": CHR numbers and issue date. */
export function issuedHint(docs: ReportSummaryResponse["chrDocuments"]): string {
  if (docs.length === 0) return "Belum ada CHR terbit";
  const label = (doc: (typeof docs)[number]) => (doc.documentNumber ? `CHR ${doc.documentNumber}` : "CHR tanpa nomor");
  if (docs.length === 1) return `${label(docs[0])} · terbit ${formatDate(docs[0].issuedAt)}`;
  const last = docs[docs.length - 1];
  return `${formatNumber(docs.length)} CHR · terakhir ${label(last).replace("CHR ", "")} · terbit ${formatDate(last.issuedAt)}`;
}

/** Hint under "Closed sebelum diajukan". */
export function closedHint(summary: Pick<ReportSummaryResponse, "notesIssued" | "notesClosed" | "isFinal" | "dataAsOf">): string {
  if (summary.notesIssued === 0) return "Belum ada catatan terbit pada cakupan ini.";
  const asOf = summary.dataAsOf ? `, per ${formatDayMonth(summary.dataAsOf)}` : "";
  const tail = summary.isFinal ? "Angka final." : "Angka final setelah ADK diajukan.";
  return `${formatNumber(summary.notesClosed)} dari ${formatNumber(summary.notesIssued)} catatan${asOf}. ${tail}`;
}
