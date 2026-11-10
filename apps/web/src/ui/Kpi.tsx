import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import styles from "./Kpi.module.css";

export interface ProgressBarProps {
  /** 0 to 1. */
  value: number;
  /** Accessible name, e.g. "Progres catatan". */
  label: string;
  /** Text equivalent, e.g. "2 dari 3 catatan closed". */
  valueText?: string;
  className?: string;
}

/** Jalur: 4 px track with an ink fill. Role progressbar so the value is not visual only. */
export function ProgressBar({ value, label, valueText, className }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuetext={valueText}
      className={cn(styles.track, className)}
    >
      <div className={styles.fill} style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}

export interface KpiCardProps {
  label: string;
  /** Big value, mono 30 px. */
  value: ReactNode;
  /** Small line below the value. */
  hint?: ReactNode;
  /** 0 to 1: shows the progress track under the card. */
  progress?: number;
  progressLabel?: string;
  className?: string;
}

/** KPI: 2 px ink top rule, label, mono value, hint, optional progress. No card chrome. */
export function KpiCard({ label, value, hint, progress, progressLabel, className }: KpiCardProps) {
  return (
    <div className={cn(styles.kpi, className)}>
      <div className={styles.label}>{label}</div>
      <div className={cn(styles.value, "num")}>{value}</div>
      {hint && <div className={styles.hint}>{hint}</div>}
      {progress !== undefined && <ProgressBar value={progress} label={progressLabel ?? label} />}
    </div>
  );
}
