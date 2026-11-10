import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import styles from "./Timeline.module.css";

export type TimelineTone = "default" | "menunggu" | "verif" | "justif" | "closed" | "flag";

export interface TimelineItemProps {
  title: string;
  /** Already formatted, e.g. formatDateTime(...) -> "3 Nov 2026 · 14.20". */
  time?: string;
  description?: ReactNode;
  /** Dot color, taken from the status tokens. Words in title/description carry the meaning too. */
  tone?: TimelineTone;
  /** Hollow dot: a step that has not happened yet. */
  pending?: boolean;
  /** Last item draws no connector line. */
  last?: boolean;
}

/** Timeline/Butir: dot + connector, title, mono timestamp, description. */
export function TimelineItem({ title, time, description, tone = "default", pending, last }: TimelineItemProps) {
  return (
    <li className={styles.item}>
      <div className={styles.marker} aria-hidden="true">
        <span className={cn(styles.dot, pending && styles.pending)} data-tone={tone} />
        {!last && <span className={styles.line} />}
      </div>
      <div className={cn(styles.body, last && styles.bodyLast)}>
        <div className={styles.titleRow}>
          <h4 className={styles.title}>
            {title}
            {pending && <span className="sr-only"> (belum terjadi)</span>}
          </h4>
          {time && <time className={cn(styles.time, "num")}>{time}</time>}
        </div>
        {description && <p className={styles.description}>{description}</p>}
      </div>
    </li>
  );
}

/** Ordered list of TimelineItem. */
export function Timeline({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <ol aria-label={label} className={cn(styles.timeline, className)}>
      {children}
    </ol>
  );
}
