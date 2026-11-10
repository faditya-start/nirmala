import { CircleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "../../../ui";
import styles from "./Alert.module.css";

/** Inline error (role=alert) with an optional dismiss button. Words plus icon, never color alone. */
export function Alert({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div role="alert" className={styles.alert}>
      <CircleAlert size={14} aria-hidden="true" className={styles.icon} />
      <p className={styles.text}>{children}</p>
      {onDismiss && <IconButton icon={X} label="Tutup pesan" onClick={onDismiss} />}
    </div>
  );
}
