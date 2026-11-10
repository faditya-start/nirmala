import type { TriageItemRow } from "@nirmala/shared";
import { DecisionBadge, StatusBadge } from "../../../ui";
import { decisionBadgeKey } from "../labels";
import styles from "./DecisionCell.module.css";

/** Kolom Keputusan: badge keputusan; keputusan warisan diberi teks, bukan hanya warna. */
export function DecisionCell({ row }: { row: Pick<TriageItemRow, "decision" | "noteStatus" | "decisionInherited"> }) {
  const key = decisionBadgeKey(row);
  return (
    <div className={styles.cell}>
      {typeof key === "string" ? <DecisionBadge decision={key} /> : <StatusBadge status={key.note} />}
      {row.decisionInherited && (
        <span className={styles.inherited} title="Keputusan diwarisi dari versi sebelumnya">
          Diwarisi
        </span>
      )}
    </div>
  );
}
