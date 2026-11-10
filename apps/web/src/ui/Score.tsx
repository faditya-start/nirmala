import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { formatDecimal1 } from "../lib/format";
import { RuleChip, ScoreBadge, TagChip } from "./Badge";
import styles from "./Score.module.css";

/* ---------------------------------------------------------------- RuleCard */

export interface RuleDetail {
  label: string;
  value: ReactNode;
  /** Mono value (match text, expectation code). */
  mono?: boolean;
}

export interface RuleCardProps {
  /** R01 ... R08 */
  code: string;
  name: string;
  /** Rule category tag, e.g. "Efisiensi". */
  category?: string;
  /** Plain-language reason the rule fired; the reviewer can quote it in a note. */
  reason: ReactNode;
  /** Rows under the divider: Uraian cocok, Sumber, Ekspektasi bawaan. */
  details?: RuleDetail[];
  className?: string;
}

/** Kartu/Aturan: one fired rule with its reason and source. 3 px flag-colored top rule. */
export function RuleCard({ code, name, category, reason, details, className }: RuleCardProps) {
  return (
    <section className={cn(styles.ruleCard, className)} aria-label={`Aturan ${code}: ${name}`}>
      <div className={styles.flagRule} aria-hidden="true" />
      <div className={styles.ruleBody}>
        <header className={styles.ruleHead}>
          <RuleChip code={code} />
          <h3 className={styles.ruleName}>{name}</h3>
          {category && <TagChip>{category}</TagChip>}
        </header>
        <p className={styles.reason}>{reason}</p>
        {details && details.length > 0 && (
          <dl className={styles.details}>
            {details.map((detail) => (
              <div key={detail.label} className={styles.detailRow}>
                <dt>{detail.label}</dt>
                <dd className={cn(detail.mono && "mono")}>{detail.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- FactorRow */

export interface FactorRowProps {
  /** F1 ... F5 */
  code: string;
  name: string;
  /** Factor value 0-100. Ignored when `na`. */
  value?: number;
  /** Weight as percent, e.g. 30. */
  weight?: number;
  /** value x weight / 100. Computed when omitted. */
  contribution?: number;
  /** One-line explanation. */
  explanation: ReactNode;
  /** Data is not available: shows "Data tidak tersedia" and an empty track (Faktor/Baris-NA). */
  na?: boolean;
  className?: string;
}

/** Faktor/Baris and Faktor/Baris-NA: code, name, value x weight = contribution, bar, explanation. */
export function FactorRow({ code, name, value = 0, weight = 0, contribution, explanation, na, className }: FactorRowProps) {
  const result = contribution ?? (value * weight) / 100;
  return (
    <div className={cn(styles.factor, na && styles.factorNa, className)}>
      <div className={styles.factorTitle}>
        <span className={cn(styles.factorCode, "num")}>{code}</span>
        <span className={styles.factorName}>{name}</span>
        {na ? (
          <span className={styles.na}>
            <CircleHelp size={13} aria-hidden="true" />
            Data tidak tersedia
          </span>
        ) : (
          <>
            <span className={cn(styles.factorNumber, "num")}>{value}</span>
            <span className={cn(styles.factorNumber, "num")}>× {weight}%</span>
            <span className={cn(styles.factorResult, "num")}>= {formatDecimal1(result)}</span>
          </>
        )}
      </div>
      <div
        className={styles.bar}
        role="meter"
        aria-label={`Nilai ${code}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={na ? undefined : value}
        aria-valuetext={na ? "Data tidak tersedia" : undefined}
      >
        {!na && <div className={styles.barFill} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />}
      </div>
      <p className={styles.factorExplanation}>{explanation}</p>
    </div>
  );
}

/* ---------------------------------------------------------- ScoreBreakdown */

export interface ScoreBreakdownProps {
  /** Heading, e.g. "Rincian skor · pakaian seragam hari besar". */
  title: string;
  /** Total score 0-100. */
  score: number;
  children: ReactNode;
  className?: string;
}

/** Rincian skor: header with the total score, then FactorRow children. */
export function ScoreBreakdown({ title, score, children, className }: ScoreBreakdownProps) {
  return (
    <section className={cn(styles.breakdown, className)} aria-label={title}>
      <header className={styles.breakdownHead}>
        <h3 className={styles.breakdownTitle}>{title}</h3>
        <ScoreBadge score={score} />
      </header>
      {children}
    </section>
  );
}
