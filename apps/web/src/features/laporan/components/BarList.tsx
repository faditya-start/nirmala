import { formatNumber } from "../../../lib/format";
import { barPercent } from "../report";
import styles from "./BarList.module.css";

export interface BarRow {
  key: string;
  label: string;
  count: number;
}

export interface BarListProps {
  /** Accessible name of the list. */
  label: string;
  rows: BarRow[];
  /** Label column width in px (200 in the design, wider for dismiss reasons). */
  labelWidth?: number;
}

/**
 * Horizontal count bars drawn with plain layout (design L4cke: 12 px bar on a 220 px track).
 * The count is always written out, so the bar is never the only carrier of the value.
 * Bars share the largest value of this list as 100%.
 */
export function BarList({ label, rows, labelWidth = 200 }: BarListProps) {
  const max = rows.reduce((largest, row) => Math.max(largest, row.count), 0);
  return (
    <ul role="list" aria-label={label} className={styles.list}>
      {rows.map((row) => (
        <li key={row.key} className={styles.row} style={{ gridTemplateColumns: `${labelWidth}px minmax(80px, 220px) auto` }}>
          <span className={styles.label} title={row.label}>
            {row.label}
          </span>
          <span className={styles.track} aria-hidden="true">
            <span className={styles.bar} style={{ width: `${barPercent(row.count, max)}%` }} />
          </span>
          <span className={row.count === 0 ? styles.zero : styles.count}>{formatNumber(row.count)}</span>
        </li>
      ))}
    </ul>
  );
}
