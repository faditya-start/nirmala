import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";
import styles from "./Breadcrumb.module.css";

export interface CrumbProps {
  /** Renders a link when given. */
  to?: string;
  /** The current page: bold and aria-current="page". */
  current?: boolean;
  children: ReactNode;
}

/** Crumb and Crumb/Aktif. */
export function Crumb({ to, current, children }: CrumbProps) {
  if (current) {
    return (
      <span className={cn(styles.crumb, styles.current)} aria-current="page">
        {children}
      </span>
    );
  }
  return to ? (
    <Link to={to} className={cn(styles.crumb, styles.link)}>
      {children}
    </Link>
  ) : (
    <span className={styles.crumb}>{children}</span>
  );
}

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export interface BreadcrumbProps {
  /** Last item is the current page. */
  items: BreadcrumbItem[];
  className?: string;
}

/** Jejak: "Reviu > Risk Triage". Separator icons are decorative. */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Jejak halaman" className={className}>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className={styles.item}>
              {index > 0 && <ChevronRight size={14} aria-hidden="true" className={styles.separator} />}
              <Crumb to={last ? undefined : item.to} current={last}>
                {item.label}
              </Crumb>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
