import type { SatkerProgressResponse, SatkerProgressRow, SatkerProgressSort, TrackerStatus } from "@nirmala/shared";
import { Building2, Circle, Info, Lock, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePageBreadcrumb } from "../../app/breadcrumb";
import { useCycle } from "../../app/cycle";
import { api, errorMessage } from "../../lib/api";
import { formatDate, formatDateTime, formatNumber } from "../../lib/format";
import {
  Button,
  CellEmpty,
  EmptyState,
  FilterBar,
  FilterSelect,
  KpiCard,
  Loading,
  PageHeader,
  Pagination,
  SectionHeader,
  StatusBadge,
  Table,
  TableFrame,
  TBody,
  TextLink,
  Td,
  Th,
  THead,
  Tr,
  type SortDirection
} from "../../ui";
import { useOrganizationUnits } from "../tracker/useOrganizationUnits";
import { errorStatus, useRemote } from "../tracker/useRemote";
import { deadlineText, openNotesHint, READINESS_TEXT, relativeDays } from "./logic";
import styles from "./SatkerProgressPage.module.css";

const PAGE_SIZE = 50;
const COLUMNS: { status: TrackerStatus; label: string; width: number }[] = [
  { status: "menunggu_revisi", label: "Menunggu Revisi", width: 130 },
  { status: "perlu_verifikasi", label: "Perlu Verifikasi", width: 130 },
  { status: "dijustifikasi", label: "Dijustifikasi", width: 120 },
  { status: "closed", label: "Closed", width: 90 }
];
const SORTS: readonly SatkerProgressSort[] = ["last_moved", "name", "open_notes"];

function ReadinessBadge({ readiness }: { readiness: SatkerProgressRow["readiness"] }) {
  if (readiness === "siap_diajukan") return <StatusBadge status="siap_diajukan" />;
  return (
    <span className={styles.outline}>
      <Circle size={13} aria-hidden="true" />
      <span>{READINESS_TEXT[readiness]}</span>
    </span>
  );
}

function cycleText(year: number, stage: string): string {
  return `TA ${year} ${stage.charAt(0).toUpperCase()}${stage.slice(1)}`;
}

