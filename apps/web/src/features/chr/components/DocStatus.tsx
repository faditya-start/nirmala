import { Lock } from "lucide-react";
import type { ChrStatus, NoteStatus, NoteStatusCounts } from "@nirmala/shared";
import { formatNumber } from "../../../lib/format";
import { StatusBadge } from "../../../ui";
import { CHR_STATUS_LABEL, NOTE_STATUS_ORDER } from "../logic";
import styles from "./DocStatus.module.css";

/** Document status pill: draft = neutral, issued = dark with a lock, completed = green. Icon + text, never color alone. */
export function DocStatusPill({ status }: { status: ChrStatus }) {
  if (status === "issued") {
    return (
      <span className={styles.locked}>
        <Lock size={12} aria-hidden="true" />
        <span>{CHR_STATUS_LABEL.issued}</span>
      </span>
    );
  }
  return <StatusBadge status={status === "draft" ? "draf" : "closed"}>{CHR_STATUS_LABEL[status]}</StatusBadge>;
}

/** "Catatan per status": a badge and a mono count per status; zero counts are dimmed. */
export function StatusCounts({ counts }: { counts: NoteStatusCounts }) {
  return (
    <div className={styles.counts} role="group" aria-label="Catatan per status">
      <span className={styles.countsLabel} aria-hidden="true">
        Catatan per status
      </span>
      {NOTE_STATUS_ORDER.map((status: NoteStatus) => (
        <div key={status} className={styles.count} data-zero={counts[status] === 0 || undefined}>
          <StatusBadge status={status} />
          <span className="num">{formatNumber(counts[status])}</span>
        </div>
      ))}
    </div>
  );
}
