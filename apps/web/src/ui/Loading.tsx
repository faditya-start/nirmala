import { cn } from "../lib/cn";
import styles from "./Loading.module.css";

export interface LoadingProps {
  /** Text announced to screen readers and shown next to the spinner. Default "Memuat…". */
  label?: string;
  /** Centered block with padding, for route-level fallbacks. */
  block?: boolean;
  className?: string;
}

/** Spinner + text for loading states. role="status" so the change is announced. */
export function Loading({ label = "Memuat…", block, className }: LoadingProps) {
  return (
    <div role="status" className={cn(styles.loading, block && styles.block, className)}>
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
