import { Check } from "lucide-react";
import { ConfirmDialog } from "../../ui";
import { formatNum, type SelectionSummary } from "./logic";

const MAX_TITLES = 3;

export interface BulkApproveDialogProps {
  open: boolean;
  selection: SelectionSummary;
  /** Name shown in "tercatat atas nama ...". */
  reviewerName: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** S8 · Setujui massal (MYYQx). Only notes whose automatic check is "terpenuhi" are listed; closing is the reviewer's act. */
export function BulkApproveDialog({ open, selection, reviewerName, busy, onConfirm, onCancel }: BulkApproveDialogProps) {
  const count = selection.approvable.length;
  const titles = selection.approvable.slice(0, MAX_TITLES).map((row) => row.title);
  const rest = count - titles.length;
  const lead = count === 1 ? "Catatan ini berubah menjadi Closed." : count === 2 ? "Kedua catatan berubah menjadi Closed." : "Semua catatan ini berubah menjadi Closed.";
  const skipped = selection.skipped.length;

  return (
    <ConfirmDialog
      open={open}
      title={`Setujui ${formatNum(count)} catatan yang terpenuhi?`}
      icon={Check}
      description={
        <>
          {lead} Hasil cek hanya usulan sistem. Penutupan tercatat atas nama {reviewerName} di audit log.
          {skipped > 0 && ` ${formatNum(skipped)} catatan terpilih lainnya tidak ikut karena hasil cek belum terpenuhi.`}
        </>
      }
      summary={<span title={selection.approvable.map((row) => row.title).join(" · ")}>{titles.join(" · ")}{rest > 0 ? ` · dan ${formatNum(rest)} lainnya` : ""}</span>}
      confirmLabel="Setujui dan tutup"
      confirmIcon={Check}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
