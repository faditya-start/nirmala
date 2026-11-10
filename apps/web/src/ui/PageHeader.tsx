import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import styles from "./PageHeader.module.css";

export interface PageHeaderProps {
  /** Screen title (h1, 28 px / 600). */
  title: string;
  /** One line under the title, e.g. "Ditjen Contoh A · TA 2026 Alokasi · data per 9 Nov 2026". */
  subtitle?: ReactNode;
  /** Buttons aligned right on the title baseline. */
  actions?: ReactNode;
  className?: string;
}

/** Judul halaman. */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cn(styles.header, className)}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}

export interface SectionHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** h2 by default. */
  level?: 2 | 3;
  className?: string;
}

/** Judul bagian: 14 px / 600 with a 12 px description. */
export function SectionHeader({ title, description, actions, level = 2, className }: SectionHeaderProps) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={cn(styles.section, className)}>
      <div className={styles.sectionText}>
        <Heading className={styles.sectionTitle}>{title}</Heading>
        {description && <p className={styles.sectionDescription}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
