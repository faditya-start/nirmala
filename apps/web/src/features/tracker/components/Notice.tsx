import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./Notice.module.css";

export type NoticeTone = "sukses" | "galat" | "info";

const ICON: Record<NoticeTone, LucideIcon> = { sukses: CircleCheck, galat: CircleAlert, info: Info };

export interface NoticeProps {
  tone: NoticeTone;
  children: ReactNode;
  /** Shows a close button. */
  onDismiss?: () => void;
  /** Extra action, usually a "Coba lagi" button. */
  action?: ReactNode;
}

/**
 * Inline message under a page header. Errors use role="alert", the rest role="status", so the change is announced.
 * The icon and a lead word in the text carry the meaning together with the color.
 */
export function Notice({ tone, children, onDismiss, action }: NoticeProps) {
  const Icon = ICON[tone];
  return (
    <div className={styles.notice} data-tone={tone} role={tone === "galat" ? "alert" : "status"}>
      <Icon size={15} aria-hidden="true" className={styles.icon} />
      <p className={styles.text}>{children}</p>
      {action}
      {onDismiss && (
        <button type="button" className={styles.close} onClick={onDismiss} aria-label="Tutup pesan">
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
