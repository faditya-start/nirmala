import type { DashboardActionCard, DashboardOrganizationRow, DashboardResponse } from "@nirmala/shared";
import { CalendarDays, ChevronRight, CircleAlert, ListChecks } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/auth";
import { useCycle } from "../../app/cycle";
import { api, errorMessage, isApiError } from "../../lib/api";
import { formatDate, formatNumber } from "../../lib/format";
import {
  Button,
  ButtonLink,
  CheckResultBadge,
  EmptyState,
  KpiCard,
  Loading,
  PageHeader,
  ProgressBar,
  SectionHeader,
  StatusBadge,
  Table,
  TableFrame,
  TBody,
  Td,
  THead,
  Th,
  Tr,
  type NoteStatus
} from "../../ui";
import { actionBody, actionButtonLabel, actionCountText, daysValue, flaggedShareText, rowProgress, triageHref } from "./logic";
import styles from "./index.module.css";

const STATUS_ORDER: NoteStatus[] = ["draf", "menunggu_revisi", "perlu_verifikasi", "dijustifikasi", "closed"];

type State = { status: "loading" } | { status: "error"; message: string; code: number } | { status: "ready"; data: DashboardResponse };

/** S2 · Dashboard (czg1z reviewer, AUOc8 pimpinan). Route: /dashboard. */
export function DashboardPage() {
  const { active, status: cycleStatus, reload: reloadCycles } = useCycle();
  const { user } = useAuth();
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const cycleId = active?.id ?? null;

  useEffect(() => {
    if (!cycleId) return;
    const controller = new AbortController();
    setState((previous) => (previous.status === "ready" && previous.data.cycle.id === cycleId ? previous : { status: "loading" }));
    api
      .get<DashboardResponse>("/dashboard", { query: { cycleId }, signal: controller.signal })
      .then((data) => setState({ status: "ready", data }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: errorMessage(error, "Dashboard tidak dapat dimuat."), code: isApiError(error) ? error.status : 0 });
      });
    return () => controller.abort();
  }, [cycleId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (cycleStatus === "idle" || cycleStatus === "loading") return <Shell><Loading label="Memuat siklus…" block /></Shell>;
  if (cycleStatus === "error") {
    return (
      <Shell>
        <EmptyState icon={CircleAlert} title="Siklus tidak dapat dimuat" description="Daftar siklus gagal diambil dari server. Periksa koneksi Anda lalu coba lagi." action={<Button onClick={() => void reloadCycles()}>Coba lagi</Button>} />
      </Shell>
    );
  }
  if (!active) {
    return (
      <Shell>
        <EmptyState icon={CalendarDays} title="Belum ada siklus" description="Siklus dibuat oleh Admin. Dashboard terisi setelah ada siklus dan snapshot." />
      </Shell>
    );
  }
  if (state.status === "loading") return <Shell><Loading label="Memuat dashboard…" block /></Shell>;
  if (state.status === "error") {
    return (
      <Shell>
        <EmptyState
          icon={CircleAlert}
          title={state.code === 403 ? "Akses ditolak" : "Dashboard tidak dapat dimuat"}
          description={state.code === 501 ? "Dashboard belum tersedia di server ini." : state.message}
          action={state.code === 403 || state.code === 501 ? undefined : <Button onClick={retry}>Coba lagi</Button>}
        />
      </Shell>
    );
  }
  return <DashboardBody data={state.data} leader={user?.role === "leader"} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <PageHeader title="Dashboard" />
      {children}
    </div>
  );
}

