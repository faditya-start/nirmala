import { Check, Lock, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button, type ButtonVariant } from "./Button";
import styles from "./Dialog.module.css";

export interface DialogProps {
  open: boolean;
  /** Called on Escape, backdrop click and the Batal button. */
  onClose: () => void;
  title: string;
  /** Icon in the 36 px box above the title. */
  icon?: LucideIcon;
  /** Body content. */
  children?: ReactNode;
  /** Footer actions, right aligned (use Button). */
  actions?: ReactNode;
  /** md = 460 px (designed), lg = 640 px for forms such as Impor CSV. */
  size?: "md" | "lg";
  /** Close when the backdrop is clicked. Turn off while a request is running. */
  dismissible?: boolean;
  className?: string;
}

/**
 * Modal dialog on the native <dialog> element: focus is trapped, the page behind is inert,
 * Escape closes, and focus returns to the opener. role="dialog" + aria-modal come with showModal().
 */
export function Dialog({ open, onClose, title, icon: Icon, children, actions, size = "md", dismissible = true, className }: DialogProps) {
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
      className={cn(styles.dialog, size === "lg" && styles.lg, className)}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <>
          <div className={styles.body}>
            {Icon && (
              <div className={styles.iconBox} aria-hidden="true">
                <Icon size={18} />
              </div>
            )}
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {children}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </>
      )}
    </dialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Plain-language consequence of confirming. */
  description: ReactNode;
  /** Mono summary box, e.g. "Ditjen Contoh A · TA 2026 · tahap alokasi". */
  summary?: ReactNode;
  icon?: LucideIcon;
  confirmLabel?: string;
  confirmIcon?: LucideIcon;
  cancelLabel?: string;
  /** utama for normal confirms, bahaya for destructive ones. */
  tone?: Extract<ButtonVariant, "utama" | "bahaya">;
  /** Request running: confirm shows a spinner and the dialog cannot be dismissed. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Dialog/Konfirmasi: icon, title, consequence text, optional mono summary, Batal + confirm. */
export function ConfirmDialog({
  open,
  title,
  description,
  summary,
  icon = Lock,
  confirmLabel = "Ya, lanjutkan",
  confirmIcon = Check,
  cancelLabel = "Batal",
  tone = "utama",
  busy,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      icon={icon}
      dismissible={!busy}
      actions={
        <>
          <Button variant="sekunder" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone} icon={confirmIcon} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className={styles.description}>{description}</p>
      {summary && <div className={cn(styles.summary, "mono")}>{summary}</div>}
    </Dialog>
  );
}
