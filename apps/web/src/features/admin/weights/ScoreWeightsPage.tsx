import type { RecalculateAcceptedResponse, RecalculateJobDto, RiskConfigCreatedResponse, RiskConfigResponse } from "@nirmala/shared";
import { CircleCheck, CircleDashed, CircleAlert, Info, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCycle } from "../../../app/cycle";
import { cn } from "../../../lib/cn";
import density from "../components/density.module.css";
import { api, isApiError } from "../../../lib/api";
import { failureMessage } from "../errors";
import { formatDate, formatNumber } from "../../../lib/format";
import { Button, EmptyState, Input, Loading, PageHeader, ProgressBar, SectionHeader, Table, TableFrame, TagChip, TBody, Td, Th, THead, Tr } from "../../../ui";
import { Alert } from "../components/Alert";
import { useResource } from "../useResource";
import { FACTOR_ORDER, formatDelta, invalidCodes, isDirty, parseWhole, thresholdError, toDraft, totalState, versionLine, type FactorCode, type ThresholdDraft, type WeightDraft } from "./weights";
import styles from "./ScoreWeightsPage.module.css";

type Recalc =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "running"; job: RecalculateJobDto | null }
  | { phase: "done"; job: RecalculateJobDto }
  | { phase: "failed"; message: string };

