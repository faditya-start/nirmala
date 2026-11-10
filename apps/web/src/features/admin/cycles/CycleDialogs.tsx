import { CYCLE_STAGES, CYCLE_STATUSES, type CycleResponse, type MarkDipaIssuedResponse, type ReviewCycleDto } from "@nirmala/shared";
import { Check, Globe, Undo2, X } from "lucide-react";
import { useState } from "react";
import { api } from "../../../lib/api";
import { failureMessage } from "../errors";
import { formatDate } from "../../../lib/format";
import { Button, Dialog, Input, Select } from "../../../ui";
import { Alert } from "../components/Alert";
import { STAGE_LABEL } from "../labels";
import { fromDateInput, toDateInput, validateCycleForm, type CreateCycleForm } from "./cycleForm";
import styles from "./CycleDialogs.module.css";

interface BaseProps {
  open: boolean;
  onClose: () => void;
}

const STATUS_LABEL = { aktif: "Aktif", selesai: "Selesai" } as const;

/** e2AA59 · Buat siklus. */
export function CreateCycleDialog({ open, onClose, defaultYear, onDone }: BaseProps & { defaultYear: number; onDone: () => void }) {
  const [form, setForm] = useState<CreateCycleForm>({ fiscalYear: String(defaultYear), stage: "alokasi", adkDeadline: "" });
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = attempted ? validateCycleForm(form) : {};

  async function submit() {
    setAttempted(true);
    setError(null);
    if (busy || Object.keys(validateCycleForm(form)).length > 0) return;
    setBusy(true);
    try {
      const adkDeadline = fromDateInput(form.adkDeadline);
      await api.post<CycleResponse>("/cycles", { fiscalYear: Number(form.fiscalYear), stage: form.stage, ...(adkDeadline !== null ? { adkDeadline } : {}) });
      onDone();
    } catch (failure) {
      setError(failureMessage(failure));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Buat siklus"
      dismissible={!busy}
      actions={
        <>
          <Button icon={X} onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" form="create-cycle" variant="utama" icon={Check} loading={busy}>
            Simpan siklus
          </Button>
        </>
      }
    >
      <form
        id="create-cycle"
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className={styles.description}>Isi tahun anggaran, tahap, dan tenggat ADK.</p>
        {error && <Alert>{error}</Alert>}
        <Input label="Tahun anggaran" value={form.fiscalYear} inputMode="numeric" maxLength={4} error={errors.fiscalYear} onChange={(event) => setForm({ ...form, fiscalYear: event.target.value })} required />
        <Select label="Tahap" value={form.stage} error={errors.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })} options={CYCLE_STAGES.slice().reverse().map((stage) => ({ value: stage, label: STAGE_LABEL[stage] }))} />
        <Input label="Tenggat ADK" type="date" value={form.adkDeadline} error={errors.adkDeadline} hint={errors.adkDeadline ? undefined : "Boleh dikosongkan dan diisi nanti lewat Ubah."} onChange={(event) => setForm({ ...form, adkDeadline: event.target.value })} />
      </form>
    </Dialog>
  );
}

/** l9cPH · Tandai DIPA terbit. */
export function MarkDipaDialog({ cycle, open, onClose, onDone }: BaseProps & { cycle: ReviewCycleDto; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(() => Date.now());

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post<MarkDipaIssuedResponse>(`/cycles/${cycle.id}/dipa-issued`, {});
      onDone();
    } catch (failure) {
      setError(failureMessage(failure));
      setBusy(false);
    }
  }

  const label = `TA ${cycle.fiscalYear} · ${STAGE_LABEL[cycle.stage]}`;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Tandai DIPA terbit untuk ${label}?`}
      icon={Globe}
      dismissible={!busy}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant="utama" icon={Globe} onClick={() => void confirm()} loading={busy}>
            Tandai terbit
          </Button>
        </>
      }
    >
      <p className={styles.consequence}>
        Agregat siklus ini akan tampil di halaman Transparansi publik: jumlah catatan, persentase closed, dan median hari per eselon I dan kategori. Tidak ada item, nama Satker, atau rupiah per item.
      </p>
      <div className={styles.summary}>{`${label} · tanggal terbit ${formatDate(today)}`}</div>
      {error && <Alert>{error}</Alert>}
    </Dialog>
  );
}

/** "Ubah": name, ADK deadline and status. A marked DIPA can be withdrawn here (not in the design; covers a wrong click). */
export function EditCycleDialog({ cycle, open, onClose, onDone }: BaseProps & { cycle: ReviewCycleDto; onDone: () => void }) {
  const [name, setName] = useState(cycle.name);
  const [deadline, setDeadline] = useState(toDateInput(cycle.adkDeadline));
  const [status, setStatus] = useState<string>(cycle.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [confirmRetract, setConfirmRetract] = useState(false);

  const nameError = attempted && name.trim().length < 3 ? "Nama siklus minimal 3 karakter." : undefined;

  async function submit() {
    setAttempted(true);
    setError(null);
    if (busy || name.trim().length < 3) return;
    setBusy(true);
    try {
      await api.put<CycleResponse>(`/cycles/${cycle.id}`, { name: name.trim(), adkDeadline: fromDateInput(deadline), status });
      onDone();
    } catch (failure) {
      setError(failureMessage(failure));
      setBusy(false);
    }
  }

  async function retract() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete<CycleResponse>(`/cycles/${cycle.id}/dipa-issued`);
      onDone();
    } catch (failure) {
      setError(failureMessage(failure));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Ubah ${cycle.name}`}
      dismissible={!busy}
      actions={
        <>
          <Button icon={X} onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" form="edit-cycle" variant="utama" icon={Check} loading={busy}>
            Simpan perubahan
          </Button>
        </>
      }
    >
      <form
        id="edit-cycle"
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className={styles.description}>Tahun anggaran dan tahap tidak bisa diubah.</p>
        {error && <Alert>{error}</Alert>}
        <Input label="Nama siklus" value={name} error={nameError} onChange={(event) => setName(event.target.value)} required />
        <Input label="Tenggat ADK" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
        <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value)} options={CYCLE_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }))} />
      </form>
      {cycle.dipaIssuedAt !== null && (
        <div className={styles.retract}>
          <p>DIPA ditandai terbit pada {formatDate(cycle.dipaIssuedAt)}. Bila salah tandai, penandaan bisa ditarik dan agregat publik siklus ini dihapus.</p>
          {confirmRetract ? (
            <div className={styles.retractActions}>
              <Button variant="bahaya" size="sm" icon={Undo2} onClick={() => void retract()} loading={busy}>
                Ya, tarik penandaan
              </Button>
              <Button size="sm" onClick={() => setConfirmRetract(false)} disabled={busy}>
                Jangan
              </Button>
            </div>
          ) : (
            <Button size="sm" icon={Undo2} onClick={() => setConfirmRetract(true)} disabled={busy}>
              Tarik penandaan DIPA
            </Button>
          )}
        </div>
      )}
    </Dialog>
  );
}
