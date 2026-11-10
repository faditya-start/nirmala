import type { PublicCycleDto, PublicCycleListResponse, PublicTransparencyResponse } from "@nirmala/shared";
import { CircleAlert, ChevronDown, Info, RefreshCw, SearchX, ChartColumn } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { Button, ButtonLink, EmptyState, KpiCard, Loading } from "../../ui";
import { CATEGORY_COLUMNS, categoryCount, classifyFailure, cycleOptionLabel, formatCount, kpiView, pickCycleId, rowLabel, type LoadFailure } from "./publicLogic";
import styles from "./Transparency.module.css";

/**
 * P2 · Transparansi publik (rekTU desktop, c1KqO mobile 390). Route: /transparansi. Rendered inside PublicShell.
 * Only process aggregates for cycles whose DIPA has been issued. No session, no item, Satker name or per-item rupiah.
 * GET /api/public/cycles, GET /api/public/transparency?cycleId=...
 */

type Load<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; failure: LoadFailure };

const FAILURE_COPY: Record<LoadFailure, { title: string; description: string }> = {
  jaringan: { title: "Ringkasan tidak dapat dimuat", description: "Koneksi ke server terputus. Periksa jaringan, lalu coba lagi." },
  server: { title: "Ringkasan tidak dapat dimuat", description: "Server sedang bermasalah. Coba lagi beberapa saat lagi." },
  terlalu_sering: { title: "Terlalu banyak permintaan", description: "Tunggu sebentar, lalu coba lagi." },
  belum_tersedia: { title: "Ringkasan belum tersedia", description: "Layanan ringkasan transparansi belum aktif. Silakan kembali lagi nanti." },
  tidak_ditemukan: { title: "Siklus tidak ditemukan", description: "Siklus ini tidak ada, atau DIPA-nya belum terbit." }
};

function useCycles(reloadKey: number) {
  const [state, setState] = useState<Load<PublicCycleDto[]>>({ status: "loading" });
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setState({ status: "loading" });
    api
      .get<PublicCycleListResponse>("/public/cycles", { signal: controller.signal })
      .then((result) => current && setState({ status: "ready", data: result.cycles ?? [] }))
      .catch((error: unknown) => current && setState({ status: "error", failure: classifyFailure(error) }));
    return () => {
      current = false;
      controller.abort();
    };
  }, [reloadKey]);
  return state;
}

function useTransparency(cycleId: string | null, reloadKey: number) {
  const [state, setState] = useState<Load<PublicTransparencyResponse>>({ status: "loading" });
  useEffect(() => {
    if (!cycleId) return;
    let current = true;
    const controller = new AbortController();
    setState({ status: "loading" });
    api
      .get<PublicTransparencyResponse>("/public/transparency", { query: { cycleId }, signal: controller.signal })
      .then((result) => current && setState({ status: "ready", data: result }))
      .catch((error: unknown) => current && setState({ status: "error", failure: classifyFailure(error) }));
    return () => {
      current = false;
      controller.abort();
    };
  }, [cycleId, reloadKey]);
  return state;
}

