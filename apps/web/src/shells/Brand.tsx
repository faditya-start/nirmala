import { cn } from "../lib/cn";
import styles from "./Brand.module.css";

/** Monogram "N" in a graphite square, as in the design. Decorative: the wordmark carries the name. */
export function Monogram({ className }: { className?: string }) {
  return (
    <span className={cn(styles.monogram, className)} aria-hidden="true">
      N
    </span>
  );
}
