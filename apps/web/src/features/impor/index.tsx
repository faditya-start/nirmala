import type { ImportOverviewResponse } from "@nirmala/shared";
import { CalendarDays, CircleAlert, CircleCheck, Inbox, LoaderCircle, Upload, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCycle } from "../../app/cycle";
import { useNeedsAction } from "../../app/needsAction";
import { errorMessage, isApiError } from "../../lib/api";
import { Button, EmptyState, IconButton, Loading, PageHeader } from "../../ui";
import { fetchImportOverview } from "./api";
import { CycleTable, SnapshotTable, resultHref } from "./components/CycleSnapshotTables";
import { ImportDialog } from "./components/ImportDialog";
import { ResultView } from "./components/ResultView";
import { Section } from "./components/Section";
import { clampPercent, cycleTitle, versionLabel } from "./logic";
import { useImportRunner } from "./useImportRunner";
import styles from "./index.module.css";

const SUBTITLE = "Satu CSV per eselon I menjadi satu snapshot. File yang sama tidak diproses dua kali.";

/** S3 · Siklus & Impor Data (hsNnG and dialogs/states). Route: /siklus. Result view: /siklus?siklus=<id>&hasil=<snapshotId>. */
export function CycleImportPage() {
  const [params] = useSearchParams();
  const resultSnapshot = params.get("hasil");
  const resultCycle = params.get("siklus");
  if (resultSnapshot && resultCycle) return <ResultView cycleId={resultCycle} snapshotId={resultSnapshot} />;
  return <CycleImportList />;
}

type Overview = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: ImportOverviewResponse };

