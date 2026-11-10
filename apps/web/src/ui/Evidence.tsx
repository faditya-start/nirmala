import { ArrowRight, CircleX, GitCompare, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { CheckResultBadge, TagChip, type CheckResult } from "./Badge";
import styles from "./Evidence.module.css";

export type EvidenceState = "berubah" | "tetap" | "tidak_berubah";

export interface EvidenceRowProps {
  /** Field name, e.g. "Akun", "Total". */
  field: string;
  /**
   * berubah: before -> after, highlighted (Bukti/Baris).
   * tetap: just `value` with a "Tetap" tag (Bukti/BarisTetap).
   * tidak_berubah: `value` with a red "Tidak berubah" badge (expectation not met).
   */
  state: EvidenceState;
  before?: ReactNode;
  after?: ReactNode;
  value?: ReactNode;
  /** Hide the trailing tag. */
  hideTag?: boolean;
  className?: string;
}

/** Bukti/Baris: one field of the before -> after proof. The changed field is highlighted and tagged in text. */
export function EvidenceRow({ field, state, before, after, value, hideTag, className }: EvidenceRowProps) {
  return (
    <div className={cn(styles.row, state === "berubah" && styles.changed, className)} role="group" aria-label={field}>
      <span className={styles.field}>{field}</span>
      {state === "berubah" ? (
        <>
          <span className={cn(styles.before, "num")}>{before}</span>
          <ArrowRight size={14} aria-label="menjadi" className={styles.arrow} />
          <span className={cn(styles.after, "num")}>{after}</span>
        </>
      ) : (
        <span className={cn(state === "tidak_berubah" ? styles.after : styles.valueMuted, "num")}>{value}</span>
      )}
      {!hideTag && (
        <span className={styles.tag}>
          {state === "berubah" && <TagChip>Berubah</TagChip>}
          {state === "tetap" && <TagChip>Tetap</TagChip>}
          {state === "tidak_berubah" && (
            <span className={styles.notChanged}>
              <CircleX size={13} aria-hidden="true" />
              Tidak berubah
            </span>
          )}
        </span>
      )}
    </div>
  );
}

export interface EvidenceCardProps {
  /** Default "Bukti cek". Include the snapshot, e.g. "Bukti cek · snapshot v2 Revisi". */
  title?: string;
  result: CheckResult;
  /** EvidenceRow children. */
  children?: ReactNode;
  /** Replace the default footnote. */
  footnote?: ReactNode;
  className?: string;
}

/** Bukti/Kartu: header with the automatic check result, evidence rows, footnote that the system only proposes. */
export function EvidenceCard({
  title = "Bukti cek",
  result,
  children,
  footnote = "Ini usulan sistem. Catatan hanya ditutup setelah reviewer menyetujui.",
  className
}: EvidenceCardProps) {
  return (
    <section className={cn(styles.card, className)} aria-label={title}>
      <header className={styles.head}>
        <GitCompare size={15} aria-hidden="true" />
        <h3 className={styles.headTitle}>{title}</h3>
        <CheckResultBadge result={result} />
      </header>
      {children && <div className={styles.rows}>{children}</div>}
      <footer className={styles.foot}>
        <Info size={13} aria-hidden="true" className={styles.footIcon} />
        <p>{footnote}</p>
      </footer>
    </section>
  );
}
