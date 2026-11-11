import { History, Printer } from "lucide-react";
import { expectationCode } from "@nirmala/shared";
import { useEffect, useState } from "react";
import type { ChrVersionDetailResponse, ChrVersionSummaryDto } from "@nirmala/shared";
import { errorMessage } from "../../../lib/api-error";
import { formatDateTime, formatNumber } from "../../../lib/format";
import { Button, ButtonLink, Dialog, Loading, Select, StatusBadge } from "../../../ui";
import { chrApi } from "../chrApi";
import styles from "./VersionsDialog.module.css";

export interface VersionsDialogProps {
  open: boolean;
  chrId: string;
  versions: ChrVersionSummaryDto[];
  onClose: () => void;
}

/** Riwayat versi: pick a version and read the document as it was then. */
export function VersionsDialog({ open, chrId, versions, onClose }: VersionsDialogProps) {
  const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const [selected, setSelected] = useState<number | null>(sorted[0]?.versionNumber ?? null);
  const [detail, setDetail] = useState<ChrVersionDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || selected === null) return;
    let active = true;
    setDetail(null);
    setError(null);
    chrApi
      .version(chrId, selected)
      .then((result) => active && setDetail(result))
      .catch((caught) => active && setError(errorMessage(caught, "Isi versi belum bisa dimuat.")));
    return () => {
      active = false;
    };
  }, [open, chrId, selected]);

  const snapshot = detail?.snapshot;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      icon={History}
      title="Riwayat versi"
      actions={
        <>
          {selected !== null && (
            <ButtonLink to={`/chr/${encodeURIComponent(chrId)}/cetak?version=${selected}`} icon={Printer}>
              Cetak versi ini
            </ButtonLink>
          )}
          <Button onClick={onClose}>Tutup</Button>
        </>
      }
    >
      {sorted.length === 0 ? (
        <p className={styles.plain}>Belum ada versi. Versi 1 dibuat saat CHR diterbitkan.</p>
      ) : (
        <div className={styles.body}>
          <Select
            label="Versi"
            value={String(selected ?? "")}
            onChange={(event) => setSelected(Number(event.target.value))}
            options={sorted.map((version) => ({
              value: String(version.versionNumber),
              label: `Versi ${version.versionNumber} · ${version.reason === "terbit" ? "terbit" : "adendum"} · ${formatDateTime(version.createdAt)}`
            }))}
          />
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {!error && !snapshot && <Loading label="Memuat isi versi…" />}
          {snapshot && detail && (
            <div className={styles.snapshot}>
              <dl className={styles.facts}>
                <div>
                  <dt>Nomor</dt>
                  <dd className="mono">{snapshot.document.documentNumber ?? "-"}</dd>
                </div>
                <div>
                  <dt>Dibuat oleh</dt>
                  <dd>{detail.version.createdByName}</dd>
                </div>
                <div>
                  <dt>Jumlah catatan</dt>
                  <dd className="num">{formatNumber(snapshot.notes.length)}</dd>
                </div>
              </dl>
              {snapshot.addendumReason && (
                <p className={styles.plain}>
                  <strong>Alasan adendum:</strong> {snapshot.addendumReason}
                </p>
              )}
              <ol className={styles.notes} aria-label={`Catatan pada versi ${detail.version.versionNumber}`}>
                {snapshot.notes.map((note) => (
                  <li key={note.id} className={styles.note}>
                    <span className={`${styles.noteNo} num`}>{note.number}</span>
                    <div className={styles.noteBody}>
                      <span className={styles.noteTitle} title={note.title}>
                        {note.title}
                      </span>
                      <span className={styles.noteMeta}>
                        {[note.workUnitName, note.accountCode].filter(Boolean).join(" · ")}
                        {note.workUnitName || note.accountCode ? " · " : ""}
                        <span className="mono">{expectationCode(note.expectation)}</span>
                      </span>
                    </div>
                    <StatusBadge status={note.status} />
                  </li>
                ))}
              </ol>
              {snapshot.document.recommendation && (
                <div>
                  <h3 className={styles.sub}>Rekomendasi</h3>
                  <p className={styles.plainInk}>{snapshot.document.recommendation}</p>
                </div>
              )}
              {snapshot.document.unitResponse && (
                <div>
                  <h3 className={styles.sub}>Tanggapan eselon I</h3>
                  <p className={styles.plainInk}>{snapshot.document.unitResponse}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