/** S12b · Bobot skor (Yo9Xk). Route: /admin/bobot. */
export function ScoreWeightsPage() {
  const { active: cycle } = useCycle();
  const resource = useResource(() => api.get<RiskConfigResponse>("/admin/risk-config"), "risk-config");
  const config = resource.data;

  const [draft, setDraft] = useState<WeightDraft | null>(null);
  const [thresholds, setThresholds] = useState<ThresholdDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [recalc, setRecalc] = useState<Recalc>({ phase: "idle" });

  // Start the form from the active version whenever a version arrives.
  const activeId = config?.active.id;
  useEffect(() => {
    if (!config) return;
    setDraft(toDraft(config.active.weights));
    setThresholds({ medium: String(config.active.thresholds.medium), high: String(config.active.thresholds.high) });
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------ recalculate */
  const pollRef = useRef<number | null>(null);
  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  function poll(jobId: string) {
    stopPolling();
    let busy = false;
    pollRef.current = window.setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const job = await api.get<RecalculateJobDto>(`/jobs/${jobId}`);
        if (job.status === "berjalan") setRecalc({ phase: "running", job });
        else {
          stopPolling();
          setRecalc(job.status === "selesai" ? { phase: "done", job } : { phase: "failed", message: job.error ?? "Hitung ulang gagal. Coba lagi." });
        }
      } catch (error) {
        stopPolling();
        setRecalc({ phase: "failed", message: isApiError(error) && error.status === 404 ? "Proses hitung ulang tidak ditemukan. Server mungkin dimulai ulang, jalankan hitung ulang lagi." : failureMessage(error) });
      } finally {
        busy = false;
      }
    }, 1000);
  }

  async function startRecalculate() {
    if (!cycle || recalc.phase === "starting" || recalc.phase === "running") return;
    setRecalc({ phase: "starting" });
    try {
      const accepted = await api.post<RecalculateAcceptedResponse>("/admin/risk-config/recalculate", { cycleId: cycle.id });
      setRecalc({ phase: "running", job: null });
      poll(accepted.jobId);
    } catch (error) {
      setRecalc({ phase: "failed", message: failureMessage(error) });
    }
  }

  /* ------------------------------------------------------------ save version */
  const total = draft ? totalState(draft) : null;
  const thresholdMessage = thresholds ? thresholdError(thresholds) : null;
  const dirty = Boolean(config && draft && thresholds && isDirty(draft, thresholds, config.active));
  const canSave = dirty && total?.ok === true && thresholdMessage === null && !saving;
  const nextVersion = config ? String(Number(config.active.version) + 1) : "";

  async function save() {
    if (!config || !draft || !thresholds || !canSave) return;
    setSaving(true);
    setSaveError(null);
    setSaved(null);
    try {
      const weights = Object.fromEntries(FACTOR_ORDER.map((code) => [code, parseWhole(draft[code]) ?? 0])) as Record<FactorCode, number>;
      const result = await api.post<RiskConfigCreatedResponse>("/admin/risk-config", {
        weights,
        thresholds: { medium: parseWhole(thresholds.medium), high: parseWhole(thresholds.high) }
      });
      setSaved(`Versi ${result.config.version} tersimpan dan sekarang aktif. Jalankan Hitung ulang siklus agar skor memakai versi ini.`);
      resource.reload();
    } catch (error) {
      setSaveError(failureMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const recalcBusy = recalc.phase === "starting" || recalc.phase === "running";
  const draftWeights = useMemo(() => (draft ? Object.fromEntries(FACTOR_ORDER.map((code) => [code, parseWhole(draft[code]) ?? 0])) : null), [draft]) as Record<FactorCode, number> | null;

  if (resource.error && !config) {
    return (
      <div className={styles.page}>
        <PageHeader title="Bobot skor" />
        <EmptyState icon={SlidersHorizontal} title="Bobot skor belum bisa dimuat" description={failureMessage(resource.error)} action={<Button onClick={resource.reload}>Coba lagi</Button>} />
      </div>
    );
  }
  if (!config || !draft || !thresholds || !draftWeights) {
    return (
      <div className={styles.page}>
        <PageHeader title="Bobot skor" />
        <Loading label="Memuat bobot skor…" block />
      </div>
    );
  }

  const bad = new Set(invalidCodes(draft));
  const mediumValue = parseWhole(thresholds.medium);
  const highValue = parseWhole(thresholds.high);
  const barMedium = mediumValue !== null && highValue !== null && mediumValue < highValue && highValue <= 100 ? { medium: mediumValue, high: highValue } : config.active.thresholds;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Bobot skor"
        subtitle={`Konfigurasi aktif: versi ${config.active.version} · dibuat ${formatDate(config.active.createdAt)}${config.active.createdByName ? ` oleh ${config.active.createdByName}` : ""}`}
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => void startRecalculate()} loading={recalcBusy} disabled={!cycle}>
              Hitung ulang siklus
            </Button>
            <Button variant="utama" icon={Save} onClick={() => void save()} loading={saving} disabled={!canSave}>
              Simpan sebagai versi baru
            </Button>
          </>
        }
      />

      {saveError && <Alert onDismiss={() => setSaveError(null)}>{saveError}</Alert>}
      {saved && (
        <p role="status" className={styles.status}>
          <CircleCheck size={14} aria-hidden="true" />
          <span>{saved}</span>
        </p>
      )}
      <RecalcStatus state={recalc} cycleName={cycle ? `${cycle.fiscalYear} ${cycle.stage}` : ""} version={config?.active.version ?? ""} onDismiss={() => setRecalc({ phase: "idle" })} />

      <div className={styles.columns}>
        <section className={styles.left} aria-label="Bobot faktor">
          <SectionHeader title="Bobot faktor" description="Skor 0-100 hanya untuk mengurutkan. Total bobot harus 100%." />
          <TableFrame className={cn(density.roomy, density.rows14)}>
            <Table aria-label="Bobot faktor skor">
              <THead>
                <tr>
                  <Th width={64}>Kode</Th>
                  <Th>Faktor</Th>
                  <Th align="right" width={120}>{`Versi ${config.active.version} (aktif)`}</Th>
                  <Th align="right" width={130}>Bobot baru</Th>
                  <Th align="right" width={80}>Selisih</Th>
                </tr>
              </THead>
              <TBody>
                {config.factors.map((factor) => {
                  const current = config.active.weights[factor.code];
                  const changed = parseWhole(draft[factor.code]) !== current;
                  return (
                    <Tr key={factor.code}>
                      <Td>
                        <strong>{factor.key}</strong>
                      </Td>
                      <Td>
                        <div className={styles.factorName}>{factor.label}</div>
                        <div className={styles.factorDescription}>{factor.description}</div>
                      </Td>
                      <Td numeric>{current}%</Td>
                      <Td align="right">
                        <WeightInput
                          label={`Bobot baru ${factor.key} ${factor.label}`}
                          value={draft[factor.code]}
                          changed={changed}
                          invalid={bad.has(factor.code)}
                          onChange={(value) => {
                            setSaved(null);
                            setDraft((currentDraft) => (currentDraft ? { ...currentDraft, [factor.code]: value } : currentDraft));
                          }}
                        />
                      </Td>
                      <Td numeric>{formatDelta(draft[factor.code], current)}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </TableFrame>
          <TotalBar state={total!} dirty={dirty} />
        </section>

        <aside className={styles.right}>
          <section className={styles.panel} aria-label="Ambang kategori">
            <SectionHeader title="Ambang kategori" description="Skor di bawah ambang sedang masuk kategori rendah." />
            <div className={styles.card}>
              <div className={styles.scale} aria-hidden="true">
                <span className={styles.low} style={{ flexGrow: barMedium.medium }} />
                <span className={styles.mid} style={{ flexGrow: barMedium.high - barMedium.medium }} />
                <span className={styles.high} style={{ flexGrow: 100 - barMedium.high }} />
              </div>
              <p className={styles.scaleLabels}>
                <span className="num">0 Rendah</span>
                <span className="num">{barMedium.medium} Sedang</span>
                <span className="num">{barMedium.high} Tinggi</span>
                <span className="num">100</span>
              </p>
              <div className={styles.pair}>
                <Input
                  label="Sedang mulai dari"
                  value={thresholds.medium}
                  inputMode="numeric"
                  maxLength={3}
                  error={thresholdMessage && (parseWhole(thresholds.medium) === null || (mediumValue ?? 0) >= (highValue ?? 101)) ? thresholdMessage : undefined}
                  onChange={(event) => setThresholds({ ...thresholds, medium: event.target.value })}
                />
                <Input label="Tinggi mulai dari" value={thresholds.high} inputMode="numeric" maxLength={3} error={thresholdMessage && parseWhole(thresholds.high) === null ? thresholdMessage : undefined} onChange={(event) => setThresholds({ ...thresholds, high: event.target.value })} />
              </div>
            </div>
          </section>

          <section className={styles.panel} aria-label="Riwayat versi">
            <SectionHeader title="Riwayat versi" description="Setiap simpan menjadi versi baru. Skor lama tetap tersimpan per versi." />
            <ul role="list" className={styles.versions}>
              {dirty && (
                <li className={styles.version}>
                  <div className={styles.versionHead}>
                    <strong>Versi {nextVersion}</strong>
                    <span className={styles.draftTag}>
                      <CircleDashed size={13} aria-hidden="true" />
                      Belum disimpan
                    </span>
                  </div>
                  <p className={styles.versionLine}>{versionLine(draftWeights, { medium: barMedium.medium, high: barMedium.high })}</p>
                </li>
              )}
              {config.versions.map((version) => (
                <li key={version.id} className={styles.version}>
                  <div className={styles.versionHead}>
                    <strong>Versi {version.version}</strong>
                    {version.active && <TagChip>Aktif</TagChip>}
                  </div>
                  <p className={styles.versionMeta}>
                    {formatDate(version.createdAt)}
                    {version.createdByName ? ` · ${version.createdByName}` : ""}
                  </p>
                  <p className={styles.versionLine}>{versionLine(version.weights, version.thresholds)}</p>
                </li>
              ))}
            </ul>
          </section>

          <div className={styles.note}>
            <Info size={16} aria-hidden="true" />
            <p>Hitung ulang siklus memakai versi aktif. Simpan dulu agar perubahan ikut dihitung.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function WeightInput({ label, value, changed, invalid, onChange }: { label: string; value: string; changed: boolean; invalid: boolean; onChange: (value: string) => void }) {
  return (
    <label className={styles.weight} data-changed={changed || undefined} data-invalid={invalid || undefined}>
      <span className="sr-only">{label}</span>
      <input
        className={styles.weightInput}
        value={value}
        inputMode="numeric"
        maxLength={3}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <span aria-hidden="true" className={styles.weightUnit}>
        %
      </span>
    </label>
  );
}

function TotalBar({ state, dirty }: { state: ReturnType<typeof totalState>; dirty: boolean }) {
  if (state.ok) {
    return (
      <div className={styles.total} role="status">
        <CircleCheck size={16} aria-hidden="true" />
        <span className={styles.totalText}>{dirty ? "Total bobot sudah 100%. Perubahan belum disimpan." : "Total bobot 100%. Tidak ada perubahan."}</span>
        <span className={styles.totalValue}>100%</span>
      </div>
    );
  }
  const message =
    state.reason === "invalid"
      ? "Setiap bobot harus bilangan bulat 0-100."
      : state.total > 100
        ? `Total bobot ${state.total}%, kelebihan ${state.total - 100}%. Kurangi bobot lain sampai tepat 100%.`
        : `Total bobot ${state.total}%, kurang ${100 - state.total}%. Tambahkan sampai tepat 100%.`;
  return (
    <div className={styles.total} data-error role="alert">
      <CircleAlert size={16} aria-hidden="true" />
      <span className={styles.totalText}>{message}</span>
      <span className={styles.totalValue}>{state.total}%</span>
    </div>
  );
}

const STEP_LABEL: Record<string, string> = { aturan: "Aturan", skor: "Skor" };

function RecalcStatus({ state, cycleName, version, onDismiss }: { state: Recalc; cycleName: string; version: string; onDismiss: () => void }) {
  if (state.phase === "idle") return null;
  if (state.phase === "failed") return <Alert onDismiss={onDismiss}>{state.message}</Alert>;
  if (state.phase === "done") {
    const result = state.job.result;
    return (
      <p role="status" className={styles.status}>
        <CircleCheck size={14} aria-hidden="true" />
        <span>
          Hitung ulang selesai{result ? `: ${formatNumber(result.itemsAssessed)} item dinilai dengan bobot versi ${result.riskConfigVersion}, ${formatNumber(result.ruleHits)} hit aturan, ${(result.durationMs / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} detik` : ""}.
        </span>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Tutup
        </Button>
      </p>
    );
  }
  const job = state.phase === "running" ? state.job : null;
  const percent = job?.percent ?? 0;
  return (
    <div className={styles.progress} role="status" aria-live="polite">
      <div className={styles.progressHead}>
        <strong>Menghitung ulang siklus {cycleName} dengan bobot versi {version}</strong>
        <span className="num">{percent}%</span>
      </div>
      <ProgressBar value={percent / 100} label="Progres hitung ulang" valueText={`${percent}%`} />
      <p className={styles.progressMeta}>
        {job?.rowsTotal ? `${formatNumber(job.rowsDone)} dari ${formatNumber(job.rowsTotal)} item` : "Memulai proses…"}
        {job && job.steps.length > 0 && ` · ${job.steps.map((step) => `${STEP_LABEL[step.key] ?? step.key} ${step.status}`).join(", ")}`}
      </p>
    </div>
  );
}