function CycleImportList() {
  const { cycles, active, status: cycleStatus, setActiveId, reload: reloadCycles } = useCycle();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<Overview>({ status: "loading" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialOrg, setInitialOrg] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const cycleId = active?.id ?? null;

  useEffect(() => {
    if (!cycleId) return;
    const controller = new AbortController();
    setOverview((previous) => (previous.status === "ready" && previous.data.cycle.id === cycleId ? previous : { status: "loading" }));
    fetchImportOverview(cycleId, controller.signal)
      .then((data) => setOverview({ status: "ready", data }))
      .catch((error) => {
        if (!controller.signal.aborted) setOverview({ status: "error", message: isApiError(error) && error.status === 501 ? "Fitur impor belum tersedia di server ini." : errorMessage(error, "Daftar snapshot tidak dapat dimuat.") });
      });
    return () => controller.abort();
  }, [cycleId, attempt]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  const needsAction = useNeedsAction();
  // A finished import changes the queues (flagged items for review, notes to verify): refresh the header and sidebar counts now.
  const runner = useImportRunner(() => {
    refresh();
    void needsAction.refresh();
  });
  const { state: runState } = runner;

  // A finished import that was not "file sama": open its result straight away when the dialog is still open.
  useEffect(() => {
    if (runState.phase === "done" && !runState.response.alreadyImported && dialogOpen) {
      const target = resultHref(runState.context.cycleId, runState.response.snapshot.id);
      setDialogOpen(false);
      runner.reset();
      navigate(target);
    }
  }, [runState, dialogOpen, navigate, runner]);

  useEffect(() => {
    if (runState.phase === "uploading") setBannerDismissed(false);
  }, [runState.phase]);

  function openDialog(organizationId: string | null) {
    setInitialOrg(organizationId);
    setDialogOpen(true);
  }

  const header = (actions?: React.ReactNode) => <PageHeader title="Siklus & Impor Data" subtitle={SUBTITLE} actions={actions} />;

  if (cycleStatus === "idle" || cycleStatus === "loading") {
    return (
      <div className={styles.page}>
        {header()}
        <Loading label="Memuat siklus…" block />
      </div>
    );
  }
  if (cycleStatus === "error") {
    return (
      <div className={styles.page}>
        {header()}
        <EmptyState
          icon={CircleAlert}
          title="Siklus tidak dapat dimuat"
          description="Daftar siklus gagal diambil dari server. Periksa koneksi Anda lalu coba lagi."
          action={<Button onClick={() => void reloadCycles()}>Coba lagi</Button>}
          className={styles.centered}
        />
      </div>
    );
  }
  if (cycles.length === 0 || !active) {
    return (
      <div className={styles.page}>
        {header()}
        <EmptyState
          icon={CalendarDays}
          title="Belum ada siklus"
          description="Siklus dibuat oleh Admin. Setelah siklus ada, Anda bisa mengimpor CSV eselon I."
          className={styles.centered}
        />
      </div>
    );
  }

  const data = overview.status === "ready" ? overview.data : null;
  const rows = data?.rows ?? [];
  const canImport = data?.canImport ?? false;
  const anySnapshot = rows.some((row) => row.snapshots.length > 0);
  const maxVersion = Math.max(0, ...rows.flatMap((row) => row.snapshots.map((s) => s.versionNo)));
  const snapshotTitle = `Snapshot · ${cycleTitle(active)}`;
  const snapshotNote =
    maxVersion >= 2
      ? `Snapshot v${maxVersion} ${versionLabel(maxVersion)} dicek terhadap catatan CHR yang sudah terbit.`
      : data && !canImport
        ? "Impor snapshot hanya bisa dilakukan Reviewer dan Admin pada siklus yang aktif."
        : undefined;

  const showBanner = !dialogOpen && !bannerDismissed && runState.phase !== "idle";

  return (
    <div className={styles.page}>
      {header(
        canImport && (
          <Button variant="utama" icon={Upload} onClick={() => openDialog(null)}>
            Impor CSV
          </Button>
        )
      )}

      {showBanner && <RunBanner runner={runner} onOpen={() => openDialog(null)} onDismiss={() => setBannerDismissed(true)} onResult={(url) => navigate(url)} />}

      <Section title="Siklus">
        <CycleTable cycles={cycles} activeId={active.id} onSelect={setActiveId} />
      </Section>

      <Section title={snapshotTitle} description={snapshotNote}>
        {overview.status === "loading" ? (
          <Loading label="Memuat snapshot…" block />
        ) : overview.status === "error" ? (
          <EmptyState
            icon={CircleAlert}
            title="Snapshot tidak dapat dimuat"
            description={overview.message}
            action={<Button onClick={refresh}>Coba lagi</Button>}
            className={styles.centered}
          />
        ) : rows.length === 0 ? (
          <EmptyState icon={Inbox} title="Belum ada eselon I" description="Tidak ada eselon I yang tercakup dalam akses Anda pada siklus ini." className={styles.centered} />
        ) : !anySnapshot ? (
          <EmptyState
            icon={Inbox}
            title="Belum ada snapshot"
            description="Impor CSV format SIPEKA untuk eselon I. Aturan dan skor berjalan otomatis setelah impor selesai."
            action={
              canImport ? (
                <Button icon={Upload} onClick={() => openDialog(null)}>
                  Impor CSV
                </Button>
              ) : undefined
            }
            className={styles.centered}
          />
        ) : (
          <SnapshotTable cycleId={active.id} rows={rows} canImport={canImport} onImport={openDialog} />
        )}
      </Section>

      {data && canImport && (
        <ImportDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          cycle={active}
          rows={rows}
          initialOrganizationId={initialOrg}
          runner={runner}
          onViewSnapshot={(snapshot) => {
            setDialogOpen(false);
            runner.reset();
            navigate(resultHref(active.id, snapshot.id));
          }}
          onReloadList={() => {
            runner.reset();
            setDialogOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function RunBanner({
  runner,
  onOpen,
  onDismiss,
  onResult
}: {
  runner: ReturnType<typeof useImportRunner>;
  onOpen: () => void;
  onDismiss: () => void;
  onResult: (url: string) => void;
}) {
  const { state } = runner;
  if (state.phase === "idle") return null;
  const name = `${state.context.organizationName} · v${state.context.versionNo} ${state.context.versionLabel}`;

  if (state.phase === "uploading" || state.phase === "running") {
    const percent = state.phase === "uploading" ? (state.total > 0 ? clampPercent((state.loaded / state.total) * 100) : 0) : clampPercent(state.job?.percent ?? 0);
    return (
      <div className={styles.banner} role="status">
        <LoaderCircle size={16} aria-hidden="true" className={styles.spin} />
        <span className={styles.bannerText}>
          Impor {name} berjalan: {state.phase === "uploading" ? "mengunggah file" : "memproses"}, {percent}%.
        </span>
        <Button size="sm" onClick={onOpen}>
          Lihat proses
        </Button>
      </div>
    );
  }
  if (state.phase === "done") {
    return (
      <div className={styles.banner} role="status">
        <CircleCheck size={16} aria-hidden="true" />
        <span className={styles.bannerText}>Impor {name} selesai.</span>
        <Button
          size="sm"
          variant="utama"
          onClick={() => {
            const url = resultHref(state.context.cycleId, state.response.snapshot.id);
            runner.reset();
            onResult(url);
          }}
        >
          Lihat hasil
        </Button>
        <IconButton icon={X} label="Tutup pemberitahuan" onClick={() => { runner.reset(); onDismiss(); }} />
      </div>
    );
  }
  return (
    <div className={styles.banner} data-tone="error" role="alert">
      <CircleAlert size={16} aria-hidden="true" />
      <span className={styles.bannerText}>Impor {name} tidak selesai. {state.message}</span>
      <Button size="sm" onClick={onOpen}>
        Buka dialog
      </Button>
      <IconButton icon={X} label="Tutup pemberitahuan" onClick={() => { runner.reset(); onDismiss(); }} />
    </div>
  );
}