/** S10 · Progres per Satker (OTPBi). Route: /satker. */
export function SatkerProgressPage() {
  const { active, status: cycleStatus } = useCycle();
  const { units, ready } = useOrganizationUnits();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);

  const sortParam = params.get("sort") as SatkerProgressSort | null;
  const sort: SatkerProgressSort = sortParam && SORTS.includes(sortParam) ? sortParam : "last_moved";
  // Several eselon I: the API needs one. A person with one eselon I needs no choice.
  const orgId = params.get("organizationUnitId") ?? (units.length > 1 ? units[0].id : "");

  const cycleId = active?.id ?? "";
  const query = { cycleId, organizationUnitId: orgId, sort };
  const remote = useRemote<SatkerProgressResponse>((signal) => api.get<SatkerProgressResponse>("/satker/progress", { query, signal }), JSON.stringify(query), !!active && ready);
  const data = remote.data;

  useEffect(() => setPage(1), [orgId, sort, cycleId]);

  const orgName = data?.organizationUnit.shortName ?? null;
  usePageBreadcrumb(orgName ? [{ label: "Tindak lanjut" }, { label: "Progres Satker" }, { label: orgName }] : null);

  const items = data?.items ?? [];
  const visible = useMemo(() => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [items, page]);

  if (cycleStatus === "loading" || cycleStatus === "idle") return <Loading block label="Memuat siklus…" />;
  if (!active) {
    return (
      <div className={styles.page}>
        <PageHeader title="Progres per Satker" />
        <EmptyState icon={Building2} title="Belum ada siklus reviu" description="Progres Satker tampil setelah ada siklus reviu dan CHR yang diterbitkan." />
      </div>
    );
  }

  function setSort(next: SatkerProgressSort) {
    const copy = new URLSearchParams(params);
    if (next === "last_moved") copy.delete("sort");
    else copy.set("sort", next);
    setParams(copy, { replace: true });
  }

  function sortProps(column: SatkerProgressSort): { sort: SortDirection; onSort: () => void } {
    return { sort: sort === column ? "asc" : "none", onSort: () => setSort(column) };
  }

  if (!data) {
    const status = errorStatus(remote.error);
    if (remote.error) {
      return (
        <div className={styles.page}>
          <PageHeader title="Progres per Satker" />
          {status === 403 ? (
            <EmptyState variant="page" icon={Lock} title="Akses ditolak" description={errorMessage(remote.error)} />
          ) : (
            <EmptyState
              icon={TriangleAlert}
              title="Progres Satker tidak dapat dimuat"
              description={errorMessage(remote.error)}
              action={
                <Button variant="utama" onClick={remote.reload}>
                  Coba lagi
                </Button>
              }
            />
          )}
        </div>
      );
    }
    return <Loading block label="Memuat progres Satker…" />;
  }

  const { summary, chr, organizationUnit } = data;
  const deadline = deadlineText(summary.daysToAdkDeadline);
  const subtitle = [organizationUnit.shortName, cycleText(active.fiscalYear, active.stage), chr?.documentNumber ? `CHR ${chr.documentNumber}` : null].filter(Boolean).join(" · ");
  const tracker = (row: SatkerProgressRow) => {
    const next = new URLSearchParams({ workUnitId: row.workUnitId });
    if (orgId) next.set("organizationUnitId", orgId);
    return `/tracker?${next.toString()}`;
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Progres per Satker"
        subtitle={subtitle}
        actions={
          units.length > 1 ? (
            <FilterBar label="Pilih eselon I">
              <FilterSelect label="Eselon I" value={orgId} onChange={(value) => setParams(value ? { organizationUnitId: value } : {}, { replace: true })} options={units.map((unit) => ({ value: unit.id, label: unit.shortName }))} />
            </FilterBar>
          ) : undefined
        }
      />

      {!!remote.error && (
        <p role="alert" className={styles.stale}>
          <TriangleAlert size={14} aria-hidden="true" /> Data tidak dapat diperbarui. {errorMessage(remote.error)}{" "}
          <Button size="sm" onClick={remote.reload}>
            Coba lagi
          </Button>
        </p>
      )}

      <div className={styles.kpis}>
        <KpiCard
          label="Satker siap diajukan"
          value={`${formatNumber(summary.satkerReady)} dari ${formatNumber(summary.satkerWithNotes)}`}
          hint={`Satker yang punya catatan. ${formatNumber(summary.satkerWithoutNotes)} Satker lain tanpa catatan.`}
          progress={summary.satkerWithNotes > 0 ? summary.satkerReady / summary.satkerWithNotes : 0}
          progressLabel="Satker siap diajukan"
        />
        <KpiCard
          label={deadline.label}
          value={deadline.value}
          hint={summary.adkDeadline ? `Tenggat ${formatDate(summary.adkDeadline)}` : "Tenggat ADK belum ditetapkan"}
        />
        <KpiCard label="Catatan masih terbuka" value={formatNumber(summary.openNotes)} hint={openNotesHint(summary.openNotesPreview, summary.openNotes)} />
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Building2} title="Belum ada Satker" description="Daftar Satker tampil setelah data eselon I diimpor." />
      ) : (
        <section className={styles.group} aria-labelledby="satker-judul">
          <SectionHeader
            title="Satker"
            description={
              sort === "last_moved"
                ? "Urutan: Satker yang paling lama tidak bergerak di atas. Klik Satker untuk membuka Smart Tracker terfilter."
                : "Klik Satker untuk membuka Smart Tracker terfilter. Satker tanpa catatan selalu di bawah."
            }
          />
          <div aria-busy={remote.loading || undefined} className={remote.loading ? styles.busy : undefined}>
            <TableFrame>
              <Table aria-label="Progres catatan per Satker">
                <THead>
                  <tr>
                    <Th {...sortProps("name")}>Satker</Th>
                    {COLUMNS.map((column) => (
                      <Th key={column.status} width={column.width} align="right">
                        {column.label}
                      </Th>
                    ))}
                    <Th width={190} {...sortProps("last_moved")}>
                      Terakhir bergerak
                    </Th>
                    <Th width={170}>Status</Th>
                  </tr>
                </THead>
                <TBody>
                  {visible.map((row) => (
                    <Tr key={row.workUnitId}>
                      <Td>
                        <TextLink to={tracker(row)}>
                          <span className={styles.name} title={row.workUnitName}>
                            {row.workUnitName}
                          </span>
                        </TextLink>
                      </Td>
                      {COLUMNS.map((column) => (
                        <Td key={column.status} numeric className={row.counts[column.status] > 0 ? styles.count : styles.zero}>
                          {formatNumber(row.counts[column.status])}
                        </Td>
                      ))}
                      <Td>
                        {row.lastMovedAt ? (
                          <div className={styles.moved}>
                            <span className={styles.movedAt}>{formatDateTime(row.lastMovedAt)}</span>
                            <span className={styles.relative}>{relativeDays(row.lastMovedAt)}</span>
                          </div>
                        ) : (
                          <CellEmpty />
                        )}
                      </Td>
                      <Td>
                        <ReadinessBadge readiness={row.readiness} />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              {items.length > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={items.length} noun="Satker" onPageChange={setPage} />}
            </TableFrame>
          </div>
          <p className={styles.footnote}>
            <Info size={13} aria-hidden="true" />
            <span>Siap diajukan berarti semua catatan Satker itu Closed. Satker tanpa catatan tidak dihitung.</span>
          </p>
        </section>
      )}
    </div>
  );
}
