import {
  BadgeCheck,
  Ban,
  Check,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleX,
  FileText,
  Flag,
  Hourglass,
  ScanSearch,
  SearchX,
  type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import styles from "./Badge.module.css";

/* ---------------------------------------------------------------- Pill */

type Tone = "draf" | "menunggu" | "verif" | "justif" | "closed" | "flag" | "outline" | "sunken";

interface PillProps {
  tone: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}

/** Shared shape of every status-like badge: 12 px label, 13 px icon, 4 px radius, tone from tokens. */
function Pill({ tone, icon: Icon, children, className }: PillProps) {
  return (
    <span className={cn(styles.pill, styles[tone], className)}>
      {Icon && <Icon size={13} aria-hidden="true" className={styles.icon} />}
      <span>{children}</span>
    </span>
  );
}

/* --------------------------------------------------------- StatusBadge */

/** Note status (source of truth is the note) plus the flag and "siap diajukan" badges. */
export type NoteStatus = "draf" | "menunggu_revisi" | "perlu_verifikasi" | "dijustifikasi" | "closed";
export type StatusKey = NoteStatus | "flag" | "siap_diajukan";

const STATUS: Record<StatusKey, { tone: Tone; icon: LucideIcon; label: string }> = {
  draf: { tone: "draf", icon: CircleDashed, label: "Draf" },
  menunggu_revisi: { tone: "menunggu", icon: Hourglass, label: "Menunggu Revisi" },
  perlu_verifikasi: { tone: "verif", icon: ScanSearch, label: "Perlu Verifikasi" },
  dijustifikasi: { tone: "justif", icon: FileText, label: "Dijustifikasi" },
  closed: { tone: "closed", icon: CircleCheck, label: "Closed" },
  flag: { tone: "flag", icon: Flag, label: "Flag aturan" },
  siap_diajukan: { tone: "closed", icon: BadgeCheck, label: "Siap diajukan" }
};

export const STATUS_LABEL: Record<StatusKey, string> = Object.fromEntries(
  Object.entries(STATUS).map(([key, value]) => [key, value.label])
) as Record<StatusKey, string>;

export interface StatusBadgeProps {
  status: StatusKey;
  /** Replace the default label, e.g. "Kena aturan" for `flag`. */
  children?: ReactNode;
  className?: string;
}

/** Status/Draf, Menunggu, Verifikasi, Justifikasi, Closed, Flag, SiapDiajukan. Icon + text, never color alone. */
export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  const spec = STATUS[status];
  return (
    <Pill tone={spec.tone} icon={spec.icon} className={className}>
      {children ?? spec.label}
    </Pill>
  );
}

/* ----------------------------------------------------- CheckResultBadge */

export type CheckResult = "terpenuhi" | "belum_terpenuhi" | "data_tidak_cukup" | "item_tidak_ditemukan";

const CHECK: Record<CheckResult, { tone: Tone; icon: LucideIcon; label: string }> = {
  terpenuhi: { tone: "closed", icon: Check, label: "Terpenuhi" },
  // "Belum terpenuhi" is red (st-warn), not orange, so it never clashes with score "sedang".
  belum_terpenuhi: { tone: "flag", icon: CircleX, label: "Belum terpenuhi" },
  data_tidak_cukup: { tone: "draf", icon: CircleHelp, label: "Data tidak cukup" },
  item_tidak_ditemukan: { tone: "draf", icon: SearchX, label: "Item tidak ditemukan" }
};

export const CHECK_RESULT_LABEL: Record<CheckResult, string> = Object.fromEntries(
  Object.entries(CHECK).map(([key, value]) => [key, value.label])
) as Record<CheckResult, string>;

export interface CheckResultBadgeProps {
  result: CheckResult;
  className?: string;
}

/** Hasil cek otomatis. The system only proposes; the reviewer closes the note. */
export function CheckResultBadge({ result, className }: CheckResultBadgeProps) {
  const spec = CHECK[result];
  return (
    <Pill tone={spec.tone} icon={spec.icon} className={className}>
      {spec.label}
    </Pill>
  );
}

/* -------------------------------------------------------- DecisionBadge */

export type Decision = "belum_ditinjau" | "draf_di_chr" | "dismiss";

const DECISION: Record<Decision, { tone: Tone; icon: LucideIcon; label: string }> = {
  belum_ditinjau: { tone: "outline", icon: Circle, label: "Belum ditinjau" },
  draf_di_chr: { tone: "draf", icon: CircleDashed, label: "Draf di CHR" },
  dismiss: { tone: "sunken", icon: Ban, label: "Dismiss" }
};

export const DECISION_LABEL: Record<Decision, string> = Object.fromEntries(
  Object.entries(DECISION).map(([key, value]) => [key, value.label])
) as Record<Decision, string>;

export interface DecisionBadgeProps {
  decision: Decision;
  className?: string;
}

/** Keputusan item di Risk Triage: Belum ditinjau, Draf di CHR, Dismiss. */
export function DecisionBadge({ decision, className }: DecisionBadgeProps) {
  const spec = DECISION[decision];
  return (
    <Pill tone={spec.tone} icon={spec.icon} className={className}>
      {spec.label}
    </Pill>
  );
}

/* ----------------------------------------------------------- ScoreBadge */

export type ScoreCategory = "tinggi" | "sedang" | "rendah";

/** Thresholds from the design: tinggi >= 70, sedang >= 35, rendah < 35. */
export function scoreCategory(score: number): ScoreCategory {
  if (score >= 70) return "tinggi";
  if (score >= 35) return "sedang";
  return "rendah";
}

const SCORE_LABEL: Record<ScoreCategory, string> = { tinggi: "Tinggi", sedang: "Sedang", rendah: "Rendah" };

export interface ScoreBadgeProps {
  /** 0-100. */
  score: number;
  /** Override the category derived from the score. */
  category?: ScoreCategory;
  className?: string;
}

/** Skor/Tinggi, Sedang, Rendah: a 3 x 18 px marker in the score color, mono number, category word. */
export function ScoreBadge({ score, category, className }: ScoreBadgeProps) {
  const level = category ?? scoreCategory(score);
  return (
    <span className={cn(styles.score, className)} data-level={level}>
      <span className={styles.marker} aria-hidden="true" />
      <span className={cn(styles.scoreNumber, "num")}>{score}</span>
      <span className={styles.scoreWord}>{SCORE_LABEL[level]}</span>
    </span>
  );
}

/* ----------------------------------------------------------- RuleChip */

export interface RuleChipProps {
  /** R01 ... R08 */
  code: string;
  className?: string;
}

/** Chip/Aturan: red flag chip with the rule code in mono. Title carries the meaning for pointer users. */
export function RuleChip({ code, className }: RuleChipProps) {
  return (
    <span className={cn(styles.chip, styles.rule, className)}>
      <span className="sr-only">Aturan </span>
      <span className={styles.ruleCode}>{code}</span>
    </span>
  );
}

/* ----------------------------------------------------------- TagChip */

export interface TagChipProps {
  children: ReactNode;
  className?: string;
}

/** Chip/Tag: neutral 12 px tag for categories and change markers (Baru, Berubah, Tetap). */
export function TagChip({ children, className }: TagChipProps) {
  return <span className={cn(styles.chip, styles.tag, className)}>{children}</span>;
}
