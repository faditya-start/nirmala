import {
  confirmItemBodySchema,
  type ConfirmItemBody,
  type ConfirmItemResponse,
  type DismissReasonDto,
  type NoteCategory,
  type TriageItemDetailResponse
} from "@nirmala/shared";
import { ArrowRight, Ban, Check, ChevronRight, CircleAlert, CircleCheck, Undo2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api, errorMessage, isApiError } from "../../../lib/api";
import { formatNumber } from "../../../lib/format";
import { Button, ButtonLink, ConfirmDialog, DecisionBadge, Select, StatusBadge, Textarea } from "../../../ui";
import { describeExpectation, expectationFromForm, formFromExpectation, type ExpectationErrors, type ExpectationForm } from "../expectation";
import { CATEGORY_LABEL, CATEGORY_OPTIONS } from "../labels";
import { friendlyError } from "../useRequest";
import { ExpectationEditor } from "./ExpectationEditor";
import styles from "./DecisionPanel.module.css";

export interface DecisionPanelProps {
  detail: TriageItemDetailResponse;
  reasons: DismissReasonDto[] | null;
  reasonsFailed: boolean;
  /** Muat ulang detail setelah keputusan berubah (juga untuk 409). */
  onChanged: () => Promise<void>;
  /** Tautan "Item berikutnya"; null bila tidak ada. */
  nextHref: string | null;
}

type Mode = "confirm" | "dismiss";