export function TransparencyPage() {
  const [params, setParams] = useSearchParams();
  const [cyclesKey, setCyclesKey] = useState(0);
  const [dataKey, setDataKey] = useState(0);
  const cycles = useCycles(cyclesKey);

  const requested = params.get("siklus");
  const cycleList = cycles.status === "ready" ? cycles.data : [];
  const cycleId = cycles.status === "ready" ? pickCycleId(requested, cycleList) : null;
  const detail = useTransparency(cycleId, dataKey);

  const selectCycle = useCallback(
    (id: string) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set("siklus", id);
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  const reloadAll = () => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete("siklus");
        return next;
      },
      { replace: true }
    );
    setCyclesKey((key) => key + 1);
  };

  const chosen = cycleList.find((cycle) => cycle.id === cycleId);

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Transparansi reviu RKA</h1>
        <p className={styles.subtitle}>Ringkasan proses reviu per siklus. Hanya siklus yang DIPA-nya sudah terbit yang ditampilkan.</p>
      </header>

      {cycles.status === "loading" && <Loading label="Memuat daftar siklus…" block />}

      {cycles.status === "error" && <FailureState failure={cycles.failure} action={<RetryButton onClick={() => setCyclesKey((key) => key + 1)} />} />}

      {cycles.status === "ready" && cycleList.length === 0 && (
        <EmptyState
          icon={ChartColumn}
          title="Belum ada siklus yang DIPA-nya terbit"
          description="Ringkasan transparansi baru tersedia setelah DIPA suatu siklus terbit. Silakan kembali lagi nanti."
          action={<ButtonLink to="/">Kembali ke beranda</ButtonLink>}
        />
      )}

      {cycles.status === "ready" && chosen && (
        <>
          <div className={styles.cyclePicker}>
            <label className={styles.picker}>
              <span className={styles.pickerLabel}>Siklus</span>
              <select className={styles.pickerSelect} value={chosen.id} onChange={(event) => selectCycle(event.target.value)}>
                {cycleList.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycleOptionLabel(cycle)}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" className={styles.chevron} />
            </label>
            <p className={styles.issued}>DIPA terbit {formatDate(chosen.dipaIssuedAt)}</p>
          </div>

          {detail.status === "loading" && <Loading label="Memuat ringkasan…" block />}
          {detail.status === "error" && (
            <FailureState
              failure={detail.failure}
              action={
                detail.failure === "tidak_ditemukan" ? (
                  <Button icon={RefreshCw} onClick={reloadAll}>
                    Muat ulang daftar siklus
                  </Button>
                ) : (
                  <RetryButton onClick={() => setDataKey((key) => key + 1)} />
                )
              }
            />
          )}
          {detail.status === "ready" && <Summary data={detail.data} />}
        </>
      )}

      <Method />
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button icon={RefreshCw} onClick={onClick}>
      Coba lagi
    </Button>
  );
}

function FailureState({ failure, action }: { failure: LoadFailure; action: React.ReactNode }) {
  const copy = FAILURE_COPY[failure];
  return <EmptyState icon={failure === "tidak_ditemukan" ? SearchX : CircleAlert} title={copy.title} description={copy.description} action={action} />;
}

