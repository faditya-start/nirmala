import { Check, CircleAlert, FilePlus, History, ListChecks, Lock, Plus, Printer, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import type { AddendumBody, ChrDetailResponse, ChrNoteDto, CreateNoteBody, UpdateNoteBody } from "@nirmala/shared";
import { usePageBreadcrumb } from "../../app/breadcrumb";
import { errorMessage, isApiError } from "../../lib/api-error";
import { formatDateTime, formatNumber } from "../../lib/format";
import { Button, ButtonLink, ConfirmDialog, EmptyState, Loading } from "../../ui";
import { chrApi } from "./chrApi";
import { AddendumDialog } from "./components/AddendumDialog";
import { DocStatusPill, StatusCounts } from "./components/DocStatus";
import { RecommendationField, UnitResponseField, VersionTimeline } from "./components/DocumentSide";
import { NoteCard } from "./components/NoteCard";
import { NoteDialog } from "./components/NoteDialog";
import { ResourceError } from "./components/ResourceError";
import { VersionsDialog } from "./components/VersionsDialog";
import { CATEGORY_LABEL, chrSubtitle, noteCountLabel } from "./logic";
import { useResource } from "./useResource";
import styles from "./Editor.module.css";

/** S6 · CHR Editor (AbBPt draf, gjkcp terkunci, G0gXnD dialog terbit). Route: /chr/:chrId. */
export function ChrEditorPage() {
  const { chrId = "" } = useParams();
  const resource = useResource(() => chrApi.detail(chrId), [chrId]);

  if (resource.loading) return <Loading block label="Memuat dokumen CHR…" />;
  if (resource.error || !resource.data) return <ResourceError error={resource.error} what="dokumen CHR" onRetry={() => void resource.reload()} />;
  return <ChrEditor key={chrId} detail={resource.data} reload={resource.reload} />;
}

type DialogState =
  | { kind: "none" }
  | { kind: "note"; note: ChrNoteDto | null }
  | { kind: "delete"; note: ChrNoteDto }
  | { kind: "issue" }
  | { kind: "versions" }
  | { kind: "addendum" };

function ChrEditor({ detail, reload }: { detail: ChrDetailResponse; reload: () => Promise<ChrDetailResponse | null> }) {
  const { document: doc, groups, notesByStatus, notesTotal, versions, permissions } = detail;
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [seq, setSeq] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  usePageBreadcrumb([{ label: "Reviu" }, { label: "CHR", to: "/chr" }, { label: doc.organizationUnitName }]);

  const draft = doc.status === "draft";
  const locked = !draft;
  const canWrite = permissions.canEditNotes;
  const draftCount = notesByStatus.draf;

  function open(next: DialogState) {
    setSeq((value) => value + 1);
    setActionError(null);
    setDialog(next);
  }
  const close = () => setDialog({ kind: "none" });

  /** Runs a mutation, then re-reads the document so numbers, status and permissions come from the server. */
  async function mutate(run: () => Promise<unknown>, done: string): Promise<void> {
    await run();
    await reload();
    setNotice(done);
    close();
  }

  const createNote = (body: CreateNoteBody) => mutate(() => chrApi.createNote(doc.id, body), "Catatan ditambahkan ke draf CHR.");
  const updateNote = (noteId: string, body: UpdateNoteBody) => mutate(() => chrApi.updateNote(doc.id, noteId, body), "Perubahan catatan tersimpan.");
  const addendum = (body: AddendumBody) =>
    mutate(() => chrApi.addendum(doc.id, body), "Adendum diterbitkan. Versi baru sudah dibuat.");

  async function confirmDelete(note: ChrNoteDto) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await mutate(() => chrApi.deleteNote(doc.id, note.id), `Catatan ${note.number} dihapus. Item kembali ke Risk Triage.`);
    } catch (error) {
      setActionError(errorMessage(error, "Catatan belum terhapus. Coba lagi."));
      if (isApiError(error) && error.status === 409) void reload();
    } finally {
      setBusy(false);
    }
  }

  async function confirmIssue() {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await chrApi.issue(doc.id);
      await reload();
      setNotice(`CHR terbit dengan nomor ${result.document.documentNumber ?? ""}. ${formatNumber(result.notesTransitioned)} catatan berstatus Menunggu Revisi.`);
      close();
    } catch (error) {
      setActionError(errorMessage(error, "CHR belum terbit. Coba lagi."));
      if (isApiError(error) && error.status === 409) void reload();
    } finally {
      setBusy(false);
    }
  }

  const issueError = dialog.kind === "issue" && actionError;
  const deleteError = dialog.kind === "delete" && actionError;
  const showIssue = draft && (permissions.canIssue || permissions.canEditNotes);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.headText}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>CHR · {doc.organizationUnitName}</h1>
            <DocStatusPill status={doc.status} />
          </div>
          <p className={styles.subtitle}>{chrSubtitle(doc)}</p>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" icon={History} onClick={() => open({ kind: "versions" })}>
            Riwayat versi
          </Button>
          <ButtonLink to={`/chr/${encodeURIComponent(doc.id)}/cetak`} icon={Printer}>
            Cetak
          </ButtonLink>
          {showIssue && (
            <Button
              variant="utama"
              icon={Send}
              disabled={!permissions.canIssue}
              title={permissions.canIssue ? undefined : "Tambahkan minimal satu catatan sebelum menerbitkan."}
              onClick={() => open({ kind: "issue" })}
            >
              Terbitkan
            </Button>
          )}
        </div>
      </header>

      {locked && (
        <div className={styles.banner} role="note">
          <Lock size={18} aria-hidden="true" className={styles.bannerIcon} />
          <div className={styles.bannerText}>
            <p className={styles.bannerTitle}>Dokumen terbit dan terkunci</p>
            <p className={styles.bannerBody}>
              Diterbitkan {formatDateTime(doc.issuedAt).replace(" · ", ", ")}. Semua isian nonaktif. Perubahan hanya lewat adendum, yang membuat versi baru.
            </p>
          </div>
          {permissions.canAddAddendum && (
            <Button icon={FilePlus} onClick={() => open({ kind: "addendum" })}>
              Tambah adendum
            </Button>
          )}
        </div>
      )}

      {notice && (
        <p className={styles.notice} role="status">
          <Check size={14} aria-hidden="true" />
          <span>{notice}</span>
          <button type="button" className={styles.noticeClose} onClick={() => setNotice(null)}>
            Tutup
          </button>
        </p>
      )}

      <StatusCounts counts={notesByStatus} />

      <div className={styles.columns}>
        <div className={styles.notes}>
          {groups.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Belum ada catatan"
              description={
                draft
                  ? "Konfirmasi item di Risk Triage agar masuk ke draf CHR ini, atau tambahkan catatan manual."
                  : "CHR ini terbit tanpa catatan."
              }
              action={
                draft && canWrite ? (
                  <Button icon={Plus} onClick={() => open({ kind: "note", note: null })}>
                    Tambah catatan
                  </Button>
                ) : undefined
              }
            />
          ) : (
            groups.map((group) => (
              <section key={group.category} className={styles.group} aria-labelledby={`grp-${group.category}`}>
                <div className={styles.groupHead}>
                  <h3 id={`grp-${group.category}`} className={styles.groupTitle}>
                    {group.letter}. {CATEGORY_LABEL[group.category]}
                  </h3>
                  <span className={styles.groupCount}>{noteCountLabel(group.notes.length)}</span>
                </div>
                <ol className={styles.list}>
                  {group.notes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      editable={draft && canWrite}
                      onEdit={(target) => open({ kind: "note", note: target })}
                      onDelete={(target) => open({ kind: "delete", note: target })}
                    />
                  ))}
                </ol>
              </section>
            ))
          )}
          {groups.length > 0 && draft && canWrite && (
            <div>
              <Button icon={Plus} onClick={() => open({ kind: "note", note: null })}>
                Tambah catatan
              </Button>
            </div>
          )}
          <p className="sr-only" aria-live="polite">
            {formatNumber(notesTotal)} catatan di dokumen ini
          </p>
        </div>

        <aside className={styles.side} aria-label="Isian dokumen">
          <RecommendationField doc={doc} editable={permissions.canEditRecommendation} onSaved={() => undefined} />
          <UnitResponseField doc={doc} canRespond={permissions.canRespond} onSaved={() => void reload()} />
          <VersionTimeline doc={doc} versions={versions} />
        </aside>
      </div>

      <NoteDialog
        key={`note-${seq}`}
        open={dialog.kind === "note"}
        note={dialog.kind === "note" ? dialog.note : null}
        organizationUnitId={doc.organizationUnitId}
        onCreate={createNote}
        onUpdate={updateNote}
        onClose={close}
      />
      <ConfirmDialog
        open={dialog.kind === "delete"}
        title="Hapus catatan ini?"
        tone="bahaya"
        icon={CircleAlert}
        confirmLabel="Hapus catatan"
        confirmIcon={Trash2}
        busy={busy}
        description={
          <>
            Catatan akan dihapus dari draf CHR. Item terkait kembali berstatus Belum ditinjau di Risk Triage.
            {deleteError && <span className={styles.dialogError} role="alert">{deleteError}</span>}
          </>
        }
        summary={dialog.kind === "delete" ? `${dialog.note.number}. ${dialog.note.title}` : undefined}
        onConfirm={() => dialog.kind === "delete" && void confirmDelete(dialog.note)}
        onCancel={close}
      />
      <ConfirmDialog
        open={dialog.kind === "issue"}
        title="Terbitkan CHR dan kunci dokumen?"
        busy={busy}
        confirmLabel="Terbitkan"
        description={
          <>
            Dokumen akan dikunci dan nomor CHR dibuat. {formatNumber(draftCount)} catatan berstatus Draf berubah menjadi Menunggu Revisi. Perubahan setelah terbit hanya lewat adendum.
            {issueError && <span className={styles.dialogError} role="alert">{issueError}</span>}
          </>
        }
        summary={`${doc.organizationUnitName} · TA ${doc.fiscalYear} · tahap ${doc.stage} · ${formatNumber(draftCount)} catatan`}
        onConfirm={() => void confirmIssue()}
        onCancel={close}
      />
      <VersionsDialog key={`ver-${seq}`} open={dialog.kind === "versions"} chrId={doc.id} versions={versions} onClose={close} />
      <AddendumDialog key={`add-${seq}`} open={dialog.kind === "addendum"} doc={doc} onSubmit={addendum} onClose={close} />
    </div>
  );
}
