import { SquarePen, Trash2 } from "lucide-react";
import type { ChrNoteDto } from "@nirmala/shared";
import { expectationSentence } from "../../../lib/expectation";
import { formatNumber } from "../../../lib/format";
import { CheckResultBadge, IconButton, RuleChip, StatusBadge } from "../../../ui";
import styles from "./NoteCard.module.css";

export interface NoteCardProps {
  note: ChrNoteDto;
  /** Edit and delete icons show only while the document is a draft and the server allows editing. */
  editable: boolean;
  /** Draft documents hold only Draf notes, so the status badge only appears once the CHR is issued. */
  showStatus?: boolean;
  /** Disables the icons while another request runs. */
  busy?: boolean;
  onEdit?: (note: ChrNoteDto) => void;
  onDelete?: (note: ChrNoteDto) => void;
}

/** One catatan row in the editor: number, title · Satker · account, text, rule / expectation / status chips. */
export function NoteCard({ note, editable, showStatus = true, busy, onEdit, onDelete }: NoteCardProps) {
  const meta = [note.workUnitName, note.accountCode].filter(Boolean);
  return (
    <li className={styles.row}>
      <span className={`${styles.number} num`}>{note.number}</span>
      <div className={styles.body}>
        <div className={styles.item}>
          <h3 className={styles.title}>{note.title}</h3>
          {meta.length > 0 && (
            <span className={styles.meta}>
              {meta.map((part, index) => (
                <span key={index}>
                  <span aria-hidden="true">· </span>
                  <span className={index === meta.length - 1 && note.accountCode ? "num" : undefined}>{part}</span>
                </span>
              ))}
            </span>
          )}
        </div>
        <p className={styles.text}>{note.text}</p>
        <div className={styles.marks}>
          {note.ruleCode && <RuleChip code={note.ruleCode} />}
          <span className={styles.expectation}>
            <span className={styles.expectationLabel}>Ekspektasi</span>
            <span className={styles.expectationValue}>{expectationSentence(note.expectation, formatNumber)}</span>
          </span>
          {showStatus && <StatusBadge status={note.status} />}
          {note.latestCheckResult && <CheckResultBadge result={note.latestCheckResult} />}
        </div>
      </div>
      {editable && (
        <div className={styles.actions}>
          <IconButton icon={SquarePen} label={`Ubah catatan ${note.number}`} disabled={busy} onClick={() => onEdit?.(note)} />
          <IconButton icon={Trash2} label={`Hapus catatan ${note.number}`} disabled={busy} onClick={() => onDelete?.(note)} />
        </div>
      )}
    </li>
  );
}
