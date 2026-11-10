import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { ComponentPropsWithRef, KeyboardEvent, ReactNode } from "react";
import { cn } from "../lib/cn";
import { formatNumber } from "../lib/format";
import styles from "./Table.module.css";

/**
 * Table primitives. Real <table> markup so assistive tech gets row/column semantics.
 *
 *   <TableFrame>
 *     <Table aria-label="Daftar item">
 *       <THead><tr><Th>Uraian</Th><Th align="right">Total (Rp)</Th></tr></THead>
 *       <tbody><Tr onActivate={open}><Td><CellTitle ... /></Td><Td align="right" numeric>48.600.000</Td></Tr></tbody>
 *     </Table>
 *     <Pagination ... />
 *   </TableFrame>
 */

export function TableFrame({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(styles.frame, className)}>{children}</div>;
}

export function Table({ className, ...rest }: ComponentPropsWithRef<"table">) {
  return (
    <div className={styles.scroll}>
      <table {...rest} className={cn(styles.table, className)} />
    </div>
  );
}

/** Tabel/Header: sunken background, 12 px medium labels, strong bottom line. */
export function THead(props: ComponentPropsWithRef<"thead">) {
  return <thead {...props} className={cn(styles.thead, props.className)} />;
}

export function TBody(props: ComponentPropsWithRef<"tbody">) {
  return <tbody {...props} />;
}

export type SortDirection = "asc" | "desc" | "none";

export interface ThProps extends Omit<ComponentPropsWithRef<"th">, "align"> {
  align?: "left" | "right" | "center";
  /** Makes the header a sort button. `none` = sortable but not sorted. */
  sort?: SortDirection;
  onSort?: () => void;
  /** Fixed column width, e.g. 150 or "150px". */
  width?: number | string;
}

export function Th({ align = "left", sort, onSort, width, className, children, style, ...rest }: ThProps) {
  const sortable = sort !== undefined;
  const ariaSort = sort === "asc" ? "ascending" : sort === "desc" ? "descending" : sortable ? "none" : undefined;
  const SortIcon = sort === "asc" ? ArrowUp : sort === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <th {...rest} scope="col" aria-sort={ariaSort} data-align={align} className={cn(styles.th, className)} style={{ width, ...style }}>
      {sortable ? (
        <button type="button" className={styles.sortButton} onClick={onSort}>
          {children}
          <SortIcon size={12} aria-hidden="true" />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export interface TrProps extends Omit<ComponentPropsWithRef<"tr">, "onClick"> {
  /** Selected row: light blue background, 3 px left line and (via SelectedMark) a check. */
  selected?: boolean;
  /** Makes the whole row clickable and keyboard operable (Enter / Space). Keep a real link in the row too. */
  onActivate?: () => void;
}

export function Tr({ selected, onActivate, className, onKeyDown, ...rest }: TrProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    onKeyDown?.(event);
    if (!onActivate || event.defaultPrevented || event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  }
  return (
    <tr
      {...rest}
      tabIndex={onActivate ? 0 : rest.tabIndex}
      onClick={onActivate ? (event) => !(event.target as HTMLElement).closest("a,button,input,select,textarea,label") && onActivate() : undefined}
      onKeyDown={handleKeyDown}
      data-selected={selected || undefined}
      data-interactive={onActivate ? "" : undefined}
      className={cn(styles.tr, className)}
    />
  );
}

export interface TdProps extends Omit<ComponentPropsWithRef<"td">, "align"> {
  align?: "left" | "right" | "center";
  /** Mono, tabular figures. Use for money, counts and codes. */
  numeric?: boolean;
  /** Fixed column width. */
  width?: number | string;
}

export function Td({ align, numeric, width, className, style, ...rest }: TdProps) {
  return (
    <td
      {...rest}
      data-align={align ?? (numeric ? "right" : "left")}
      className={cn(styles.td, numeric && "num", className)}
      style={{ width, ...style }}
    />
  );
}

/** Check mark for the first cell of a selected row (selection is never color alone). */
export function SelectedMark({ selected }: { selected: boolean }) {
  return selected ? <Check size={14} role="img" aria-label="Dipilih" className={styles.mark} /> : <span className={styles.markSpace} aria-hidden="true" />;
}

export interface CellTitleProps {
  /** 13 px medium first line, e.g. the item description. */
  title: ReactNode;
  /** Second line: Satker, account code, ... joined with a dot. Strings render as text, account codes can be wrapped in <span className="mono">. */
  meta?: ReactNode[];
}

/** Sel uraian: title over "Satker · akun". */
export function CellTitle({ title, meta }: CellTitleProps) {
  const parts = (meta ?? []).filter((part) => part !== null && part !== undefined && part !== false);
  return (
    <div className={styles.cellTitle}>
      <div className={styles.title}>{title}</div>
      {parts.length > 0 && (
        <div className={styles.meta}>
          {parts.map((part, index) => (
            <span key={index} className={styles.metaPart}>
              {index > 0 && (
                <span className={styles.metaDot} aria-hidden="true">
                  ·
                </span>
              )}
              {part}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Empty marker for a cell with no value (Aturan "—"). Announced as "tidak ada". */
export function CellEmpty() {
  return (
    <span className={styles.empty}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">tidak ada</span>
    </span>
  );
}

/* ------------------------------------------------------------ Pagination */

export interface PaginationProps {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Noun after the count: "item", "catatan". */
  noun?: string;
  className?: string;
}

function pageList(page: number, pageCount: number): Array<number | "gap-start" | "gap-end"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set([1, 2, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | "gap-start" | "gap-end"> = [];
  sorted.forEach((p, index) => {
    if (index > 0 && p - sorted[index - 1] > 1) result.push(index === 1 ? "gap-start" : "gap-end");
    result.push(p);
  });
  return result;
}

/** Kaki tabel: "Menampilkan 1–5 dari 128 item" and numbered pages. */
export function Pagination({ page, pageSize, total, onPageChange, noun = "item", className }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={cn(styles.footer, className)}>
      <p className={styles.footerCount}>
        {total === 0 ? `Tidak ada ${noun}` : `Menampilkan ${formatNumber(from)}–${formatNumber(to)} dari ${formatNumber(total)} ${noun}`}
      </p>
      {pageCount > 1 && (
        <nav aria-label="Halaman" className={styles.pages}>
          <button type="button" className={styles.pageButton} onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Halaman sebelumnya">
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          {pageList(page, pageCount).map((item, index) =>
            typeof item === "number" ? (
              <button
                key={item}
                type="button"
                className={cn(styles.pageButton, styles.pageNumber, "num")}
                aria-current={item === page ? "page" : undefined}
                aria-label={`Halaman ${item}`}
                onClick={() => onPageChange(item)}
              >
                {item}
              </button>
            ) : (
              <span key={`${item}-${index}`} className={styles.gap} aria-hidden="true">
                …
              </span>
            )
          )}
          <button type="button" className={styles.pageButton} onClick={() => onPageChange(page + 1)} disabled={page >= pageCount} aria-label="Halaman berikutnya">
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