/** Panel kanan S5: Keputusan reviewer (BftML konfirmasi, l5Oo0 dismiss, rs38h setelah keputusan). */
export function DecisionPanel({ detail, reasons, reasonsFailed, onChanged, nextHref }: DecisionPanelProps) {
  const { decision } = detail;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusAfter = useRef(false);

  useEffect(() => {
    if (decision && focusAfter.current) {
      focusAfter.current = false;
      headingRef.current?.focus();
    }
  }, [decision]);

  const badge = !decision ? (
    <DecisionBadge decision="belum_ditinjau" />
  ) : decision.decision === "dismiss" ? (
    <DecisionBadge decision="dismiss" />
  ) : decision.chrNote && decision.chrNote.status !== "draf" ? (
    <StatusBadge status={decision.chrNote.status} />
  ) : (
    <DecisionBadge decision="draf_di_chr" />
  );

  return (
    <aside className={styles.panel} aria-labelledby="decision-title">
      <div className={styles.head}>
        <h2 id="decision-title" ref={headingRef} tabIndex={-1} className={styles.title}>
          Keputusan reviewer
        </h2>
        {decision && badge}
      </div>
      {decision ? (
        <Decided detail={detail} nextHref={nextHref} onChanged={onChanged} />
      ) : detail.canDecide ? (
        <DecisionForms
          detail={detail}
          reasons={reasons}
          reasonsFailed={reasonsFailed}
          onChanged={async () => {
            focusAfter.current = true;
            await onChanged();
          }}
        />
      ) : (
        <p className={styles.note}>Item ini belum ditinjau. Hanya reviewer yang bisa mengonfirmasi atau men-dismiss item.</p>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------ Form */

function DecisionForms({ detail, reasons, reasonsFailed, onChanged }: Pick<DecisionPanelProps, "detail" | "reasons" | "reasonsFailed"> & { onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<Mode>("confirm");
  const modeName = useId();
  const defaults = detail.confirmDefaults;
  const id = detail.item.id;

  // Isian confirm
  const [category, setCategory] = useState<NoteCategory>(defaults.category);
  const [text, setText] = useState(defaults.text);
  const [expectation, setExpectation] = useState<ExpectationForm>(() => formFromExpectation(defaults.expectation));
  // Isian dismiss
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const ruleCode = defaults.ruleCode;
  const textCheck = confirmItemBodySchema.shape.text.safeParse(text);
  const textError = attempted && !textCheck.success ? textCheck.error.issues[0]?.message : undefined;
  const expectationResult = expectationFromForm(expectation);
  const expectationErrors: ExpectationErrors = attempted && !expectationResult.ok ? expectationResult.errors : {};

  async function run(action: () => Promise<unknown>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setServerError(null);
    try {
      await action();
      await onChanged();
    } catch (error) {
      setServerError(friendlyError(error, errorMessage(error)));
      // 409: ada yang sudah memutuskan item ini; tampilkan keadaan terbaru.
      if (isApiError(error) && error.status === 409) await onChanged().catch(() => undefined);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function submitConfirm() {
    setAttempted(true);
    if (!textCheck.success || !expectationResult.ok) return;
    const body: ConfirmItemBody = { category, text: textCheck.data, expectation: expectationResult.value };
    void run(() => api.post<ConfirmItemResponse>(`/triage/items/${encodeURIComponent(id)}/confirm`, body));
  }

  function submitDismiss() {
    if (!reason) return;
    const trimmed = note.trim();
    void run(() => api.post(`/triage/items/${encodeURIComponent(id)}/dismiss`, { reasonCategory: reason, ...(trimmed ? { note: trimmed } : {}) }));
  }

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (mode === "confirm") submitConfirm();
        else submitDismiss();
      }}
    >
      <fieldset className={styles.modes} disabled={busy}>
        <legend className="sr-only">Jenis keputusan</legend>
        {(
          [
            ["confirm", "Konfirmasi", Check],
            ["dismiss", "Dismiss", Ban]
          ] as const
        ).map(([value, label, Icon]) => (
          <label key={value} className={styles.mode} data-checked={mode === value || undefined}>
            <input type="radio" name={modeName} value={value} checked={mode === value} className={styles.modeInput} onChange={() => setMode(value)} />
            <Icon size={14} aria-hidden="true" />
            {label}
          </label>
        ))}
      </fieldset>

      {mode === "confirm" ? (
        <>
          {ruleCode && <p className={styles.prefill}>Kategori, teks, dan ekspektasi terisi dari aturan {ruleCode}. Ubah bila perlu.</p>}
          <Select
            label="Kategori catatan"
            title={CATEGORY_LABEL[category]}
            options={CATEGORY_OPTIONS}
            value={category}
            disabled={busy}
            hint={ruleCode ? undefined : "Item ini tidak kena aturan. Pilih kategori yang sesuai."}
            onChange={(event) => setCategory(event.target.value as NoteCategory)}
          />
          <Textarea
            label="Teks catatan"
            rows={5}
            maxLength={2000}
            disabled={busy}
            value={text}
            error={textError}
            hint={ruleCode ? undefined : "Tulis alasan catatan untuk Satker, minimal 5 karakter."}
            onChange={(event) => setText(event.target.value)}
          />
          <ExpectationEditor
            value={expectation}
            onChange={setExpectation}
            errors={expectationErrors}
            disabled={busy}
          />
          {serverError && <ErrorLine>{serverError}</ErrorLine>}
          <Button type="submit" variant="utama" icon={Check} loading={busy} className={styles.wide}>
            Konfirmasi dan masukkan ke CHR
          </Button>
          <p className={styles.footnote}>Catatan masuk CHR {detail.item.organizationUnitName} berstatus Draf. Belum terkirim ke Satker.</p>
        </>
      ) : (
        <>
          <Select
            label="Alasan dismiss (wajib)"
            placeholder="Pilih kategori alasan"
            options={(reasons ?? []).map((entry) => ({ value: entry.code, label: entry.label }))}
            value={reason}
            disabled={busy || reasons === null}
            hint={reasonsFailed ? "Daftar alasan tidak dapat dimuat. Muat ulang halaman ini." : "Pilih salah satu. Alasan masuk korpus umpan balik."}
            onChange={(event) => setReason(event.target.value)}
          />
          <Textarea
            label="Catatan (opsional)"
            placeholder="Tambahkan konteks untuk korpus umpan balik"
            maxLength={1000}
            disabled={busy}
            value={note}
            hint="Tidak ikut ke CHR."
            onChange={(event) => setNote(event.target.value)}
          />
          {serverError && <ErrorLine>{serverError}</ErrorLine>}
          <Button type="submit" icon={Ban} loading={busy} disabled={!reason} className={styles.wide}>
            Simpan dismiss
          </Button>
        </>
      )}
    </form>
  );
}

function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p className={styles.error} role="alert">
      <CircleAlert size={14} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/* ------------------------------------------------------------ Sudah diputuskan */

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Decided({ detail, nextHref, onChanged }: { detail: TriageItemDetailResponse; nextHref: string | null; onChanged: () => Promise<void> }) {
  const decision = detail.decision!;
  const note = decision.chrNote;
  const chr = detail.chr;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const canRevert = detail.canDecide && !decision.inherited;

  async function revert() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/triage/items/${encodeURIComponent(detail.item.id)}/decision`);
      setConfirming(false);
      await onChanged();
    } catch (caught) {
      setError(friendlyError(caught, errorMessage(caught)));
      setConfirming(false);
      if (isApiError(caught) && caught.status === 409) await onChanged().catch(() => undefined);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={styles.decided}>
      <p className={styles.success} role="status">
        <CircleCheck size={16} aria-hidden="true" />
        <span>
          {decision.decision === "confirm"
            ? `Catatan ditambahkan ke CHR ${chr?.organizationUnitName ?? detail.item.organizationUnitName}.`
            : "Item ini di-dismiss dan tidak masuk CHR."}
        </span>
      </p>
      {decision.inherited && <p className={styles.note}>Keputusan diwarisi dari versi sebelumnya karena item tidak berubah. Keputusan ini tidak bisa diubah dari item ini.</p>}
      <dl className={styles.details}>
        {decision.decision === "confirm" && note ? (
          <>
            <Detail label="Kategori">{CATEGORY_LABEL[note.category]}</Detail>
            <Detail label="Ekspektasi">{describeExpectation(note.expectation, formatNumber)}</Detail>
            <Detail label="Status">
              {note.status === "draf" ? "Draf. Bisa diubah atau dihapus sampai CHR diterbitkan." : `${note.status.replace("_", " ")}. Catatan sudah terkirim dan tidak bisa dihapus dari sini.`}
            </Detail>
          </>
        ) : (
          <>
            <Detail label="Alasan">{decision.reasonLabel ?? decision.reasonCategory ?? "-"}</Detail>
            {decision.note && <Detail label="Catatan">{decision.note}</Detail>}
          </>
        )}
        <Detail label="Diputuskan oleh">{decision.reviewerName}</Detail>
      </dl>
      {decision.decision === "confirm" && chr && (
        <ButtonLink to={`/chr/${encodeURIComponent(chr.id)}`} variant="utama" icon={ArrowRight} className={styles.wide}>
          Buka CHR {chr.organizationUnitName}
        </ButtonLink>
      )}
      {nextHref ? (
        <ButtonLink to={nextHref} replace icon={ChevronRight} className={styles.wide}>
          Item berikutnya
        </ButtonLink>
      ) : (
        <p className={styles.footnote}>Tidak ada item berikutnya di daftar ini.</p>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      {canRevert && (
        <Button variant="ghost" size="sm" icon={Undo2} onClick={() => setConfirming(true)} className={styles.revert}>
          Ubah keputusan
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        icon={Undo2}
        tone="bahaya"
        title="Batalkan keputusan ini?"
        description={
          decision.decision === "confirm"
            ? "Catatan draf di CHR ikut dihapus dan item kembali berstatus belum ditinjau."
            : "Item kembali berstatus belum ditinjau."
        }
        summary={detail.item.description}
        confirmLabel="Ya, batalkan keputusan"
        confirmIcon={Undo2}
        busy={busy}
        onConfirm={() => void revert()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

