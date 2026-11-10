import type { ImportResultDto } from "@nirmala/shared";
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePageBreadcrumb } from "../../../app/breadcrumb";
import { errorMessage, isApiError } from "../../../lib/api";
import { formatNumber } from "../../../lib/format";
import {
  Button,
  ButtonLink,
  CheckResultBadge,
  EmptyState,
  KpiCard,
  Loading,
  PageHeader,
  Pagination,
  RuleChip,
  Table,
  TableFrame,
  TBody,
  Td,
  THead,
  Th,
  Tr
} from "../../../ui";
import { fetchImportResult } from "../api";
import { dateCommaTime, evidenceText, expectationText, formatDuration, rowErrorReasonText, rowErrorValueText, versionLabel } from "../logic";
import { Section } from "./Section";
import styles from "./ResultView.module.css";

const ERROR_PAGE_SIZE = 25;
const CRUMBS = [{ label: "Reviu" }, { label: "Siklus & Impor Data", to: "/siklus" }, { label: "Hasil impor" }];

export function ResultView({ cycleId, snapshotId }: { cycleId: string; snapshotId: string }) {
  usePageBreadcrumb(CRUMBS);
  const [result, setResult] = useState<ImportResultDto | null>(null);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError(null);
    fetchImportResult(cycleId, snapshotId, controller.signal)
      .then(setResult)
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError({ message: isApiError(cause) && cause.status === 501 ? "Hasil impor belum tersedia di server ini." : errorMessage(cause, "Hasil impor tidak dapat dimuat."), status: isApiError(cause) ? cause.status : 0 });
      });
    return () => controller.abort();
  }, [cycleId, snapshotId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (error) {
    return (
      <div className={styles.page}>
        <PageHeader title="Hasil impor" />
        <EmptyState
          icon={CircleAlert}
          title={error.status === 404 ? "Hasil impor tidak ditemukan" : error.status === 403 ? "Akses ditolak" : "Hasil impor tidak dapat dimuat"}
          description={error.message}
          action={
            <div className={styles.actions}>
              <ButtonLink to="/siklus" icon={ArrowLeft}>
                Kembali ke siklus
              </ButtonLink>
              {error.status !== 404 && error.status !== 403 && error.status !== 501 && <Button onClick={retry}>Coba lagi</Button>}
            </div>
          }
        />
      </div>
    );
  }
  if (!result) {
    return (
      <div className={styles.page}>
        <PageHeader title="Hasil impor" />
        <Loading label="Memuat hasil impor…" block />
      </div>
    );
  }
  return <ResultBody result={result} />;
}

