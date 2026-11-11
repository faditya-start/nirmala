import type { EngineValidationResponse, EngineValidationSet, OrganizationUnitDto, ReportSummaryResponse } from "@nirmala/shared";
import { Download, FileBarChart } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "../../app/auth";
import { useCycle } from "../../app/cycle";
import { api, ApiError, IS_MOCK, isApiError } from "../../lib/api";
import { failureMessage } from "./errors";
import { formatDate, formatNumber } from "../../lib/format";
import { cycleLabel } from "../../lib/types";
import {
  Button,
  ButtonLink,
  CellEmpty,
  EmptyState,
  FilterBar,
  FilterSelect,
  KpiCard,
  Loading,
  PageHeader,
  ProgressBar,
  SectionHeader,
  TableFrame,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "../../ui";
import { cn } from "../../lib/cn";
import density from "./components/density.module.css";
import { BarList } from "./components/BarList";
import { InfoNote } from "./components/InfoNote";
import { closedHint, issuedHint } from "./hints";
import { CATEGORY_ROWS, dismissSubtitle, exportScopeNote, formatDays, formatRatio, medianHint, setTitle, summaryCsv, validationNote } from "./report";
import { useResource } from "./useResource";
import styles from "./Reports.module.css";

const ALL_UNITS = "";

function stageLabel(cycle: { fiscalYear: number; stage: string }): string {
  return `TA ${cycle.fiscalYear} ${cycle.stage.charAt(0).toUpperCase()}${cycle.stage.slice(1)}`;
}

function downloadBlob(name: string, content: Blob | string): void {
  const blob = typeof content === "string" ? new Blob([content], { type: "text/csv;charset=utf-8" }) : content;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** S11 · Laporan (L4cke). Route: /laporan. */
export function ReportsPage() {
  const { user } = useAuth();
  const { cycles, active, status: cycleStatus } = useCycle();
  const [cycleOverride, setCycleOverride] = useState<string | null>(null);
  const [unitChoice, setUnitChoice] = useState(ALL_UNITS);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const cycle = cycles.find((item) => item.id === cycleOverride) ?? active;
  const cycleId = cycle?.id ?? null;

  const unitsResource = useResource(() => api.get<{ organizationUnits: OrganizationUnitDto[] }>("/organization-units"), "units");
  const units = useMemo(() => unitsResource.data?.organizationUnits ?? [], [unitsResource.data]);
  const limited = user?.role === "reviewer" || user?.role === "uki";
  // A person who only has one eselon I sees it named, as in the design, instead of "Semua".
  const onlyUnit = limited && units.length === 1 ? units[0] : null;
  const unitId = onlyUnit ? onlyUnit.id : unitChoice;
  const unit = units.find((item) => item.id === unitId) ?? null;

  const query = { cycleId, organizationUnitId: unitId || undefined };
  const queryKey = `${cycleId}|${unitId}`;
  const summary = useResource<ReportSummaryResponse>(cycleId ? () => api.get("/reports/summary", { query }) : null, `s|${queryKey}`);
  const validation = useResource<EngineValidationResponse>(cycleId ? () => api.get("/reports/engine-validation", { query }) : null, `v|${queryKey}`);

  const exportHref = `/api/reports/export.csv?${new URLSearchParams({ cycleId: cycleId ?? "", ...(unitId ? { organizationUnitId: unitId } : {}), dataset: "catatan" })}`;

  async function onExport(event: React.MouseEvent) {
    // A plain link would navigate to a JSON error page on 403/500, so the file is fetched and any error is shown here.
    event.preventDefault();
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      if (IS_MOCK) {
        // Simulated API: there is no server to answer the download, so hand over the summary the page already has.
        if (summary.data) downloadBlob(`nirmala-ringkasan-${cycle?.fiscalYear}-${cycle?.stage}.csv`, summaryCsv(summary.data));
        return;
      }
      const response = await fetch(exportHref, { credentials: "include" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new ApiError(response.status, payload?.error ?? "Ekspor CSV belum bisa dibuat. Coba lagi.");
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? `nirmala-catatan-${cycle?.fiscalYear}-${cycle?.stage}.csv`;
      // Blob, not text(): decoding to a string would drop the UTF-8 BOM that Excel needs to read accents.
      downloadBlob(name, await response.blob());
    } catch (error) {
      setExportError(error instanceof TypeError ? "Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi." : failureMessage(error));
    } finally {
      setExporting(false);
    }
  }

  if (cycleStatus === "loading" || cycleStatus === "idle") {
    return (
      <div className={styles.page}>
        <PageHeader title="Laporan" />
        <Loading label="Memuat siklus…" block />
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className={styles.page}>
        <PageHeader title="Laporan" subtitle="Metrik proses dan validasi engine" />
        <EmptyState icon={FileBarChart} title="Belum ada siklus" description="Laporan muncul setelah siklus dibuat dan data diimpor. Admin dapat membuat siklus di menu Administrasi." />
      </div>
    );
  }

  const data = summary.data;
  const accessError = [summary.error, validation.error].find((error) => isApiError(error) && error.status === 403);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Laporan"
        subtitle={`Metrik proses dan validasi engine · ${stageLabel(cycle)} · ${data?.dataAsOf ? `data per ${formatDate(data.dataAsOf)}` : "belum ada data diimpor"}`}
        actions={
          <ButtonLink to={exportHref} reloadDocument download variant="sekunder" icon={Download} loading={exporting} onClick={(event) => void onExport(event)}>
            Ekspor CSV
          </ButtonLink>
        }
      />

      {exportError && (
        <p role="alert" className={styles.exportError}>
          {exportError}
        </p>
      )}

      <div className={styles.filters}>
        <FilterBar label="Filter laporan">
          <FilterSelect
            label="Siklus"
            value={cycle.id}
            onChange={(value) => setCycleOverride(value)}
            options={cycles.map((item) => ({ value: item.id, label: cycleLabel(item) }))}
          />
          <FilterSelect
            label="Eselon I"
            value={unitId}
            onChange={setUnitChoice}
            options={[...(onlyUnit ? [] : [{ value: ALL_UNITS, label: "Semua eselon I" }]), ...units.map((item) => ({ value: item.id, label: item.shortName }))]}
          />
        </FilterBar>
        <p className={styles.scopeNote}>{exportScopeNote(unit?.shortName ?? null, limited)}</p>
      </div>

      {accessError ? (
        <EmptyState icon={FileBarChart} title="Tidak ada akses" description={failureMessage(accessError)} />
      ) : (
        <>
          <section className={styles.block} aria-busy={summary.loading || undefined} data-stale={(summary.loading && data !== null) || undefined}>
            {summary.error && !data ? (
              <ErrorBlock message={failureMessage(summary.error)} onRetry={summary.reload} />
            ) : !data ? (
              <Loading label="Memuat metrik laporan…" block />
            ) : (
              <SummaryBlock data={data} />
            )}
          </section>

          <section className={styles.block} aria-label="Validasi engine" aria-busy={validation.loading || undefined}>
            <SectionHeader
              title="Validasi engine"
              description="Berapa banyak item kunci jawaban yang tertangkap aturan. Skor tidak ikut dihitung karena hanya untuk mengurutkan."
            />
            {validation.error && !validation.data ? (
              <ErrorBlock message={failureMessage(validation.error)} onRetry={validation.reload} />
            ) : !validation.data ? (
              <Loading label="Memuat validasi engine…" block />
            ) : (
              <ValidationBlock data={validation.data} />
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={FileBarChart}
      title="Data laporan belum bisa dimuat"
      description={message}
      action={
        <Button variant="sekunder" onClick={onRetry}>
          Coba lagi
        </Button>
      }
    />
  );
}

function SummaryBlock({ data }: { data: ReportSummaryResponse }) {
  const categoryRows = CATEGORY_ROWS.map((row) => ({ key: row.key, label: row.label, count: data.notesByCategory[row.key] ?? 0 }));
  const reasonRows = data.dismissReasons.map((reason) => ({ key: reason.code, label: reason.label, count: reason.count }));
  return (
    <>
      <div className={styles.kpis}>
        <KpiCard label="Catatan terbit" value={formatNumber(data.notesIssued)} hint={issuedHint(data.chrDocuments)} />
        <KpiCard
          label="Closed sebelum diajukan"
          value={formatRatio(data.percentClosed === null ? null : data.percentClosed / 100)}
          hint={closedHint(data)}
          progress={data.percentClosed === null ? undefined : data.percentClosed / 100}
          progressLabel="Catatan closed dari catatan terbit"
        />
        <KpiCard label="Median hari terbit sampai closed" value={formatDays(data.medianDaysToClose)} hint={medianHint(data.closedSampleSize)} />
      </div>

      <div className={styles.charts}>
        <section className={styles.chart} aria-label="Catatan per kategori">
          <SectionHeader title="Catatan per kategori" description="Semua catatan terbit, tidak termasuk draf." />
          <BarList label="Jumlah catatan terbit per kategori" rows={categoryRows} />
        </section>
        <section className={styles.chart} aria-label="Alasan dismiss">
          <SectionHeader title="Alasan dismiss" description={dismissSubtitle(data.dismissedItems, data.flaggedItems)} />
          {reasonRows.length === 0 ? (
            <EmptyState title="Belum ada item yang di-dismiss" description="Alasan dismiss muncul di sini setelah reviewer menandai item sebagai tidak perlu dicatat." />
          ) : (
            <BarList label="Jumlah item di-dismiss per alasan" rows={reasonRows} labelWidth={212} />
          )}
        </section>
      </div>
    </>
  );
}

function SetRow({ set }: { set: EngineValidationSet }) {
  return (
    <Tr>
      <Td>
        <div className={styles.setTitle}>{setTitle(set)}</div>
        <div className={styles.setDescription}>
          {set.description}
          {set.metric === "precision_at_n" && set.n !== null ? ` · presisi di ${formatNumber(set.n)} teratas` : ""}
        </div>
      </Td>
      <Td numeric>{formatNumber(set.totalItems)}</Td>
      <Td numeric>{formatNumber(set.caught)}</Td>
      <Td numeric>{formatRatio(set.value)}</Td>
      <Td>
        {set.value === null ? (
          <CellEmpty />
        ) : (
          <div className={styles.recallBar}>
            <ProgressBar value={set.value} label={`${set.code}: ${set.metric === "recall" ? "recall" : "presisi"}`} valueText={formatRatio(set.value)} />
          </div>
        )}
      </Td>
      <Td numeric align="left">
        {set.ruleCodes.length === 0 ? <CellEmpty /> : set.ruleCodes.join(" ")}
      </Td>
    </Tr>
  );
}

function ValidationBlock({ data }: { data: EngineValidationResponse }) {
  const note = validationNote(data.synthetic, data.note);
  return (
    <>
      {data.sets.length === 0 ? (
        <EmptyState title="Belum ada kunci jawaban" description="Validasi engine tampil setelah kunci jawaban untuk eselon I ini dimuat di server." />
      ) : (
        <TableFrame className={cn(density.roomy, density.rows14)}>
          <Table aria-label="Validasi engine terhadap kunci jawaban">
            <THead>
              <tr>
                <Th>Kunci jawaban</Th>
                <Th align="right" width={100}>
                  Item
                </Th>
                <Th align="right" width={110}>
                  Tertangkap
                </Th>
                <Th align="right" width={100}>
                  Recall
                </Th>
                <Th width={190}>
                  <span className="sr-only">Grafik recall</span>
                </Th>
                <Th width={220}>Aturan yang menangkap</Th>
              </tr>
            </THead>
            <TBody>
              {data.sets.map((set) => (
                <SetRow key={set.code} set={set} />
              ))}
            </TBody>
          </Table>
        </TableFrame>
      )}
      {note && <InfoNote>{note}</InfoNote>}
    </>
  );
}
