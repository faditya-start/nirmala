import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton } from "../../../ui";
import styles from "./ModalFrame.module.css";

export interface ModalFrameProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions: ReactNode;
}

/**
 * Dialog frame of the S3 designs (520 px: title + subtitle with a close button, body, footer actions).
 * Native <dialog>: focus is trapped, the page behind is inert, Escape closes and focus returns to the opener.
 * Candidate to promote to ui/ (ui/Dialog has the icon-box layout instead).
 */
export function ModalFrame({ open, onClose, title, subtitle, children, actions }: ModalFrameProps) {
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
      className={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <>
          <div className={styles.head}>
            <div className={styles.headText}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
            <IconButton icon={X} label="Tutup" onClick={onClose} />
          </div>
          <div className={styles.body}>{children}</div>
          <div className={styles.actions}>{actions}</div>
        </>
      )}
    </dialog>
  );
}
