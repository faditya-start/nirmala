import type { NoteActionResponse, TrackerNoteDetailResponse } from "@nirmala/shared";
import { Check, FileCheck, Send, Undo2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../app/auth";
import { api, errorMessage, isApiError } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { Button, ConfirmDialog, Textarea } from "../../ui";
import { CHECK_TEXT, JUSTIFY_MAX, RETURN_MAX, validateJustification, validateReturnReason } from "./logic";
import styles from "./ActionPanels.module.css";

type Pending = "approve" | "return" | "accept" | "justify" | null;

export interface ActionPanelsProps {
  detail: TrackerNoteDetailResponse;
  /** Called after a successful action with a plain sentence for the page notice. The page reloads the detail. */
  onDone: (message: string) => void;
  /** Called when the server says the state changed under us (409) or another failure; the page reloads. */
  onFailed: (message: string) => void;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Who filled the justification, taken from the timeline (the contract keeps the text on the note). */
function justificationAuthor(detail: TrackerNoteDetailResponse): { name: string | null; at: number } | null {
  const event = [...detail.timeline].reverse().find((item) => item.type === "dijustifikasi");
  return event ? { name: event.actorName, at: event.at } : null;
}

/**
 * Right column of S9. Reviewer decision (dB0Ae, W4pDP9) and Justifikasi eselon I (x8CopO).
 * What is enabled comes from the endpoint's `permissions` (computed with canTransition on the server).
 * The system never closes a note: every closing button here is a person's action.
 */
export function ActionPanels({ detail, onDone, onFailed }: ActionPanelsProps) {
  const { user } = useAuth();
  const { note, permissions, latestEvidence } = detail;
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [justification, setJustification] = useState("");
  const [justifyError, setJustifyError] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);

  const busy = pending !== null;
  const result = latestEvidence?.result ?? note.latestCheckResult;
  const reviewerRelevant = permissions.canApprove || permissions.canReturn || permissions.canAcceptJustification;
  const showReviewerPanel = reviewerRelevant || (user?.role === "reviewer" && note.status !== "closed");
  const author = justificationAuthor(detail);

  async function run(kind: Exclude<Pending, null>, path: string, body: unknown, success: (res: NoteActionResponse) => string, onFieldError?: (message: string) => void) {
    setPending(kind);
    try {
      const response = await api.post<NoteActionResponse>(`/tracker/notes/${note.id}/${path}`, body);
      setReason("");
      setJustification("");
      onDone(success(response));
    } catch (error) {
      const message = errorMessage(error);
      if (isApiError(error) && error.status === 400 && onFieldError) onFieldError(message);
      else onFailed(message);
    } finally {
      setPending(null);
      setConfirmApprove(false);
    }
  }

  const completedText = (res: NoteActionResponse) => (res.chrCompleted ? " Semua catatan CHR ini sudah Closed, CHR menjadi Selesai." : "");

  function approve() {
    void run("approve", "approve", {}, (res) => `Catatan ditutup atas nama ${user?.name ?? "Anda"}.${completedText(res)}`);
  }

  function onApproveClick() {
    // Closing against the system's own proposal is allowed, but it should be a deliberate step.
    if (result !== "terpenuhi") setConfirmApprove(true);
    else approve();
  }

  function onReturn() {
    const problem = validateReturnReason(reason);
    setReasonError(problem);
    if (problem) return;
    void run("return", "return", { reason: reason.trim() }, () => "Catatan dikembalikan ke Satker dan akan dicek lagi pada snapshot revisi berikutnya.", setReasonError);
  }

  function onAccept() {
    void run("accept", "accept-justification", {}, (res) => `Justifikasi diterima dan catatan ditutup atas nama ${user?.name ?? "Anda"}.${completedText(res)}`);
  }

  function onJustify() {
    const problem = validateJustification(justification);
    setJustifyError(problem);
    if (problem) return;
    void run("justify", "justify", { justification: justification.trim() }, () => "Justifikasi terkirim. Status catatan menjadi Dijustifikasi dan menunggu keputusan reviewer.", setJustifyError);
  }

  const proposal =
    result === null
      ? "Belum ada hasil cek otomatis."
      : result === "data_tidak_cukup"
        ? "Sistem tidak bisa mengusulkan hasil karena data tidak cukup."
        : `Sistem mengusulkan: ${lowerFirst(CHECK_TEXT[result])}.`;

  return (
    <>
      {showReviewerPanel && (
        <section className={styles.panel} aria-labelledby="panel-keputusan">
          <h2 id="panel-keputusan" className={styles.title}>
            Keputusan reviewer
          </h2>
          <p className={styles.hint}>
            {proposal} {result === "data_tidak_cukup" ? "Reviewer yang memutuskan." : "Hanya reviewer yang bisa menutup atau mengembalikan."}
          </p>

          {note.status === "dijustifikasi" && note.justification && (
            <figure className={styles.quote}>
              <figcaption>
                Justifikasi eselon I{author ? ` · ${author.name ?? "Sistem"}, ${formatDateTime(author.at)}` : ""}
              </figcaption>
              <blockquote>{note.justification}</blockquote>
            </figure>
          )}

          <Textarea
            label="Alasan pengembalian (wajib untuk Kembalikan)"
            placeholder="Tulis alasan jika catatan dikembalikan"
            hint="Alasan dikirim ke Satker dan tercatat di riwayat."
            value={reason}
            maxLength={RETURN_MAX}
            error={reasonError}
            disabled={busy || !permissions.canReturn}
            onChange={(event) => {
              setReason(event.target.value);
              if (reasonError) setReasonError(null);
            }}
          />
          <div className={styles.actions}>
            <Button variant="utama" icon={Undo2} className={styles.full} disabled={busy || !permissions.canReturn} loading={pending === "return"} onClick={onReturn}>
              Kembalikan ke Satker
            </Button>
            <Button icon={Check} className={styles.full} disabled={busy || !permissions.canApprove} loading={pending === "approve"} onClick={onApproveClick}>
              Setujui dan tutup
            </Button>
            <Button icon={FileCheck} className={styles.full} disabled={busy || !permissions.canAcceptJustification} loading={pending === "accept"} onClick={onAccept}>
              Terima justifikasi
            </Button>
          </div>
          <p className={styles.hint}>
            {note.status === "dijustifikasi"
              ? "Terima justifikasi menutup catatan. Kembalikan mengirim catatan ke Satker untuk diperbaiki."
              : "Terima justifikasi aktif setelah PIC UKI mengisi alasan Satker."}
          </p>
        </section>
      )}

      {permissions.canJustify && (
        <section className={styles.panel} aria-labelledby="panel-justifikasi">
          <h2 id="panel-justifikasi" className={styles.title}>
            Justifikasi eselon I
          </h2>
          <p className={styles.hint}>
            Isi atas nama {detail.workUnitName ?? "Satker"} jika Satker tidak mengubah item ini. Reviewer yang memutuskan menutup.
          </p>
          <Textarea
            label="Alasan Satker tidak mengubah"
            hint="Wajib diisi. Status berubah menjadi Dijustifikasi."
            value={justification}
            maxLength={JUSTIFY_MAX}
            error={justifyError}
            disabled={busy}
            onChange={(event) => {
              setJustification(event.target.value);
              if (justifyError) setJustifyError(null);
            }}
          />
          <Button variant="utama" icon={Send} className={styles.full} disabled={busy} loading={pending === "justify"} onClick={onJustify}>
            Kirim justifikasi
          </Button>
          <p className={styles.hint}>PIC UKI bisa melihat catatan dan mengisi justifikasi, tetapi tidak bisa menutup catatan.</p>
        </section>
      )}

      {!showReviewerPanel && !permissions.canJustify && (
        <section className={styles.panel} aria-labelledby="panel-status">
          <h2 id="panel-status" className={styles.title}>
            {note.status === "closed" ? "Catatan Closed" : note.status === "dijustifikasi" ? "Justifikasi eselon I" : "Tindakan"}
          </h2>
          {note.status === "dijustifikasi" && note.justification && (
            <figure className={styles.quote}>
              <figcaption>{author ? `${author.name ?? "Sistem"} · ${formatDateTime(author.at)}` : "Isi justifikasi"}</figcaption>
              <blockquote>{note.justification}</blockquote>
            </figure>
          )}
          <p className={styles.hint}>
            {note.status === "closed"
              ? "Catatan ini sudah ditutup oleh reviewer. Tidak ada tindakan lagi."
              : note.status === "dijustifikasi"
                ? "Justifikasi sudah terkirim. Reviewer yang memutuskan menerima atau mengembalikan."
                : "Anda dapat melihat catatan ini. Penutupan dan pengembalian dilakukan oleh reviewer."}
          </p>
        </section>
      )}

      <ConfirmDialog
        open={confirmApprove}
        title="Setujui walau hasil cek belum terpenuhi?"
        icon={Check}
        description={`${proposal} Jika Anda menyetujui, catatan menjadi Closed atas keputusan Anda dan tercatat atas nama ${user?.name ?? "Anda"} di audit log.`}
        confirmLabel="Setujui dan tutup"
        busy={pending === "approve"}
        onConfirm={approve}
        onCancel={() => setConfirmApprove(false)}
      />
    </>
  );
}
