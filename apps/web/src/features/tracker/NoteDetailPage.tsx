import type { CheckEvidenceDto, Expectation, TrackerNoteDetailResponse } from "@nirmala/shared";
import { ArrowLeft, Lock, SearchX, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { usePageBreadcrumb } from "../../app/breadcrumb";
import { useNeedsAction } from "../../app/needsAction";
import { api } from "../../lib/api";
import { formatDate, formatDateTime } from "../../lib/format";
import {
  Button,
  ButtonLink,
  CheckResultBadge,
  EmptyState,
  EvidenceCard,
  EvidenceRow,
  Loading,
  PageHeader,
  RuleChip,
  SectionHeader,
  StatusBadge,
  TagChip,
  Timeline,
  TimelineItem
} from "../../ui";
import { ActionPanels } from "./ActionPanels";
import { Notice, type NoticeProps } from "./components/Notice";
import { expectationSentence } from "../../lib/expectation";
import { CATEGORY_LABEL, evidenceRowViews, formatNum, timelineViews } from "./logic";
import { describeError, errorStatus, useRemote } from "./useRemote";
import styles from "./NoteDetailPage.module.css";

/** S9 · Detail catatan (dB0Ae reviewer, x8CopO PIC UKI, W4pDP9 data tidak cukup). Route: /tracker/:noteId. */
export function NoteDetailPage() {
  const { noteId = "" } = useParams();
  const location = useLocation();
  const needs = useNeedsAction();
  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch ?? "";
  const backTo = `/tracker${listSearch ? `?${listSearch}` : ""}`;
  const [notice, setNotice] = useState<{ tone: NoticeProps["tone"]; text: string } | null>(null);

  const remote = useRemote<TrackerNoteDetailResponse>((signal) => api.get<TrackerNoteDetailResponse>(`/tracker/notes/${encodeURIComponent(noteId)}`, { signal }), noteId);
  const detail = remote.data && remote.data.note.id === noteId ? remote.data : null;

  usePageBreadcrumb(detail ? [{ label: "Tindak lanjut" }, { label: "Smart Tracker", to: backTo }, { label: detail.note.title }] : null);

  if (!detail) {
    const status = errorStatus(remote.error);
    if (remote.error) {
      return (
        <div className={styles.page}>
          {status === 404 ? (
            <EmptyState icon={SearchX} title="Catatan tidak ditemukan" description="Catatan ini tidak ada atau sudah dihapus dari siklus." action={<ButtonLink to={backTo}>Kembali ke daftar</ButtonLink>} />
          ) : status === 403 ? (
            <EmptyState variant="page" icon={Lock} title="Akses ditolak" description={describeError(remote.error)} action={<ButtonLink to={backTo}>Kembali ke daftar</ButtonLink>} />
          ) : (
            <EmptyState
              icon={TriangleAlert}
              title="Catatan tidak dapat dimuat"
              description={describeError(remote.error)}
              action={
                <Button variant="utama" onClick={remote.reload}>
                  Coba lagi
                </Button>
              }
            />
          )}
        </div>
      );
    }
    return <Loading block label="Memuat catatan…" />;
  }

  const { note, latestEvidence, previousEvidence } = detail;
  const evidences = [...(latestEvidence ? [latestEvidence] : []), ...previousEvidence];
  const timeline = timelineViews(detail.timeline, detail.nextStep, evidences, note.expectation);

  function done(text: string) {
    setNotice({ tone: "sukses", text });
    remote.reload();
    void needs.refresh();
  }

  function failed(text: string) {
    setNotice({ tone: "galat", text: `${text} Data catatan dimuat ulang.` });
    remote.reload();
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={note.title}
        subtitle={
          <span className={styles.meta}>
            <span>
              {[detail.workUnitName, note.accountCode, detail.chrDocumentNumber ? `CHR ${detail.chrDocumentNumber}` : null, `catatan ${note.number}`].filter(Boolean).join(" · ")}
            </span>
            <StatusBadge status={note.status} />
            {note.latestCheckResult && <CheckResultBadge result={note.latestCheckResult} />}
          </span>
        }
        actions={
          <ButtonLink to={backTo} icon={ArrowLeft}>
            Kembali ke daftar
          </ButtonLink>
        }
      />
      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      <div className={styles.columns} aria-busy={remote.loading || undefined}>
        <div className={styles.main}>
          <section className={styles.group} aria-labelledby="sec-catatan">
            <SectionHeader
              title="Catatan CHR"
              description={`Dibuat ${note.createdByName} pada ${formatDate(note.createdAt)}.${detail.chrIssuedAt ? ` Terbit ${formatDate(detail.chrIssuedAt)}.` : ""}`}
            />
            <div className={styles.noteCard}>
              <div className={styles.chips}>
                {note.ruleCode && <RuleChip code={note.ruleCode} />}
                <TagChip>{CATEGORY_LABEL[note.category]}</TagChip>
              </div>
              <p className={styles.noteText}>{note.text}</p>
              <div className={styles.expectation}>
                <span>Ekspektasi perubahan</span>
                <strong>{expectationSentence(note.expectation, formatNum)}</strong>
              </div>
            </div>
          </section>

          <section className={styles.group} aria-labelledby="sec-bukti">
            <SectionHeader
              title="Bukti cek"
              description={
                latestEvidence
                  ? `Item padanan di snapshot v${latestEvidence.snapshotVersionNo} ${latestEvidence.snapshotLabel} dicari lewat kunci item (akun tidak ikut dicocokkan).`
                  : "Bukti sebelum dan sesudah muncul setelah snapshot revisi eselon I diimpor."
              }
            />
            {latestEvidence ? (
              <EvidenceBlock evidence={latestEvidence} expectation={note.expectation} />
            ) : (
              <div className={styles.noEvidence}>
                <StatusBadge status={note.status}>{note.status === "menunggu_revisi" ? "Menunggu Revisi" : undefined}</StatusBadge>
                <p>Belum ada cek otomatis untuk catatan ini. Sistem hanya menambah usulan hasil cek, tidak menutup catatan.</p>
              </div>
            )}
            {previousEvidence.length > 0 && (
              <details className={styles.previous}>
                <summary>Cek sebelumnya ({previousEvidence.length})</summary>
                <div className={styles.previousList}>
                  {previousEvidence.map((evidence) => (
                    <EvidenceBlock key={evidence.checkId} evidence={evidence} expectation={note.expectation} />
                  ))}
                </div>
              </details>
            )}
          </section>
        </div>

        <aside className={styles.side} aria-label="Tindakan dan riwayat">
          <ActionPanels key={note.id} detail={detail} onDone={done} onFailed={failed} />
          <section className={styles.group} aria-labelledby="sec-riwayat">
            <SectionHeader title="Riwayat catatan" />
            <Timeline label="Riwayat catatan">
              {timeline.map((item, index) => (
                <TimelineItem
                  key={item.key}
                  title={item.title}
                  time={item.at ? formatDateTime(item.at) : undefined}
                  description={item.description}
                  tone={item.tone}
                  pending={item.pending}
                  last={index === timeline.length - 1}
                />
              ))}
            </Timeline>
          </section>
        </aside>
      </div>
    </div>
  );
}



function EvidenceBlock({ evidence, expectation }: { evidence: CheckEvidenceDto; expectation: Expectation }) {
  const rows = evidenceRowViews(evidence, expectation);
  return (
    <EvidenceCard
      title={`Bukti cek · snapshot v${evidence.snapshotVersionNo} ${evidence.snapshotLabel}`}
      result={evidence.result}
      footnote={`Ini usulan sistem. Catatan hanya ditutup setelah reviewer menyetujui.${evidence.note ? ` ${evidence.note}` : ""}`}
    >
      {rows.map((row) => {
        const plain = row.field === "Uraian" || row.field === "Satuan";
        const text = (value?: string) => <span className={plain ? styles.plain : undefined}>{value}</span>;
        if (row.badge) {
          return (
            <EvidenceRow
              key={row.key}
              field={row.field}
              state="tetap"
              hideTag
              value={
                <span className={styles.valueWithBadge}>
                  <span>{row.value}</span>
                  <CheckResultBadge result={row.badge} />
                </span>
              }
            />
          );
        }
        return <EvidenceRow key={row.key} field={row.field} state={row.state} before={text(row.before)} after={text(row.after)} value={text(row.value)} />;
      })}
    </EvidenceCard>
  );
}
