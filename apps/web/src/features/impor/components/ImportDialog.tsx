import type { ImportOverviewRow, ReviewCycleDto, SnapshotDto } from "@nirmala/shared";
import { Circle, CircleAlert, CircleCheck, Eye, FileSpreadsheet, Files, Info, LoaderCircle, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { errorMessage } from "../../../lib/api";
import { formatDateTime, formatNumber } from "../../../lib/format";
import { Button, Select } from "../../../ui";
import { hashFile, lookupSnapshot } from "../api";
import {
  clampPercent,
  currentStepLabel,
  formatFileSize,
  isCsvFileName,
  looksLikeSipeka,
  stageName,
  stepLabel,
  versionHint,
  versionText,
  waitingSteps
} from "../logic";
import type { RunContext, RunnerState } from "../useImportRunner";
import { ModalFrame } from "./ModalFrame";
import styles from "./ImportDialog.module.css";

export interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  cycle: ReviewCycleDto;
  rows: ImportOverviewRow[];
  /** Eselon I preselected when the dialog opens (from the row button). */
  initialOrganizationId: string | null;
  runner: { state: RunnerState; start: (context: RunContext, input: { file: File; organizationUnitId: string; versionNo: number }) => Promise<void>; resume: () => void };
  onViewSnapshot: (snapshot: SnapshotDto) => void;
  onReloadList: () => void;
}

type Check = { status: "idle" } | { status: "checking" } | { status: "done"; duplicate: SnapshotDto | null };

