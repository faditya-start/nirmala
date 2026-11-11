import { canTransition, type BulkApproveResponse, type TrackerListResponse, type TrackerNoteRow, type TrackerSort, type TrackerStatus, type WorkUnitDto } from "@nirmala/shared";
import { Check, Inbox, Lock, SearchX, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { usePageBreadcrumb } from "../../app/breadcrumb";
import { useAuth } from "../../app/auth";
import { useCycle } from "../../app/cycle";
import { useNeedsAction } from "../../app/needsAction";
import { api } from "../../lib/api";
import { expectationSentence } from "../../lib/expectation";
import { formatDate } from "../../lib/format";
import {
  Button,
  CellEmpty,
  CellTitle,
  Checkbox,
  CheckResultBadge,
  EmptyState,
  FilterBar,
  FilterSelect,
  Loading,
  PageHeader,
  Pagination,
  TabPanel,
  Table,
  TableFrame,
  TBody,
  TagChip,
  Td,
  Th,
  THead,
  Tabs,
  Tr,
  type SortDirection
} from "../../ui";
import { BulkApproveDialog } from "./BulkApproveDialog";
import { Notice, type NoticeProps } from "./components/Notice";
import {
  CATEGORY_LABEL,
  bulkResultMessage,
  formatNum,
  isTrackerStatus,
  pickDefaultStatus,
  rowAccountLine,
  rowCheckLine,
  STATUS_ORDER,
  STATUS_TEXT,
  summarizeSelection,
  type SelectableRow
} from "./logic";
import { useOrganizationUnits } from "./useOrganizationUnits";
import { describeError, errorStatus, useRemote } from "./useRemote";
import styles from "./TrackerPage.module.css";

const PAGE_SIZE = 25;
const SORTS: readonly TrackerSort[] = ["age", "satker", "category", "check"];
const ALL = "";

const EMPTY_COPY: Record<TrackerStatus, { title: string; description: string }> = {
  menunggu_revisi: { title: "Tidak ada catatan Menunggu Revisi", description: "Semua catatan terbit sudah dicek, dijustifikasi, atau ditutup." },
  perlu_verifikasi: { title: "Tidak ada catatan Perlu Verifikasi", description: "Tidak ada catatan yang menunggu keputusan reviewer." },
  dijustifikasi: { title: "Tidak ada catatan Dijustifikasi", description: "Belum ada justifikasi dari eselon I yang perlu ditinjau." },
  closed: { title: "Belum ada catatan Closed", description: "Catatan ditutup setelah reviewer menyetujui." }
};

/** S8 · Smart Tracker (X1vbk, dialog MYYQx, state kosong oJHVy). Route: /tracker. */
export function TrackerPage() {
  const { active, status: cycleStatus } = useCycle();
  const { user } = useAuth();
  const needs = useNeedsAction();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { units } = useOrganizationUnits();

  const statusParam = params.get("status");
  const orgParam = params.get("organizationUnitId") ?? ALL;
  const workUnitId = params.get("workUnitId") ?? ALL;
  const category = params.get("category") ?? ALL;
  const sort: TrackerSort = SORTS.includes(params.get("sort") as TrackerSort) ? (params.get("sort") as TrackerSort) : "age";
  const dir: "asc" | "desc" = params.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(params.get("page")) || 1);

  // Without ?status the API default is Perlu Verifikasi; if that tab is empty but others are not, open the first useful one.
  const [autoStatus, setAutoStatus] = useState<TrackerStatus | null>(null);
  const autoDone = useRef<string | null>(null);
  const status: TrackerStatus = isTrackerStatus(statusParam) ? statusParam : (autoStatus ?? "perlu_verifikasi");

  const cycleId = active?.id ?? "";
  const query = { cycleId, status, organizationUnitId: orgParam, workUnitId, category, sort, dir, page, pageSize: PAGE_SIZE };
  const key = JSON.stringify(query);
  const list = useRemote<TrackerListResponse>((signal) => api.get<TrackerListResponse>("/tracker/notes", { query, signal }), key, !!active);
  const data = list.data;

  useEffect(() => {
    if (!data || isTrackerStatus(statusParam) || autoDone.current === cycleId) return;
    autoDone.current = cycleId;
    const pick = pickDefaultStatus(data.statusCounts);
    if (pick !== status) setAutoStatus(pick);
  }, [data, statusParam, cycleId, status]);

  // A bulk approve can empty the last page; step back instead of showing an empty table with no pagination.
  const lastPage = data?.pagination.totalPages ?? 1;
  useEffect(() => {
    if (data && !list.loading && page > lastPage) {
      const next = new URLSearchParams(params);
      if (lastPage <= 1) next.delete("page");
      else next.set("page", String(lastPage));
      setParams(next, { replace: true });
    }
  }, [data, list.loading, page, lastPage, params, setParams]);

  const workUnits = useRemote<{ workUnits: WorkUnitDto[] }>((signal) => api.get("/work-units", { query: { organizationUnitId: orgParam }, signal }), `wu-${orgParam}`);

  // Selection for "Setujui massal" (reviewer and admin only, Perlu Verifikasi tab only).
  const canBulk = !!user && status === "perlu_verifikasi" && canTransition("setujui", "perlu_verifikasi", user.role) !== null;
  const [selected, setSelected] = useState<Map<string, SelectableRow>>(new Map());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeProps["tone"]; text: string } | null>(null);
  const selection = useMemo(() => summarizeSelection(selected.values()), [selected]);

  const clearSelection = () => setSelected(new Map());

  function update(changes: Record<string, string | null>, keepPage = false) {
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(name);
      else next.set(name, value);
    }
    if (!keepPage) next.delete("page");
    setParams(next, { replace: true });
    clearSelection();
  }

  const orgOptions = useMemo(() => {
    const known = units.length > 0 ? units.map((unit) => ({ id: unit.id, name: unit.shortName })) : (data?.chrDocuments ?? []).map((chr) => ({ id: chr.organizationUnitId, name: chr.organizationUnitName }));
    const unique = [...new Map(known.map((unit) => [unit.id, unit])).values()];
    return unique;
  }, [units, data]);
  const orgValue = orgParam || (orgOptions.length === 1 ? orgOptions[0].id : ALL);
  const orgName = orgOptions.find((unit) => unit.id === orgValue)?.name ?? null;

  usePageBreadcrumb(orgName ? [{ label: "Tindak lanjut" }, { label: "Smart Tracker" }, { label: orgName }] : null);

  if (cycleStatus === "loading" || cycleStatus === "idle") return <Loading block label="Memuat siklus…" />;
  if (!active) {
    return (
      <div className={styles.page}>
        <PageHeader title="Smart Tracker" />
        <EmptyState icon={Inbox} title="Belum ada siklus reviu" description="Smart Tracker tampil setelah ada siklus reviu dan CHR yang diterbitkan." />
      </div>
    );
  }

  const counts = data?.statusCounts;
  const totalAll = counts ? STATUS_ORDER.reduce((sum, item) => sum + counts[item], 0) : null;
  const filtered = !!(workUnitId || category);
  const rows = data?.items ?? [];
  const chrs = data?.chrDocuments ?? [];
  const chrNumbers = chrs.map((chr) => chr.documentNumber).filter(Boolean);
  const issuedAt = chrs.find((chr) => chr.issuedAt)?.issuedAt ?? null;

  const subtitle = [orgName, chrNumbers.length > 0 ? `CHR ${chrNumbers.length > 2 ? `${chrNumbers.length} dokumen` : chrNumbers.join(", ")}` : null]
    .filter(Boolean)
    .join(" · ");

  const tabs = STATUS_ORDER.map((value) => ({ value, label: STATUS_TEXT[value], count: counts?.[value] }));

  const eligible = rows.filter((row) => row.bulkApprovable);
  const allEligibleSelected = eligible.length > 0 && eligible.every((row) => selected.has(row.id));
  const someSelected = rows.some((row) => selected.has(row.id));

  function toggle(row: TrackerNoteRow, on: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(row.id, { id: row.id, title: row.title, bulkApprovable: row.bulkApprovable });
      else next.delete(row.id);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const row of eligible) {
        if (on) next.set(row.id, { id: row.id, title: row.title, bulkApprovable: true });
        else next.delete(row.id);
      }
      return next;
    });
  }

  function sortProps(column: TrackerSort): { sort: SortDirection; onSort: () => void } {
    return {
      sort: sort === column ? dir : "none",
      onSort: () => update(sort === column ? { sort: column, dir: dir === "desc" ? "asc" : "desc" } : { sort: column, dir: column === "age" ? "desc" : "asc" })
    };
  }

  async function confirmBulk() {
    setBusy(true);
    try {
      const result = await api.post<BulkApproveResponse>("/tracker/notes/bulk-approve", { noteIds: selection.approvable.map((row) => row.id) });
      setNotice({ tone: result.approvedNoteIds.length > 0 ? "sukses" : "info", text: bulkResultMessage(result.approvedNoteIds.length, result.skipped, result.completedChrIds.length, user?.name) });
    } catch (error) {
      setNotice({ tone: "galat", text: `Setujui massal gagal. ${describeError(error)}` });
    } finally {
      setBusy(false);
      setDialogOpen(false);
      clearSelection();
      list.reload();
      void needs.refresh();
    }
  }

  const error = list.error;
  const denied = errorStatus(error) === 403;

  let body;
  if (!data && error) {
    body = denied ? (
      <EmptyState variant="page" icon={Lock} title="Akses ditolak" description={describeError(error)} />
    ) : (
      <EmptyState
        icon={TriangleAlert}
        title="Daftar catatan tidak dapat dimuat"
        description={describeError(error)}
        action={
          <Button variant="utama" onClick={list.reload}>
            Coba lagi
          </Button>
        }
      />
    );
  } else if (!data) {
    body = <Loading block label="Memuat catatan…" />;
  } else if (totalAll === 0 && !filtered) {
    // State: Tracker kosong (oJHVy)
    body = (
      <EmptyState
        icon={Inbox}
        title="Belum ada catatan"
        description="Catatan muncul di sini setelah CHR diterbitkan. Cek otomatis berjalan setiap snapshot revisi diimpor."
        className={styles.emptyCard}
      />
    );
  } else {
    body = (
      <>
        <FilterBar label="Filter catatan">
          {orgOptions.length > 1 && (
            <FilterSelect
              label="Eselon I"
              value={orgValue}
              onChange={(value) => update({ organizationUnitId: value, workUnitId: null })}
              options={[{ value: ALL, label: "Semua" }, ...orgOptions.map((unit) => ({ value: unit.id, label: unit.name }))]}
            />
          )}
          <FilterSelect
            label="Satker"
            value={workUnitId}
            onChange={(value) => update({ workUnitId: value })}
            options={[{ value: ALL, label: "Semua" }, ...(workUnits.data?.workUnits ?? []).map((unit) => ({ value: unit.id, label: unit.name }))]}
          />
          <FilterSelect
            label="Kategori"
            value={category}
            onChange={(value) => update({ category: value })}
            options={[{ value: ALL, label: "Semua" }, ...Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))]}
          />
        </FilterBar>

        {canBulk && selection.total > 0 && (
          <div className={styles.bulkBar} role="region" aria-label="Aksi massal">
            <span className={styles.bulkMark} aria-hidden="true">
              <Check size={12} strokeWidth={3} />
            </span>
            <p className={styles.bulkText} role="status">
              <strong>{formatNum(selection.total)} catatan dipilih</strong>
              <span>
                {selection.skipped.length > 0
                  ? ` · ${formatNum(selection.skipped.length)} tidak ikut karena hasil cek belum terpenuhi`
                  : " · hanya yang hasil cek-nya terpenuhi"}
              </span>
            </p>
            <Button variant="ghost" onClick={clearSelection}>
              Batal pilih
            </Button>
            <Button variant="utama" icon={Check} disabled={selection.approvable.length === 0} onClick={() => setDialogOpen(true)}>
              Setujui yang terpenuhi ({formatNum(selection.approvable.length)})
            </Button>
          </div>
        )}

        {!!error && (
          <Notice
            tone="galat"
            action={
              <Button size="sm" onClick={list.reload}>
                Coba lagi
              </Button>
            }
          >
            Daftar tidak dapat diperbarui. {describeError(error)}
          </Notice>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={filtered ? SearchX : Inbox}
            title={filtered ? "Tidak ada catatan yang cocok" : EMPTY_COPY[status].title}
            description={filtered ? "Ubah atau hapus filter untuk melihat catatan lain." : EMPTY_COPY[status].description}
            action={
              filtered ? (
                <Button onClick={() => update({ organizationUnitId: null, workUnitId: null, category: null })}>Hapus filter</Button>
              ) : undefined
            }
            className={styles.emptyCard}
          />
        ) : (
          <div className={styles.tableBlock} aria-busy={list.loading || undefined}>
            <TableFrame>
              <Table aria-label={`Catatan ${STATUS_TEXT[status]}`} className={styles.table}>
                <THead>
                  <tr>
                    {canBulk && (
                      <Th width={44}>
                        <Checkbox
                          aria-label="Pilih semua catatan yang terpenuhi di halaman ini"
                          checked={allEligibleSelected}
                          indeterminate={!allEligibleSelected && someSelected}
                          disabled={eligible.length === 0}
                          onChange={(event) => toggleAll(event.target.checked)}
                        />
                      </Th>
                    )}
                    <Th width={150} {...sortProps("satker")}>
                      Satker
                    </Th>
                    <Th>Uraian item</Th>
                    <Th width={150} {...sortProps("category")}>
                      Kategori
                    </Th>
                    <Th width={190}>Ekspektasi</Th>
                    <Th width={220} {...sortProps("check")}>
                      Hasil cek terakhir
                    </Th>
                    <Th width={90} align="right" {...sortProps("age")}>
                      Umur
                    </Th>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <Tr key={row.id} onActivate={() => navigate(`/tracker/${row.id}`, { state: { listSearch: params.toString() } })}>
                      {canBulk && (
                        <Td width={44}>
                          <Checkbox
                            aria-label={`Pilih ${row.title}`}
                            checked={selected.has(row.id)}
                            onChange={(event) => toggle(row, event.target.checked)}
                          />
                        </Td>
                      )}
                      <Td>{row.workUnitName ?? <CellEmpty />}</Td>
                      <Td>
                        <CellTitle
                          title={
                            <Link to={`/tracker/${row.id}`} state={{ listSearch: params.toString() }} className={styles.rowLink} title={row.title}>
                              {row.title}
                            </Link>
                          }
                          meta={[<span className="num" key="acc">{rowAccountLine(row).join(" · ")}</span>]}
                        />
                      </Td>
                      <Td>
                        <TagChip>{CATEGORY_LABEL[row.category]}</TagChip>
                      </Td>
                      <Td>
                        {expectationSentence(row.expectation, formatNum)}
                      </Td>
                      <Td>
                        <div className={styles.check}>
                          {row.latestCheck ? <CheckResultBadge result={row.latestCheck.result} /> : <TagChip>Belum dicek</TagChip>}
                          <span className={styles.checkLine}>{rowCheckLine(row)}</span>
                        </div>
                      </Td>
                      <Td align="right" numeric>
                        {formatNum(row.ageDays)} hari
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              <Pagination page={data.pagination.page} pageSize={data.pagination.pageSize} total={data.pagination.total} noun="catatan" onPageChange={(next) => update({ page: String(next) }, true)} />
            </TableFrame>
            <p className={styles.footnote}>
              Umur dihitung sejak CHR terbit{issuedAt ? ` (${formatDate(issuedAt)})` : ""}.
            </p>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Smart Tracker" subtitle={subtitle || undefined} />
      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      <Tabs label="Status catatan" idPrefix="tracker" tabs={tabs} value={status} onChange={(value) => update({ status: value })} />
      <TabPanel idPrefix="tracker" value={status} active={status} className={styles.panel}>
        {body}
      </TabPanel>
      <BulkApproveDialog open={dialogOpen} selection={selection} reviewerName={user?.name ?? "Anda"} busy={busy} onConfirm={() => void confirmBulk()} onCancel={() => setDialogOpen(false)} />
    </div>
  );
}