function ResultBody({ result }: { result: ImportResultDto }) {
  const { snapshot } = result;
  const hasErrors = result.rowErrorCount > 0;
  const duration = formatDuration(snapshot.importDurationMs);
  const [errorPage, setErrorPage] = useState(1);
  const pagedErrors = result.rowErrors.slice((errorPage - 1) * ERROR_PAGE_SIZE, errorPage * ERROR_PAGE_SIZE);
  const previous = snapshot.versionNo > 1 ? `v${snapshot.versionNo - 1} ${versionLabel(snapshot.versionNo - 1)}` : null;
  const rechecked = result.recheckedNotes;
  const statusText = `Impor selesai${duration ? ` dalam ${duration}` : ""}${
    hasErrors ? ` dengan ${formatNumber(result.rowErrorCount)} baris galat. ${formatNumber(result.itemsSaved)} item tersimpan. Baris galat tidak ikut tersimpan di snapshot ini.` : ". Tidak ada baris galat."
  }`;

  return (
    <div className={styles.page}>
      <PageHeader
        title={`Hasil impor · snapshot v${snapshot.versionNo} ${snapshot.label}`}
        subtitle={`${snapshot.organizationUnitName} · ${snapshot.sourceFileName} · ${dateCommaTime(snapshot.importedAt)}${snapshot.importedByName ? ` · ${snapshot.importedByName}` : ""}`}
        actions={
          <>
            <ButtonLink to="/siklus" icon={ArrowLeft}>
              Kembali ke siklus
            </ButtonLink>
            {result.notesMovedToVerification > 0 && (
              <ButtonLink to="/tracker" variant="utama" icon={ArrowRight}>
                Buka Smart Tracker
              </ButtonLink>
            )}
          </>
        }
      />

      <div className={hasErrors ? styles.statusBox : styles.status} role="status">
        {hasErrors ? <TriangleAlert size={16} aria-hidden="true" /> : <CircleCheck size={16} aria-hidden="true" />}
        <span>{statusText}</span>
      </div>

      <Section title="Pembacaan file">
        <div className={styles.kpis}>
          <KpiCard label="Baris dibaca" value={formatNumber(result.rowsRead)} hint={`termasuk ${formatNumber(result.headerRowsSkipped)} baris header`} />
          <KpiCard label="Header disaring" value={formatNumber(result.headerRowsSkipped)} hint="tidak dihitung sebagai item" />
          <KpiCard label="Item tersimpan" value={formatNumber(result.itemsSaved)} hint={`snapshot v${snapshot.versionNo} ${snapshot.label}`} />
          <KpiCard label="Baris galat" value={formatNumber(result.rowErrorCount)} hint={hasErrors ? "lihat rincian di bawah" : "semua baris valid"} />
        </div>
      </Section>

      {result.diff && previous && (
        <Section title={`Perbandingan dengan ${previous}`} description={`${formatNumber(result.itemsAssessed)} item baru dan berubah dinilai ulang oleh aturan dan skor.`}>
          <div className={styles.kpis}>
            <KpiCard label="Baru" value={formatNumber(result.diff.baru)} hint={`tidak ada di v${snapshot.versionNo - 1}`} />
            <KpiCard label="Berubah" value={formatNumber(result.diff.berubah)} hint="akun, volume, satuan, harga, atau total" />
            <KpiCard label="Tetap" value={formatNumber(result.diff.tetap)} hint="tanpa perubahan" />
            <KpiCard label="Hilang" value={formatNumber(result.diff.hilang)} hint={`ada di v${snapshot.versionNo - 1}, tidak ada di v${snapshot.versionNo}`} />
          </div>
        </Section>
      )}

      {hasErrors && (
        <Section title="Baris galat" description="Perbaiki nilai di file sumber. Nomor baris mengikuti urutan di file CSV.">
          <TableFrame className={styles.table}>
            <Table aria-label="Baris galat impor">
              <THead>
                <tr>
                  <Th align="right" width={110}>
                    Baris
                  </Th>
                  <Th width={160}>Kolom</Th>
                  <Th width={220}>Nilai di file</Th>
                  <Th>Alasan</Th>
                </tr>
              </THead>
              <TBody>
                {pagedErrors.map((row) => (
                  <Tr key={`${row.line}-${row.column}`}>
                    <Td numeric>{formatNumber(row.line)}</Td>
                    <Td className="mono">{row.column}</Td>
                    <Td className="mono" title={row.value ?? undefined}>
                      <span className={styles.clip}>{rowErrorValueText(row.value)}</span>
                    </Td>
                    <Td>{rowErrorReasonText(row.reason, row.message)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            {result.rowErrors.length > ERROR_PAGE_SIZE && (
              <Pagination page={errorPage} pageSize={ERROR_PAGE_SIZE} total={result.rowErrors.length} onPageChange={setErrorPage} noun="baris galat" />
            )}
          </TableFrame>
          {result.rowErrorCount > result.rowErrors.length && (
            <p className={styles.footnote}>
              <Info size={14} aria-hidden="true" />
              <span>
                Hanya {formatNumber(result.rowErrors.length)} baris galat pertama yang ditampilkan dari {formatNumber(result.rowErrorCount)} baris.
              </span>
            </p>
          )}
        </Section>
      )}

      <div className={rechecked.length > 0 ? styles.columns : undefined}>
        <Section title="Aturan yang terpicu" description={`Jumlah item per aturan di snapshot v${snapshot.versionNo} ${snapshot.label}.`}>
          {result.ruleHits.length === 0 ? (
            <div className={styles.emptyBox}>
              <CircleCheck size={16} aria-hidden="true" />
              <span>Tidak ada item yang kena aturan aktif. Skor tetap dihitung untuk pengurutan.</span>
            </div>
          ) : (
            <TableFrame>
              <Table aria-label="Item per aturan">
                <THead>
                  <tr>
                    <Th>Aturan</Th>
                    <Th align="right" width={90}>
                      Item
                    </Th>
                  </tr>
                </THead>
                <TBody>
                  {result.ruleHits.map((hit) => (
                    <Tr key={hit.ruleId}>
                      <Td>
                        <span className={styles.rule}>
                          <RuleChip code={hit.code} />
                          <span title={hit.name}>{hit.name}</span>
                        </span>
                      </Td>
                      <Td numeric>{formatNumber(hit.itemCount)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableFrame>
          )}
        </Section>

        {rechecked.length > 0 && (
          <Section title="Catatan yang dicek ulang" description={`${formatNumber(rechecked.length)} catatan dari CHR yang sudah terbit dicek terhadap snapshot v${snapshot.versionNo}.`}>
            <TableFrame>
              <Table aria-label="Catatan yang dicek ulang">
                <THead>
                  <tr>
                    <Th>Catatan</Th>
                    <Th width={190}>Hasil cek</Th>
                  </tr>
                </THead>
                <TBody>
                  {rechecked.map((note) => (
                    <Tr key={note.noteId}>
                      <Td>
                        <div className={styles.note}>
                          <span className={styles.noteTitle} title={note.title}>
                            {note.title}
                          </span>
                          <span className={styles.noteMeta}>
                            {note.workUnitName} · {expectationText(note.expectation)}
                          </span>
                          <span className={styles.noteEvidence}>{evidenceText(note.evidence)}</span>
                        </div>
                      </Td>
                      <Td>
                        <CheckResultBadge result={note.result} />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableFrame>
            <p className={styles.footnote}>
              <Info size={14} aria-hidden="true" />
              <span>
                Hasil cek hanya usulan.{" "}
                {result.notesMovedToVerification > 0
                  ? `${formatNumber(result.notesMovedToVerification)} catatan pindah ke Perlu Verifikasi`
                  : "Tidak ada catatan yang pindah ke Perlu Verifikasi"}
                , dan penutupan tetap oleh reviewer.
              </span>
            </p>
          </Section>
        )}
      </div>
    </div>
  );
}