export function ImportDialog({ open, onClose, cycle, rows, initialOrganizationId, runner, onViewSnapshot, onReloadList }: ImportDialogProps) {
  const [organizationId, setOrganizationId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sipeka, setSipeka] = useState<boolean | null>(null);
  const [check, setCheck] = useState<Check>({ status: "idle" });
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const token = useRef(0);

  // Fresh form every time the dialog opens (unless an import is still being tracked).
  useEffect(() => {
    if (!open) return;
    setOrganizationId((current) => {
      const wanted = initialOrganizationId ?? current;
      return rows.some((row) => row.organizationUnit.id === wanted) ? wanted : (rows[0]?.organizationUnit.id ?? "");
    });
    if (runner.state.phase === "idle" || runner.state.phase === "done") {
      setFile(null);
      setSipeka(null);
      setCheck({ status: "idle" });
      setFileProblem(null);
    }
    const timer = window.setTimeout(() => selectRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
    // Only on open: later row refreshes must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const row = useMemo(() => rows.find((r) => r.organizationUnit.id === organizationId) ?? null, [rows, organizationId]);

  const chooseFile = useCallback(
    async (next: File | null) => {
      const mine = ++token.current;
      setFile(next);
      setSipeka(null);
      setCheck({ status: "idle" });
      setFileProblem(null);
      if (!next) return;
      if (!isCsvFileName(next.name)) {
        setFileProblem("File harus berformat CSV (.csv).");
        return;
      }
      if (next.size === 0) {
        setFileProblem("File kosong. Pilih file CSV yang berisi data.");
        return;
      }
      setCheck({ status: "checking" });
      try {
        setSipeka(looksLikeSipeka(await next.slice(0, 8192).text()));
      } catch {
        setSipeka(null);
      }
      try {
        const hash = await hashFile(next);
        if (mine !== token.current) return;
        if (!hash) {
          setCheck({ status: "done", duplicate: null });
          return;
        }
        const result = await lookupSnapshot(cycle.id, hash);
        if (mine === token.current) setCheck({ status: "done", duplicate: result.snapshot });
      } catch {
        // The check is a courtesy; the server answers "sudah diimpor" itself on upload.
        if (mine === token.current) setCheck({ status: "done", duplicate: null });
      }
    },
    [cycle.id]
  );

  const state = runner.state;
  const inProgress = state.phase === "uploading" || state.phase === "running";
  const duplicate = check.status === "done" && check.duplicate ? check.duplicate : state.phase === "done" && state.response.alreadyImported ? state.response.snapshot : null;
  const nextVersion = row?.nextVersionNo ?? 1;

  function submit() {
    if (!file || !row || inProgress || check.status === "checking" || fileProblem) return;
    void runner.start(
      {
        cycleId: cycle.id,
        fileName: file.name,
        fileSize: file.size,
        organizationName: row.organizationUnit.shortName,
        versionNo: row.nextVersionNo,
        versionLabel: row.nextLabel
      },
      { file, organizationUnitId: row.organizationUnit.id, versionNo: row.nextVersionNo }
    );
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped && !inProgress) void chooseFile(dropped);
  }

  const subtitle = `TA ${cycle.fiscalYear} · ${stageName(cycle.stage)}`;

  /* -------------------------------------------------------------- progress view */
  if (open && inProgress) {
    const context = state.context;
    const job = state.phase === "running" ? state.job : null;
    const uploading = state.phase === "uploading";
    const steps = job?.steps ?? waitingSteps();
    const percent = uploading ? (state.total > 0 ? clampPercent((state.loaded / state.total) * 100) : 0) : clampPercent(job?.percent ?? 0);
    const heading = uploading ? "Mengunggah file" : currentStepLabel(steps);
    const rowsText = uploading
      ? `${formatFileSize(state.loaded)} dari ${formatFileSize(state.total)} terkirim`
      : job && job.rowsTotal !== null
        ? `${formatNumber(job.rowsDone)} dari ${formatNumber(job.rowsTotal)} baris dibaca`
        : "Menunggu server menghitung baris…";
    const rowTotal = job?.rowsTotal ? ` · ${formatNumber(job.rowsTotal)} baris` : "";
    return (
      <ModalFrame
        open={open}
        onClose={onClose}
        title="Impor CSV"
        subtitle={subtitle}
        actions={
          <Button variant="sekunder" disabled icon={LoaderCircle} className={styles.processing}>
            Memproses…
          </Button>
        }
      >
        <div className={styles.fileBox}>
          <FileSpreadsheet size={20} aria-hidden="true" />
          <div className={styles.fileText}>
            <div className={`${styles.fileName} mono`}>{context.fileName}</div>
            <div className={styles.fileMeta}>
              {context.organizationName} · v{context.versionNo} {context.versionLabel}
              {rowTotal}
            </div>
          </div>
        </div>
        <div className={styles.progress} role="status" aria-live="polite">
          <div className={styles.progressHead}>
            <span>{heading}</span>
            <span className="num">{percent}%</span>
          </div>
          <div
            className={styles.track}
            role="progressbar"
            aria-label="Kemajuan impor"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${heading}, ${percent} persen`}
          >
            <div className={styles.fill} style={{ width: `${percent}%` }} />
          </div>
          <div className={`${styles.rows} mono`}>{rowsText}</div>
          {state.phase === "running" && state.pollFailures > 0 && (
            <p className={styles.soft}>Status belum terbaca, mencoba lagi. Proses di server tetap berjalan.</p>
          )}
        </div>
        <ol className={styles.steps}>
          {steps.map((step) => (
            <li key={step.key} className={styles.step} data-status={step.status}>
              {step.status === "selesai" ? (
                <CircleCheck size={16} aria-hidden="true" />
              ) : step.status === "berjalan" ? (
                <LoaderCircle size={16} aria-hidden="true" className={styles.spin} />
              ) : (
                <Circle size={16} aria-hidden="true" />
              )}
              <span className={styles.stepLabel}>{stepLabel(step.key)}</span>
              <span className={styles.stepStatus}>{step.status}</span>
            </li>
          ))}
        </ol>
        <p className={styles.soft}>Dialog boleh ditutup. Impor tetap berjalan di server dan statusnya muncul di halaman ini.</p>
      </ModalFrame>
    );
  }

  /* -------------------------------------------------------------- form view */
  const errorState = state.phase === "error" ? state : null;
  const checking = check.status === "checking";
  const canSubmit = !!file && !!row && !checking && !fileProblem;

  return (
    <ModalFrame
      open={open}
      onClose={onClose}
      title="Impor CSV"
      subtitle={subtitle}
      actions={
        <>
          <Button onClick={onClose}>Batal</Button>
          {errorState?.lost ? (
            <Button variant="utama" icon={LoaderCircle} onClick={onReloadList}>
              Muat ulang daftar
            </Button>
          ) : errorState?.jobId && !errorState.lost && !file ? (
            <Button variant="utama" onClick={runner.resume}>
              Lanjut menunggu
            </Button>
          ) : duplicate ? (
            <Button variant="utama" icon={Eye} onClick={() => onViewSnapshot(duplicate)}>
              Lihat snapshot v{duplicate.versionNo}
            </Button>
          ) : (
            <Button variant="utama" icon={Upload} onClick={submit} disabled={!canSubmit} loading={checking}>
              Unggah dan proses
            </Button>
          )}
        </>
      }
    >
      {rows.length === 0 ? (
        <p className={styles.soft}>Tidak ada eselon I yang bisa Anda impor pada siklus ini.</p>
      ) : (
        <>
          <Select
            ref={selectRef}
            label="Eselon I"
            hint="Hanya eselon I yang ditugaskan kepada Anda."
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
            options={rows.map((r) => ({ value: r.organizationUnit.id, label: r.organizationUnit.shortName }))}
          />
          <Select
            label="Label versi"
            hint={versionHint(row?.snapshots ?? [])}
            value={String(nextVersion)}
            onChange={() => undefined}
            options={[{ value: String(nextVersion), label: versionText(nextVersion) }]}
          />
          <div className={styles.fileField}>
            <span className={styles.fieldLabel} id="impor-file-label">
              File CSV
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              tabIndex={-1}
              aria-labelledby="impor-file-label"
              onChange={(event) => {
                void chooseFile(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <div
              className={styles.fileBox}
              data-dragging={dragging || undefined}
              data-problem={fileProblem ? "" : undefined}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <FileSpreadsheet size={20} aria-hidden="true" />
              <div className={styles.fileText}>
                {file ? (
                  <>
                    <div className={`${styles.fileName} mono`} title={file.name}>
                      {file.name}
                    </div>
                    <div className={styles.fileMeta}>
                      {formatFileSize(file.size)}
                      {sipeka === true ? " · format SIPEKA" : sipeka === false ? " · judul kolom BAES1 dan TAHUN tidak terbaca" : ""}
                      {checking ? " · memeriksa file…" : ""}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.fileName}>Belum ada file</div>
                    <div className={styles.fileMeta}>Pilih file CSV format SIPEKA atau tarik ke sini.</div>
                  </>
                )}
              </div>
              <Button variant="ghost" onClick={() => inputRef.current?.click()}>
                {file ? "Ganti" : "Pilih file"}
              </Button>
            </div>
            {fileProblem && (
              <p className={styles.problem} role="alert">
                <CircleAlert size={12} aria-hidden="true" />
                <span>{fileProblem}</span>
              </p>
            )}
          </div>

          {duplicate ? (
            <div className={styles.note} role="status">
              <Files size={16} aria-hidden="true" />
              <p>
                File ini sama dengan snapshot {versionText(duplicate.versionNo)} yang diimpor {duplicate.importedByName ?? "pengguna lain"} pada{" "}
                {formatDateTime(duplicate.importedAt).replace(" · ", ", ")} ({formatNumber(duplicate.rowCount)} item). Tidak ada data yang diproses ulang.
              </p>
            </div>
          ) : (
            <div className={styles.hint}>
              <Info size={14} aria-hidden="true" />
              <p>Jika file yang sama pernah diimpor (hash sama), snapshot lama ditampilkan dan tidak diproses ulang.</p>
            </div>
          )}

          {errorState && (
            <div className={styles.error} role="alert">
              <CircleAlert size={14} aria-hidden="true" />
              <p>{errorState.message}</p>
            </div>
          )}
        </>
      )}
    </ModalFrame>
  );
}

