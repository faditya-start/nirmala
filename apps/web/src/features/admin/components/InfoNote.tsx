import { Info } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./InfoNote.module.css";

/** Catatan/Info: white box with an info icon and one short paragraph (Catatan validasi, L4cke). */
export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className={styles.note}>
      <Info size={16} aria-hidden="true" className={styles.icon} />
      <p className={styles.text}>{children}</p>
    </div>
  );
}
