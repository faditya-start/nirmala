import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/cn";
import { formatNumber } from "../lib/format";
import { pageCountFor, pageRange } from "../lib/paging";
import { Button } from "./Button";
import styles from "./Pager.module.css";

export interface PagerProps {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  /** Defaults to ceil(total / pageSize). */
  pageCount?: number;
  onPageChange: (page: number) => void;
  /** Noun after the count: "item", "catatan". */
  noun?: string;
  className?: string;
}

/**
 * Table footer of the Risk Triage frame (oHui1): "Menampilkan 1-11 dari 12.702 item", "Halaman 1 dari 1.155",
 * Sebelumnya, Berikutnya. Use it for very long lists where numbered pages are noise; keep `Pagination` for short ones.
 */
export function Pager({ page, pageSize, total, pageCount, onPageChange, noun = "item", className }: PagerProps) {
  const count = pageCount ?? pageCountFor(total, pageSize);
  const { from, to } = pageRange(page, pageSize, total);
  return (
    <div className={cn(styles.footer, className)}>
      <p className={styles.count}>{total === 0 ? `Tidak ada ${noun}` : `Menampilkan ${formatNumber(from)}–${formatNumber(to)} dari ${formatNumber(total)} ${noun}`}</p>
      <nav className={styles.pages} aria-label="Halaman daftar">
        <span className={styles.position} aria-live="polite">
          Halaman {formatNumber(page)} dari {formatNumber(count)}
        </span>
        <Button icon={ChevronLeft} onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Sebelumnya
        </Button>
        <Button icon={ChevronRight} onClick={() => onPageChange(page + 1)} disabled={page >= count}>
          Berikutnya
        </Button>
      </nav>
    </div>
  );
}
