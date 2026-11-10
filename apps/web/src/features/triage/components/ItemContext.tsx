import type { PreviousVersionDto, PreviousVersionFieldDiff, TriageItemContext } from "@nirmala/shared";
import type { ReactNode } from "react";
import { formatNumber } from "../../../lib/format";
import { SectionHeader, TagChip } from "../../../ui";
import { snapshotName } from "../labels";
import styles from "./ItemContext.module.css";

const LEVEL_LABEL: Record<string, string> = {
  program: "Program",
  activity: "Kegiatan",
  output: "Output",
  suboutput: "Suboutput",
  component: "Komponen",
  subcomponent: "Subkomponen"
};

function Field({ label, children, mono, strong, medium }: { label: string; children: ReactNode; mono?: boolean; strong?: boolean; medium?: boolean }) {
  return (
    <div className={styles.field}>
      <dt>{label}</dt>
      <dd className={`${mono ? "num " : ""}${strong ? styles.strong : ""}${medium ? styles.medium : ""}`}>{children}</dd>
    </div>
  );
}

/** Kolom kiri S5: Konteks item, Hierarki, Versi sebelumnya. */
export function ItemContext({ item, previousVersion }: { item: TriageItemContext; previousVersion: PreviousVersionDto | null }) {
  const unit = item.unit ? ` ${item.unit}` : "";
  return (
    <div className={styles.column}>
      <section className={styles.group}>
        <SectionHeader title="Konteks item" level={2} />
        <dl className={styles.list}>
          <Field label="Uraian" medium>
            <span className={styles.wrap}>{item.description}</span>
          </Field>
          <Field label="Akun">{item.accountName ? `${item.accountCode} · ${item.accountName}` : item.accountCode}</Field>
          <Field label="Nilai" mono>
            {formatNumber(item.quantity)}
            {unit} × {formatNumber(item.unitPrice)}
          </Field>
          <Field label="Total" mono strong>
            {formatNumber(item.totalAmount)}
          </Field>
          <Field label="Rincian volume">
            {item.volumeDetail.length === 0 ? (
              "VOL_KEG_1 tidak terisi"
            ) : (
              <span className={styles.volumes}>
                {item.volumeDetail.map((entry) => (
                  <span key={entry.index}>
                    VOL_KEG_{entry.index}: {entry.volume === null ? "-" : formatNumber(entry.volume)}
                    {entry.unit ? ` ${entry.unit}` : ""}
                  </span>
                ))}
              </span>
            )}
          </Field>
          <Field label="Status blokir">
            {item.blokirCode ? `${item.blokirCode}${item.blokirAmount !== null ? ` · ${formatNumber(item.blokirAmount)}` : ""}` : "Tidak ada kode blokir"}
          </Field>
        </dl>
      </section>

      <section className={styles.group}>
        <SectionHeader title="Hierarki" level={2} />
        <dl className={styles.list}>
          {item.hierarchy.map((level) => (
            <Field key={level.level} label={LEVEL_LABEL[level.level] ?? level.level}>
              <span className={styles.wrap}>{level.name ? `${level.code} · ${level.name}` : level.code}</span>
            </Field>
          ))}
        </dl>
      </section>

      <section className={styles.group}>
        <SectionHeader title="Versi sebelumnya" level={2} />
        {previousVersion ? <Diff previous={previousVersion} /> : <NoPrevious item={item} />}
      </section>
    </div>
  );
}

function NoPrevious({ item }: { item: TriageItemContext }) {
  const current = snapshotName(item.snapshotVersionNo, item.snapshotLabel);
  return (
    <p className={styles.note}>
      {item.snapshotVersionNo <= 1
        ? `Ini snapshot pertama (${current}), jadi tidak ada versi sebelumnya untuk dibandingkan.`
        : `Item baru di ${current}. Tidak ada padanan di v${item.snapshotVersionNo - 1}, jadi tidak ada perbandingan.`}
    </p>
  );
}

const FIELD_LABEL: Record<PreviousVersionFieldDiff["field"], string> = {
  account_code: "Akun",
  unit_price: "Harga satuan",
  total_amount: "Total",
  quantity: "Volume",
  unit: "Satuan",
  description: "Uraian"
};

function show(field: PreviousVersionFieldDiff["field"], value: string | number | null): string {
  if (value === null || value === "") return "-";
  return typeof value === "number" && field !== "account_code" ? formatNumber(value) : String(value);
}

function Diff({ previous }: { previous: PreviousVersionDto }) {
  const changed = previous.fields.filter((field) => field.changed);
  const same = previous.fields.filter((field) => !field.changed);
  return (
    <div className={styles.diff}>
      <p className={styles.note}>
        Dibandingkan dengan v{previous.versionNo} {previous.label}: {changed.length === 0 ? "tidak ada bidang yang berubah." : `${changed.length} bidang berubah.`}
      </p>
      {changed.length > 0 && (
        <ul className={styles.diffList} role="list">
          {changed.map((field) => (
            <li key={field.field} className={styles.changed}>
              <span className={styles.diffLabel}>{FIELD_LABEL[field.field]}</span>
              <span className={styles.diffValue}>
                <span className={`${styles.before} num`}>{show(field.field, field.before)}</span>
                <span aria-label="menjadi"> → </span>
                <span className="num">{show(field.field, field.after)}</span>
                <TagChip>Berubah</TagChip>
              </span>
            </li>
          ))}
        </ul>
      )}
      {same.length > 0 && changed.length > 0 && <p className={styles.note}>Tetap: {same.map((field) => FIELD_LABEL[field.field].toLowerCase()).join(", ")}.</p>}
    </div>
  );
}
