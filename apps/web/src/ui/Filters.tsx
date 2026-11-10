import { ChevronDown, Search } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import styles from "./Filters.module.css";

/** Tabel/BarisFilter: a wrapping row of filters above a table. */
export function FilterBar({ label = "Filter", className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={cn(styles.bar, className)}>
      {children}
    </div>
  );
}

/** Pushes the following items (usually FilterSummary) to the right edge. */
export function FilterSpacer() {
  return <div className={styles.spacer} />;
}

/** "42 item kena aturan · 17 belum ditinjau". Announced politely when it changes. */
export function FilterSummary({ children }: { children: ReactNode }) {
  return (
    <p className={styles.summary} aria-live="polite">
      {children}
    </p>
  );
}

export interface FilterSearchProps {
  value: string;
  onChange: (value: string) => void;
  /** Placeholder, e.g. "Cari uraian item". */
  placeholder?: string;
  /** Accessible name. Defaults to the placeholder. */
  label?: string;
  className?: string;
}

/** Filter/Cari: 30 px search box with a leading icon. */
export function FilterSearch({ value, onChange, placeholder = "Cari", label, className }: FilterSearchProps) {
  return (
    <label className={cn(styles.search, className)}>
      <Search size={14} aria-hidden="true" className={styles.searchIcon} />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={styles.searchInput}
      />
    </label>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelectProps {
  /** Prefix shown in muted text, e.g. "Eselon I". Also the accessible name. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  className?: string;
}

/** Filter/Pilih: "Eselon I  Semua  v". A native select sits invisibly on top, so keyboard and screen readers work. */
export function FilterSelect({ label, value, onChange, options, className }: FilterSelectProps) {
  const current = options.find((option) => option.value === value);
  return (
    <label className={cn(styles.select, className)}>
      <span className={styles.selectLabel}>{label}</span>
      <span className={styles.selectValue}>{current?.label ?? ""}</span>
      <ChevronDown size={14} aria-hidden="true" className={styles.selectChevron} />
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={styles.native}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
