import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Usually one Button or ButtonLink. */
  action?: ReactNode;
  /**
   * card: bordered box for "no data" inside a screen (Kosong/Keadaan).
   * page: borderless, larger, for whole-page states such as Akses ditolak.
   */
  variant?: "card" | "page";
  className?: string;
}

/** Kosong/Keadaan: icon box, title, one or two plain sentences, one action. */
export function EmptyState({ icon: Icon = Inbox, title, description, action, variant = "card", className }: EmptyStateProps) {
  return (
    <div className={cn(styles.empty, variant === "page" ? styles.page : styles.card, className)}>
      <div className={styles.iconBox} aria-hidden="true">
        <Icon size={20} />
      </div>
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {action}
    </div>
  );
}