function DashboardBody({ data, leader }: { data: DashboardResponse; leader: boolean }) {
  const { kpis, cycle } = data;
  const share = flaggedShareText(kpis.itemsFlagged, kpis.itemsAnalyzed);
  const stage = cycle.stage === "pagu" ? "Pagu" : "Alokasi";
  const scope = data.scopeKind === "all" ? "Semua eselon I" : data.organizationUnitNames.join(", ") || "Eselon I Anda";
  const subtitle = `${scope} · TA ${cycle.fiscalYear} ${stage} · ${data.dataAsOf ? `data per ${formatDate(data.dataAsOf)}` : "belum ada data"}`;
  const statusNote = leader
    ? "Catatan draf ikut dihitung. Draf belum terlihat oleh Satker."
    : data.chrDocumentNumbers.length > 0
      ? `CHR ${data.chrDocumentNumbers.join(", ")}`
      : undefined;

  return (
    <div className={styles.page}>
      <PageHeader title="Dashboard" subtitle={subtitle} />

      <div className={styles.kpis}>
        <KpiCard
          label="Sisa hari ke tenggat ADK"
          value={daysValue(kpis.daysToAdkDeadline)}
          hint={kpis.adkDeadline ? `Tenggat ${formatDate(kpis.adkDeadline)}` : "Tenggat belum diatur"}
        />
        <KpiCard label="Item kena aturan" value={formatNumber(kpis.itemsFlagged)} hint={share ?? "Belum ada item dianalisis"} />
        <KpiCard
          label="Satker siap diajukan"
          value={`${formatNumber(kpis.satkerReady)} dari ${formatNumber(kpis.satkerWithNotes)}`}
          hint="Satker yang punya catatan terbit"
          progress={kpis.satkerWithNotes > 0 ? kpis.satkerReady / kpis.satkerWithNotes : 0}
          progressLabel="Satker siap diajukan"
        />
      </div>

      <div className={leader ? styles.solo : styles.split}>
        <section className={styles.block}>
          <SectionHeader title="Catatan per status" description={statusNote} />
          <div className={styles.strip} role="list" aria-label="Jumlah catatan per status">
            {STATUS_ORDER.map((key) => {
              const count = data.notesByStatus[key] ?? 0;
              return (
                <div key={key} className={styles.cell} role="listitem">
                  <StatusBadge status={key} />
                  <span className={`${styles.count} num`} data-zero={count === 0 || undefined}>
                    {formatNumber(count)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {!leader && <ActionsPanel actions={data.actions} />}
      </div>

      <section className={styles.block}>
        <SectionHeader title="Per eselon I" />
        {data.organizations.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Belum ada eselon I" description="Tidak ada eselon I yang tercakup dalam akses Anda pada siklus ini." />
        ) : (
          <OrganizationTable rows={data.organizations} />
        )}
      </section>
    </div>
  );
}

function ActionBadge({ card }: { card: DashboardActionCard }) {
  switch (card.kind) {
    case "perlu_verifikasi":
      return <StatusBadge status="perlu_verifikasi" />;
    case "menunggu_revisi":
      return <StatusBadge status="menunggu_revisi" />;
    case "chr_draf":
      return <StatusBadge status="draf" />;
    case "belum_terpenuhi":
      return <CheckResultBadge result="belum_terpenuhi" />;
    case "tanggapan_belum_diisi":
      return <StatusBadge status="menunggu_revisi">Tanggapan belum diisi</StatusBadge>;
  }
}

function ActionsPanel({ actions }: { actions: DashboardActionCard[] }) {
  const pending = actions.filter((card) => card.count > 0);
  return (
    <section className={styles.block}>
      <SectionHeader title="Perlu tindakan saya" />
      <div className={styles.panel}>
        {pending.length === 0 ? (
          <p className={styles.panelEmpty}>Tidak ada yang menunggu keputusan Anda saat ini.</p>
        ) : (
          pending.map((card) => {
            const label = actionButtonLabel(card);
            return (
              <div key={card.kind} className={styles.action}>
                <div className={styles.actionHead}>
                  <ActionBadge card={card} />
                  <span className={styles.actionCount}>{actionCountText(card)}</span>
                </div>
                <p className={styles.actionBody}>{actionBody(card, formatDate)}</p>
                {label && (
                  <ButtonLink to={card.href} icon={ListChecks} className={styles.actionButton}>
                    {label}
                  </ButtonLink>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function OrganizationTable({ rows }: { rows: DashboardOrganizationRow[] }) {
  const navigate = useNavigate();
  return (
    <TableFrame className={styles.orgTable}>
      <Table aria-label="Ringkasan per eselon I">
        <THead>
          <tr>
            <Th>Eselon I</Th>
            <Th width={140}>Snapshot</Th>
            <Th align="right" width={140}>
              Item kena aturan
            </Th>
            <Th align="right" width={140}>
              Catatan terbuka
            </Th>
            <Th width={230}>Progres catatan</Th>
            <Th width={48}>
              <span className="sr-only">Buka</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          {rows.map((row) => {
            const href = triageHref(row.organizationUnitId);
            const progress = rowProgress(row);
            return (
              <Tr key={row.organizationUnitId} onActivate={() => navigate(href)}>
                <Td>
                  <div className={styles.stack}>
                    <Link to={href} className={styles.orgName}>
                      {row.organizationUnitName}
                    </Link>
                    <span className={styles.sub}>
                      {row.organizationUnitCode} · {formatNumber(row.satkerCount)} Satker sampel
                    </span>
                  </div>
                </Td>
                <Td className={row.snapshot ? undefined : styles.faint}>{row.snapshot ? `v${row.snapshot.versionNo} · ${row.snapshot.label}` : "Belum diimpor"}</Td>
                <Td numeric className={row.itemsFlagged === null ? styles.faint : undefined}>
                  {row.itemsFlagged === null ? "—" : formatNumber(row.itemsFlagged)}
                </Td>
                <Td numeric className={row.notesOpen === null ? styles.faint : undefined}>
                  {row.notesOpen === null ? (
                    "—"
                  ) : (
                    <div className={`${styles.stack} ${styles.right}`}>
                      <span>{formatNumber(row.notesOpen)}</span>
                      {row.notesDraft > 0 && <span className={styles.sub}>{formatNumber(row.notesDraft)} draf</span>}
                    </div>
                  )}
                </Td>
                <Td>
                  <div className={styles.progress}>
                    {progress.ratio !== null && (
                      <div className={styles.progressBar}>
                        <ProgressBar value={progress.ratio} label={`Progres catatan ${row.organizationUnitName}`} valueText={progress.text} />
                      </div>
                    )}
                    <span className={styles.sub}>{progress.text}</span>
                  </div>
                </Td>
                <Td align="right">
                  <ChevronRight size={16} aria-hidden="true" className={styles.chevron} />
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </TableFrame>
  );
}
