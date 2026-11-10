import { CircleAlert, FilePlus, Plus, Trash2 } from "lucide-react";
import { expectationCode } from "@nirmala/shared";
import { useState } from "react";
import type { AddendumBody, ChrDocumentDto, CreateNoteBody } from "@nirmala/shared";
import { errorMessage } from "../../../lib/api-error";
import { Button, Dialog, IconButton, Textarea } from "../../../ui";
import { CATEGORY_LABEL, RECOMMENDATION_MAX, emptyNoteForm, hasErrors, validateNoteForm, type NoteForm, type NoteFormErrors } from "../logic";
import styles from "./Forms.module.css";
import addendum from "./Addendum.module.css";
import { NoteFields } from "./NoteFields";

export interface AddendumDialogProps {
  open: boolean;
  doc: ChrDocumentDto;
  onSubmit: (body: AddendumBody) => Promise<void>;
  onClose: () => void;
}

/** Tambah adendum to an issued CHR: a reason, an optional new recommendation and optional new notes. Mount with a fresh key per opening. */
export function AddendumDialog({ open, doc, onSubmit, onClose }: AddendumDialogProps) {
  const [reason, setReason] = useState("");
  const [recommendation, setRecommendation] = useState(doc.recommendation ?? "");
  const [notes, setNotes] = useState<CreateNoteBody[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<NoteForm>(emptyNoteForm());
  const [draftErrors, setDraftErrors] = useState<NoteFormErrors>({});
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function addDraft() {
    const { errors, expectation } = validateNoteForm(draft, { needsTitle: true, needsWorkUnit: true });
    setDraftErrors(errors);
    if (hasErrors(errors) || !expectation) return;
    setNotes((current) => [
      ...current,
      { category: draft.category, title: draft.title.trim(), text: draft.text.trim(), expectation, workUnitId: draft.workUnitId }
    ]);
    setDraft(emptyNoteForm());
    setAdding(false);
  }

  async function submit() {
    if (busy) return;
    setServerError(null);
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      setReasonError("Alasan adendum minimal 5 karakter.");
      return;
    }
    setReasonError(null);
    const recommendationChanged = recommendation.trim() !== (doc.recommendation ?? "").trim();
    if (!recommendationChanged && notes.length === 0) {
      setServerError("Adendum harus mengubah rekomendasi atau menambah catatan.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        reason: trimmedReason,
        ...(recommendationChanged ? { recommendation: recommendation.trim() } : {}),
        notes
      });
    } catch (error) {
      setServerError(errorMessage(error, "Adendum belum tersimpan. Coba lagi."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      icon={FilePlus}
      title="Tambah adendum"
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant="utama" icon={FilePlus} onClick={() => void submit()} loading={busy}>
            Terbitkan adendum
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <p className={styles.intro}>Dokumen sudah terkunci. Adendum membuat versi baru: catatan baru langsung berstatus Menunggu Revisi dan catatan lama tidak berubah.</p>
        <Textarea
          label="Alasan adendum"
          required
          rows={2}
          maxLength={1000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={reasonError ?? undefined}
          hint="Dicatat di riwayat versi."
          disabled={busy}
        />
        <Textarea
          label="Rekomendasi"
          rows={4}
          maxLength={RECOMMENDATION_MAX}
          value={recommendation}
          onChange={(event) => setRecommendation(event.target.value)}
          hint="Kosongkan perubahan bila rekomendasi tidak diubah."
          disabled={busy}
        />

        <div className={addendum.notes}>
          <h3 className={addendum.heading}>Catatan tambahan ({notes.length})</h3>
          {notes.length === 0 && !adding && <p className={addendum.empty}>Belum ada catatan tambahan.</p>}
          {notes.length > 0 && (
            <ul className={addendum.list} aria-label="Catatan tambahan">
              {notes.map((note, index) => (
                <li key={index} className={addendum.item}>
                  <div className={addendum.itemText}>
                    <span className={addendum.itemTitle}>{note.title}</span>
                    <span className={addendum.itemMeta}>
                      {CATEGORY_LABEL[note.category]} · <span className="mono">{expectationCode(note.expectation)}</span>
                    </span>
                  </div>
                  <IconButton icon={Trash2} label={`Buang catatan tambahan ${index + 1}`} disabled={busy} onClick={() => setNotes((current) => current.filter((_, i) => i !== index))} />
                </li>
              ))}
            </ul>
          )}
          {adding ? (
            <div className={addendum.draft}>
              <NoteFields form={draft} onChange={setDraft} errors={draftErrors} organizationUnitId={doc.organizationUnitId} withWorkUnit disabled={busy} />
              <div className={addendum.draftActions}>
                <Button size="sm" onClick={() => { setAdding(false); setDraftErrors({}); }} disabled={busy}>
                  Batal
                </Button>
                <Button size="sm" variant="utama" onClick={addDraft} disabled={busy}>
                  Tambahkan ke adendum
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button size="sm" icon={Plus} onClick={() => setAdding(true)} disabled={busy || notes.length >= 100}>
                Tambah catatan
              </Button>
            </div>
          )}
        </div>

        {serverError && (
          <p className={styles.formError} role="alert">
            <CircleAlert size={14} aria-hidden="true" />
            <span>{serverError}</span>
          </p>
        )}
      </div>
    </Dialog>
  );
}