function Summary({ data }: { data: PublicTransparencyResponse }) {
  const kpi = useMemo(() => kpiView(data.kpis), [data.kpis]);
  const rows = data.rows.map((row) => ({ key: `${row.kind}:${row.label}`, label: rowLabel(row), byCategory: row.byCategory, total: row.total }));
  const totals = { key: "total", label: "Total", byCategory: data.totals.byCategory, total: data.totals.total };
  const tableLabel = "Jumlah catatan per eselon I dan kategori";

  return (
    <>
      <section className={styles.kpis} aria-label="Ringkasan angka">
        <KpiCard label="Jumlah catatan" value={kpi.notes.value} hint={kpi.notes.hint} />
        <KpiCard label="Closed sebelum diajukan" value={kpi.closed.value} hint={kpi.closed.hint} progress={kpi.closed.progress} progressLabel="Catatan closed sebelum ADK diajukan" />
        <KpiCard label="Median hari terbit sampai closed" value={kpi.median.value} hint={kpi.median.hint} />
      </section>

      <section className={styles.breakdown} aria-labelledby="breakdown-title">
        <div className={styles.sectionHead}>
          <h2 id="breakdown-title" className={styles.sectionTitle}>
            Catatan per eselon I dan kategori
          </h2>
          <p className={styles.sectionHint}>Eselon I dengan catatan sedikit digabung menjadi "Eselon I lainnya".</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={SearchX} title="Belum ada catatan terbit" description="Siklus ini belum memiliki catatan yang diterbitkan." />
        ) : (
          <>
            <div className={styles.tableFrame}>
              <div className={styles.tableScroll}>
                <table className={styles.table} aria-label={tableLabel}>
                  <colgroup>
                    <col />
                    <col className={styles.colWide} />
                    <col className={styles.colWide} />
                    <col className={styles.colMid} />
                    <col className={styles.colNarrow} />
                    <col className={styles.colNarrow} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className={styles.thName}>
                        Eselon I
                      </th>
                      {CATEGORY_COLUMNS.map((column) => (
                        <th key={column.key} scope="col" className={styles.thNum}>
                          {column.label}
                        </th>
                      ))}
                      <th scope="col" className={styles.thNum}>
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key}>
                        <th scope="row" className={styles.rowName}>
                          {row.label}
                        </th>
                        {CATEGORY_COLUMNS.map((column) => (
                          <td key={column.key} className={`${styles.cell} num`}>
                            {formatCount(categoryCount(row.byCategory, column.key))}
                          </td>
                        ))}
                        <td className={`${styles.cell} ${styles.cellTotal} num`}>{formatCount(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" className={`${styles.rowName} ${styles.strong}`}>
                        {totals.label}
                      </th>
                      {CATEGORY_COLUMNS.map((column) => (
                        <td key={column.key} className={`${styles.cell} ${styles.cellTotal} num`}>
                          {formatCount(categoryCount(totals.byCategory, column.key))}
                        </td>
                      ))}
                      <td className={`${styles.cell} ${styles.cellTotal} num`}>{formatCount(totals.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <ul className={styles.cards} role="list" aria-label={tableLabel}>
              {[...rows, totals].map((row) => (
                <li key={row.key} className={`${styles.card} ${row.key === "total" ? styles.cardTotal : ""}`}>
                  <div className={styles.cardHead}>
                    <h3 className={styles.cardName}>{row.label}</h3>
                    <span className={`${styles.cardSum} num`}>{formatCount(row.total)}</span>
                  </div>
                  <dl className={styles.cardRows}>
                    {CATEGORY_COLUMNS.map((column) => {
                      const value = categoryCount(row.byCategory, column.key);
                      return (
                        <div key={column.key} className={styles.cardRow}>
                          <dt>{column.label}</dt>
                          <dd className={`num ${value === 0 ? styles.zero : ""}`}>{formatCount(value)}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

const TERMS: ReadonlyArray<{ term: string; meaning: string }> = [
  { term: "Catatan", meaning: "Catatan reviu pada CHR yang sudah terbit. Draf tidak dihitung." },
  { term: "Closed sebelum diajukan", meaning: "Catatan berstatus Closed sebelum ADK diajukan, dibagi seluruh catatan terbit pada siklus." },
  { term: "Median hari", meaning: "Jumlah hari dari CHR terbit sampai catatan closed. Median dipakai agar tidak terpengaruh nilai ekstrem." },
  { term: "Kategori", meaning: "Ketepatan akun, efisiensi belanja, kesesuaian satuan biaya, dan lainnya." }
];

function Method() {
  return (
    <div className={styles.method}>
      <section className={styles.terms} aria-labelledby="terms-title">
        <h2 id="terms-title" className={styles.sectionTitle}>
          Cara membaca angka
        </h2>
        <dl className={styles.termList}>
          {TERMS.map((item) => (
            <div key={item.term} className={styles.term}>
              <dt>{item.term}</dt>
              <dd>{item.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.notice} aria-labelledby="notice-title">
        <h2 id="notice-title" className={styles.sectionTitle}>
          Catatan penting
        </h2>
        <div className={styles.disclaimer}>
          <Info size={16} aria-hidden="true" />
          <p>Angka ini meringkas proses reviu, bukan penilaian atas Satker atau pejabat tertentu. Catatan adalah usulan untuk ditinjau. Halaman ini tidak memuat item, nama Satker, atau nilai rupiah per item.</p>
        </div>
      </section>
    </div>
  );
}
