import { Check, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, IconButton } from "../../../ui";
import styles from "./SidePanel.module.css";

export interface SidePanelProps {
  open: boolean;
  /** Esc, scrim click and the close buttons. Not called while `busy`. */
  onClose: () => void;
  title: string;
  /** Mono line under the title ("Jenis keyword_wrong_account"). */
  subtitle?: ReactNode;
  children: ReactNode;
  /** Primary action label (check icon). */
  submitLabel: string;
  cancelLabel?: string;
  /** Request running: submit shows a spinner, nothing can close the panel. */
  busy?: boolean;
  /** Unsaved changes: a scrim click is ignored so edits are not lost by accident (Esc and Batal still close). */
  dirty?: boolean;
  onSubmit: () => void;
}

/**
 * Right-hand edit panel (pFsNp, 500 px). Built on the native <dialog>: modal focus trap, inert page behind,
 * Escape closes, focus returns to the opener. Enters in 150 ms (slide + fade), none under prefers-reduced-motion.
 */
export function SidePanel({ open, onClose, title, subtitle, children, submitLabel, cancelLabel = "Batal", busy, dirty, onSubmit }: SidePanelProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={styles.panel}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy && !dirty) onClose();
      }}
    >
      {open && (
        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) onSubmit();
          }}
        >
          <header className={styles.header}>
            <div className={styles.headerText}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
            <IconButton icon={X} label="Tutup panel" onClick={onClose} disabled={busy} />
          </header>
          <div className={styles.body}>{children}</div>
          <footer className={styles.footer}>
            <Button variant="sekunder" icon={X} onClick={onClose} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button type="submit" variant="utama" icon={Check} loading={busy}>
              {submitLabel}
            </Button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
