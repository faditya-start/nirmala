import type { MeResponse, TriageListResponse, WorkUnitDto } from "@nirmala/shared";
import { CircleAlert, CircleCheck, FileText, Table2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { usePageBreadcrumb } from "../../app/breadcrumb";
import { useCycle } from "../../app/cycle";
import { api, isApiError } from "../../lib/api";
import { formatNumber } from "../../lib/format";
import { cycleLabel } from "../../lib/types";
import {
  Button,
  ButtonLink,
  Checkbox,
  CellEmpty,
  CellTitle,
  EmptyState,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Loading,
  PageHeader,
  RuleChip,
  ScoreBadge,
  TBody,
  Table,
  TableFrame,
  TagChip,
  Td,
  Th,
  THead,
  Tr
} from "../../ui";
import { AccessDeniedInline } from "./components/AccessDeniedInline";
import { DecisionCell } from "./components/DecisionCell";
import { Pager } from "./components/Pager";
import { EMPTY_FILTER, filterToQuery, isFiltered, itemPath, parseUrlState, urlStateToParams, type TriageFilterState, type TriageUrlState } from "./filters";
import { CATEGORY_OPTIONS, CHANGE_LABEL, DECISION_FILTER_OPTIONS, RISK_TO_SCORE_CATEGORY, snapshotName } from "./labels";
import styles from "./RiskTriagePage.module.css";
import { friendlyError, useRequest } from "./useRequest";

const SEARCH_DEBOUNCE_MS = 300;

interface Unit {
  id: string;
  name: string;
}

/** S4 · Risk Triage (oHui1, state kosong r5ugKa). Route: /triage. */
export function RiskTriagePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { active, status: cycleStatus } = useCycle();
  const state = useMemo(() => parseUrlState(params), [params]);
  const cycleId = active?.id ?? null;

  /** Satu tempat mengubah URL: filter mereset halaman, halaman tidak. */
  const update = useCallback(
    (patch: Partial<TriageUrlState>, options: { replace?: boolean } = {}) => {
      const next: TriageUrlState = { ...state, ...patch };
      if (!("page" in patch)) next.page = 1;
      if ("organizationUnitId" in patch && patch.organizationUnitId !== state.organizationUnitId) next.workUnitId = patch.workUnitId ?? "";
      setParams(urlStateToParams(next), { replace: options.replace });
    },
    [state, setParams]
  );

  // ---- pencarian: teks lokal, URL diperbarui setelah jeda
  const [searchText, setSearchText] = useState(state.q);
  const lastUrlQ = useRef(state.q);
  useEffect(() => {
    if (state.q !== lastUrlQ.current) {
      lastUrlQ.current = state.q;
      setSearchText(state.q);
    }
  }, [state.q]);
  useEffect(() => {
    if (searchText.trim() === state.q.trim()) return;
    const timer = window.setTimeout(() => {
      lastUrlQ.current = searchText;
      update({ q: searchText }, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchText, state.q, update]);

  // ---- data
  const filter: TriageFilterState = state;
  const queryKey = cycleId ? JSON.stringify({ cycleId, ...filterToQuery(filter), page: state.page }) : null;
  const list = useRequest<TriageListResponse>(queryKey, (signal) =>
    api.get<TriageListResponse>("/triage/items", { signal, query: { cycleId, ...filterToQuery(filter), page: state.page > 1 ? state.page : undefined } })
  );
  const workUnits = useRequest<{ workUnits: WorkUnitDto[] }>(cycleId ? `wu:${state.organizationUnitId}` : null, (signal) =>
    api.get("/work-units", { signal, query: { organizationUnitId: state.organizationUnitId || undefined } })
  );
  const me = useRequest<Partial<MeResponse>>("me", (signal) => api.get("/auth/me", { signal, skipUnauthorized: true }));

  // Daftar eselon I: dari /auth/me; bila tidak tersedia, dari snapshot yang pernah dikirim daftar.
  const [seenUnits, setSeenUnits] = useState<Unit[]>([]);
  useEffect(() => {
    if (!list.data) return;
    setSeenUnits((previous) => {
      const known = new Map(previous.map((unit) => [unit.id, unit]));
      for (const snapshot of list.data!.snapshots) known.set(snapshot.organizationUnitId, { id: snapshot.organizationUnitId, name: snapshot.organizationUnitName });
      return known.size === previous.length ? previous : [...known.values()];
    });
  }, [list.data]);
  const units: Unit[] = useMemo(() => {
    const fromMe = me.data?.organizationUnits?.map((unit) => ({ id: unit.id, name: unit.shortName })) ?? [];
    const known = new Map<string, Unit>((fromMe.length > 0 ? fromMe : seenUnits).map((unit) => [unit.id, unit]));
    return [...known.values()].sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [me.data, seenUnits]);

  const data = list.data;
  const pageCount = data?.pagination.totalPages ?? 1;
  const snapshots = data?.snapshots ?? [];
  const singleOrg = snapshots.length === 1 ? snapshots[0] : null;

  usePageBreadcrumb(
    singleOrg
      ? [{ label: "Reviu" }, { label: "Risk Triage", to: "/triage" }, { label: singleOrg.organizationUnitName }]
      : null
  );

  // Halaman di luar rentang (mis. tautan lama setelah data berkurang): kembali ke halaman terakhir.
  useEffect(() => {
    if (data && state.page > pageCount && !list.loading) update({ page: pageCount }, { replace: true });
  }, [data, state.page, pageCount, list.loading, update]);

  // ---- papan tombol: panah atas/bawah (dan j/k) memindah fokus antarbaris
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  function onBodyKeyDown(event: KeyboardEvent<HTMLTableSectionElement>) {
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).matches("tr")) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const delta = event.key === "ArrowDown" || event.key === "j" ? 1 : event.key === "ArrowUp" || event.key === "k" ? -1 : 0;
    if (!delta) return;
    const rows = [...(bodyRef.current?.querySelectorAll<HTMLTableRowElement>("tr") ?? [])];
    const index = rows.indexOf(event.target as HTMLTableRowElement);
    const target = rows[index + delta];
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  // ---- tampilan
  if (cycleStatus === "loading" || cycleStatus === "idle") return <Loading block label="Memuat siklus…" />;
  if (!active) {
    return (
      <div className={styles.page}>
        <PageHeader title="Risk Triage" />
        <EmptyState
          icon={Table2}
          title="Belum ada siklus"
          description="Risk Triage tampil setelah ada siklus reviu dan snapshot RKA yang diimpor."
          action={<ButtonLink to="/siklus" icon={FileText}>Buka Siklus & Impor Data</ButtonLink>}
        />
      </div>
    );
  }

  const stage = active.stage.charAt(0).toUpperCase() + active.stage.slice(1);
  const cycleText = `TA ${active.fiscalYear} ${stage}`;
  const flaggedNone = Boolean(data && data.summary.flaggedItems === 0);
  const emptyFlagged = Boolean(data && data.pagination.total === 0 && state.onlyFlagged && flaggedNone);
  const subtitleParts: string[] = [];
  if (singleOrg) subtitleParts.push(singleOrg.organizationUnitName, `snapshot ${snapshotName(singleOrg.versionNo, singleOrg.label)}`);
  else if (snapshots.length > 1) subtitleParts.push(`${snapshots.length} eselon I`);
  subtitleParts.push(cycleText);
  if (emptyFlagged && singleOrg) subtitleParts.push(`${formatNumber(singleOrg.itemCount)} item`);

  const orgOptions = units.length > 1 ? [{ value: "", label: "Semua" }, ...units.map((unit) => ({ value: unit.id, label: unit.name }))] : units.map((unit) => ({ value: unit.id, label: unit.name }));
  const orgValue = units.length === 1 ? units[0].id : state.organizationUnitId;
  const satkerOptions = [{ value: "", label: "Semua" }, ...(workUnits.data?.workUnits ?? []).map((unit) => ({ value: unit.id, label: unit.name }))];
  const categoryOptions = [{ value: "", label: "Semua" }, ...CATEGORY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))];
  const filtered = isFiltered(filter);

  const detailFilter: TriageFilterState = filter;

  function clearFilters() {
    setSearchText("");
    lastUrlQ.current = "";
    setParams(urlStateToParams({ ...EMPTY_FILTER, page: 1 }));
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Risk Triage"
        subtitle={subtitleParts.join(" · ")}
        actions={
          <ButtonLink to="/chr" icon={FileText}>
            Buka CHR
          </ButtonLink>
        }
      />

      <FilterBar label="Filter daftar item">
        <FilterSearch value={searchText} onChange={setSearchText} placeholder="Cari uraian item" />
        <FilterSelect label="Eselon I" value={orgValue} options={orgOptions} onChange={(value) => update({ organizationUnitId: value })} />
        <FilterSelect label="Satker" value={state.workUnitId} options={satkerOptions} onChange={(value) => update({ workUnitId: value })} />
        <FilterSelect label="Kategori" value={state.ruleCategory} options={categoryOptions} onChange={(value) => update({ ruleCategory: value as TriageFilterState["ruleCategory"] })} />
        <FilterSelect label="Keputusan" value={state.decision} options={DECISION_FILTER_OPTIONS} onChange={(value) => update({ decision: value as TriageFilterState["decision"] })} />
        <Checkbox className={styles.flagToggle} label="Hanya yang kena aturan" checked={state.onlyFlagged} onChange={(event) => update({ onlyFlagged: event.target.checked })} />
      </FilterBar>

      {list.error && !data ? (
        isApiError(list.error) && list.error.status === 403 ? (
          <AccessDeniedInline message={list.error.message} />
        ) : (
          <EmptyState
            icon={CircleAlert}
            title="Daftar item belum bisa dimuat"
            description={friendlyError(list.error, "Daftar item tidak dapat dimuat. Coba lagi.")}
            action={<Button onClick={() => void list.reload()}>Coba lagi</Button>}
          />
        )
      ) : !data ? (
        <Loading block label="Memuat daftar item…" />
      ) : (
        <>
          <div className={styles.summaryRow}>
            {flaggedNone ? (
              <p className={styles.summary} aria-live="polite">
                0 item kena aturan · {formatNumber(data.summary.analyzedItems)} item dinilai skor
              </p>
            ) : (
              <p className={styles.summary} aria-live="polite">
                <strong>{formatNumber(data.summary.flaggedItems)} item kena aturan</strong>
                <span className={styles.summaryMuted}> · {formatNumber(data.summary.unreviewedFlaggedItems)} belum ditinjau</span>
              </p>
            )}
            {!flaggedNone && <p className={styles.order}>Urutan: kena aturan dulu, lalu skor tertinggi</p>}
          </div>

          {list.error && (
            <p className={styles.inlineError} role="alert">
              <CircleAlert size={14} aria-hidden="true" />
              {friendlyError(list.error, "Daftar tidak dapat dimuat ulang.")} Data yang tampil mungkin sudah lama.
              <Button size="sm" onClick={() => void list.reload()}>
                Coba lagi
              </Button>
            </p>
          )}

          {data.pagination.total === 0 ? (
            snapshots.length === 0 ? (
              <EmptyState
                icon={Table2}
                title="Belum ada snapshot"
                description="Belum ada data RKA yang diimpor untuk siklus ini. Impor snapshot di Siklus & Impor Data."
                action={<ButtonLink to="/siklus">Buka Siklus & Impor Data</ButtonLink>}
              />
            ) : emptyFlagged ? (
              <EmptyState
                className={styles.emptyCard}
                icon={CircleCheck}
                title="Tidak ada item yang kena aturan"
                description="Tidak ada item di snapshot ini yang cocok dengan aturan aktif. Item tetap diurutkan menurut skor kalau filter dimatikan."
                action={
                  <Button icon={Table2} onClick={() => update({ onlyFlagged: false })}>
                    Tampilkan semua item
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Table2}
                title="Tidak ada item yang cocok"
                description="Tidak ada item yang sesuai dengan filter ini. Ubah atau hapus filter untuk melihat item lain."
                action={filtered ? <Button onClick={clearFilters}>Hapus semua filter</Button> : undefined}
              />
            )
          ) : (
            <TableFrame>
              <Table aria-label="Daftar item Risk Triage" aria-busy={list.loading || undefined} className={list.loading ? styles.busy : undefined}>
                <THead>
                  <tr>
                    <Th>Uraian (Satker · akun)</Th>
                    <Th align="right" width={150}>
                      Total (Rp)
                    </Th>
                    <Th width={130}>Aturan</Th>
                    <Th width={130}>Skor</Th>
                    <Th width={100}>Perubahan</Th>
                    <Th width={150}>Keputusan</Th>
                  </tr>
                </THead>
                <TBody ref={bodyRef} onKeyDown={onBodyKeyDown}>
                  {data.items.map((row) => {
                    const href = itemPath(row.id, detailFilter);
                    return (
                      <Tr key={row.id} onActivate={() => navigate(href)}>
                        <Td>
                          <CellTitle
                            title={
                              <Link to={href} className={styles.rowLink} title={row.description}>
                                {row.description}
                              </Link>
                            }
                            meta={[row.workUnitName, <span key="akun" className="mono">{row.accountCode}</span>]}
                          />
                        </Td>
                        <Td numeric>{formatNumber(row.totalAmount)}</Td>
                        <Td>
                          {row.ruleCodes.length === 0 ? (
                            <CellEmpty />
                          ) : (
                            <span className={styles.chips}>
                              {row.ruleCodes.map((code) => (
                                <RuleChip key={code} code={code} />
                              ))}
                            </span>
                          )}
                        </Td>
                        <Td>
                          {row.score === null ? (
                            <span className={styles.unscored}>Belum dinilai</span>
                          ) : (
                            <ScoreBadge score={row.score} category={row.riskCategory ? RISK_TO_SCORE_CATEGORY[row.riskCategory] : undefined} />
                          )}
                        </Td>
                        <Td>
                          <TagChip>{CHANGE_LABEL[row.changeType]}</TagChip>
                        </Td>
                        <Td>
                          <DecisionCell row={row} />
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
              <Pager
                page={state.page}
                pageSize={data.pagination.pageSize}
                total={data.pagination.total}
                pageCount={pageCount}
                onPageChange={(page) => update({ page })}
              />
            </TableFrame>
          )}
        </>
      )}
    </div>
  );
}
