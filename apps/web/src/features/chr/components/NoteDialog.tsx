import { CircleAlert, FilePlus, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { ChrNoteDto, CreateNoteBody, UpdateNoteBody } from "@nirmala/shared";
import { errorMessage } from "../../../lib/api-error";
import { Button, Dialog } from "../../../ui";
import { buildExpectation, emptyNoteForm, expectationToForm, hasErrors, validateNoteForm, type NoteForm, type NoteFormErrors } from "../logic";
import styles from "./Forms.module.css";
import { NoteFields } from "./NoteFields";

export interface NoteDialogProps {
  open: boolean;
  /** null = new manual note. */
  note: ChrNoteDto | null;
  organizationUnitId: string;
  onCreate: (body: CreateNoteBody) => Promise<void>;
  onUpdate: (noteId: string, body: UpdateNoteBody) => Promise<void>;
  onClose: () => void;
}

function formFromNote(note: ChrNoteDto | null): NoteForm {
  if (!note) return emptyNoteForm();
  return { category: note.category, title: note.title, text: note.text, workUnitId: note.workUnitId ?? "", expectation: expectationToForm(note.expectation) };
}

/**
 * Add or edit one catatan while the CHR is a draft. Field checks use the shared zod schemas; the server's
 * message (409 locked, 400, ...) is shown inside the dialog. Mount it with a fresh `key` for each opening.
 */
export function NoteDialog({ open, note, organizationUnitId, onCreate, onUpdate, onClose }: NoteDialogProps) {
  const [form, setForm] = useState<NoteForm>(() => formFromNote(note));
  const [errors, setErrors] = useState<NoteFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = note !== null;
  const formId = "chr-note-form";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const { errors: found, expectation } = validateNoteForm(form, { needsTitle: true, needsWorkUnit: !editing });
    setErrors(found);
    setServerError(null);
    if (hasErrors(found) || !expectation) return;

    setBusy(true);
    try {
      if (note) {
        const original = formFromNote(note);
        const body: UpdateNoteBody = {};
        if (form.category !== original.category) body.category = form.category;
        if (form.title.trim() !== original.title) body.title = form.title.trim();
        if (form.text.trim() !== original.text.trim()) body.text = form.text.trim();
        const before = buildExpectation(original.expectation);
        if (!before.ok || JSON.stringify(before.value) !== JSON.stringify(expectation)) body.expectation = expectation;
        if (Object.keys(body).length === 0) {
          setServerError("Belum ada perubahan untuk disimpan.");
          return;
        }
        await onUpdate(note.id, body);
      } else {
        await onCreate({
          category: form.category,
          title: form.title.trim(),
          text: form.text.trim(),
          expectation,
          workUnitId: form.workUnitId
        });
      }
    } catch (error) {
      setServerError(errorMessage(error, "Catatan belum tersimpan. Coba lagi."));
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
      icon={editing ? Save : FilePlus}
      title={editing ? `Ubah catatan ${note.number}` : "Tambah catatan"}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant="utama" type="submit" form={formId} icon={Save} loading={busy}>
            Simpan catatan
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        {!editing && <p className={styles.intro}>Catatan manual untuk Satker tanpa melalui Risk Triage. Catatan dari Risk Triage diubah lewat daftar di editor ini.</p>}
        <NoteFields form={form} onChange={setForm} errors={errors} organizationUnitId={organizationUnitId} withWorkUnit={!editing} disabled={busy} />
        {serverError && (
          <p className={styles.formError} role="alert">
            <CircleAlert size={14} aria-hidden="true" />
            <span>{serverError}</span>
          </p>
        )}
      </form>
    </Dialog>
  );
}
