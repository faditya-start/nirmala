import type { PeerComparisonDto } from "@nirmala/shared";
import { formatNumber } from "../../../lib/format";
import styles from "./PeerPrice.module.css";

type Anchor = "start" | "center" | "end";

/** Posisi (0-100) di sepanjang rentang; item di luar rentang tetap digambar di tepi. */
export function positionOf(value: number, min: number, max: number): number {
  if (max <= min) return 50;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

function anchorFor(pct: number, closeToOther: boolean, isLeft: boolean): Anchor {
  if (closeToOther) return isLeft ? "end" : "start";
  if (pct < 14) return "start";
  if (pct > 86) return "end";
  return "center";
}

/** Posisi harga (BftML): rentang min-maks Satker lain, penanda median, penanda item ini. */
export function PeerPrice({ peer }: { peer: PeerComparisonDto }) {
  const itemPct = positionOf(peer.itemUnitPrice, peer.min, peer.max);
  const medianPct = positionOf(peer.median, peer.min, peer.max);
  const close = Math.abs(itemPct - medianPct) < 26;
  const itemAnchor = anchorFor(itemPct, close, itemPct < medianPct);
  const medianAnchor = anchorFor(medianPct, close, medianPct <= itemPct);
  const ratio = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(peer.ratio);
  const description = `Harga satuan item ${formatNumber(peer.itemUnitPrice)}, median ${formatNumber(peer.median)}, rentang ${formatNumber(peer.min)} sampai ${formatNumber(peer.max)}.`;
  return (
    <div className={styles.wrap}>
      <div className={styles.chart} role="img" aria-label={description}>
        <span className={`${styles.label} ${styles.median}`} data-anchor={medianAnchor} style={{ left: `${medianPct}%` }}>
          Median {formatNumber(peer.median)}
        </span>
        <span className={`${styles.label} ${styles.item}`} data-anchor={itemAnchor} style={{ left: `${itemPct}%` }}>
          Item ini {formatNumber(peer.itemUnitPrice)}
        </span>
        <div className={styles.track}>
          <span className={styles.medianMark} style={{ left: `${medianPct}%` }} />
          <span className={styles.itemMark} style={{ left: `${itemPct}%` }} />
        </div>
        <div className={styles.ends}>
          <span>{formatNumber(peer.min)}</span>
          <span>{formatNumber(peer.max)}</span>
        </div>
      </div>
      <dl className={styles.summary}>
        <div>
          <dt>Satker pembanding</dt>
          <dd>{formatNumber(peer.satkerCount)} Satker</dd>
        </div>
        <div>
          <dt>Median</dt>
          <dd className="num">
            {formatNumber(peer.median)}
            {peer.unit ? ` per ${peer.unit}` : ""}
          </dd>
        </div>
        <div>
          <dt>Posisi item</dt>
          <dd className={styles.strong}>{ratio}× median</dd>
        </div>
      </dl>
    </div>
  );
}
