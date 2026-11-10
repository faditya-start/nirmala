import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../../ui";
import { formatNumber } from "../../../lib/format";
import styles from "./Pager.module.css";

export interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  noun?: string;
}

/** Kaki tabel Risk Triage (oHui1): "Menampilkan 1–11 dari 12.702 item", "Halaman 1 dari 1.155", Sebelumnya, Berikutnya. */
export function Pager({ page, pageSize, total, pageCount, onPageChange, noun = "item" }: PagerProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={styles.footer}>
      <p className={styles.count}>{total === 0 ? `Tidak ada ${noun}` : `Menampilkan ${formatNumber(from)}–${formatNumber(to)} dari ${formatNumber(total)} ${noun}`}</p>
      <nav className={styles.pages} aria-label="Halaman daftar">
        <span className={styles.position} aria-live="polite">
          Halaman {formatNumber(page)} dari {formatNumber(pageCount)}
        </span>
        <Button icon={ChevronLeft} onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Sebelumnya
        </Button>
        <Button icon={ChevronRight} onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>
          Berikutnya
        </Button>
      </nav>
    </div>
  );
}
