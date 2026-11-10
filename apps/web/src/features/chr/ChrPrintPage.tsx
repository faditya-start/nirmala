import { ArrowLeft, Printer } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { expectationCode } from "@nirmala/shared";
import { Button, ButtonLink, Loading } from "../../ui";
import { ResourceError } from "./components/ResourceError";
import { chrApi } from "./chrApi";
import { CATEGORY_LABEL, STAGE_LABEL, estimatePages, formatLongDate } from "./logic";
import { useResource } from "./useResource";
import styles from "./Print.module.css";

/**
 * `@page` is document-wide, so it is injected only while this page is mounted. Margins replace the sheet padding
 * when printing; the footer (identity and "Halaman N dari M") uses page margin boxes, which Chromium fills per page.
 */
const PAGE_CSS = `
@page {
  size: A4;
  margin: 13mm 15mm 18mm;
  @bottom-left { content: var(--chr-footer-identity); font-family: var(--font-ui); font-size: 9pt; color: var(--ink-muted); vertical-align: top; padding-top: 3mm; }
  @bottom-right { content: "Halaman " counter(page) " dari " counter(pages); font-family: var(--font-ui); font-size: 9pt; color: var(--ink-muted); vertical-align: top; padding-top: 3mm; }
}
`;

/** S7 · Cetak CHR A4 (Bko3K). Route: /chr/:chrId/cetak (shell "none"). Always light, data from GET /chr/:id/print. */
export function ChrPrintPage() {
  const { chrId = "" } = useParams();
  const [params] = useSearchParams();
  const versionParam = Number(params.get("version"));
  const version = Number.isInteger(versionParam) && versionParam >= 1 ? versionParam : undefined;
  const resource = useResource(() => chrApi.print(chrId, version), [chrId, version]);
  const sheet = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);

  // Print is always light, whatever the OS or the saved theme says.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    return () => {
      if (previous === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", previous);
    };
  }, []);

  const data = resource.data;
  useEffect(() => {
    const node = sheet.current;
    if (!node || !data) return;
    const measure = () => setPages(estimatePages(node.scrollHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [data]);

  useEffect(() => {
    if (data) document.title = `CHR ${data.documentNumber ?? "draf"} · NIRMALA`;
  }, [data]);

  if (resource.loading) return <Loading block label="Menyiapkan dokumen cetak…" />;
  if (resource.error || !data) {
    return <ResourceError error={resource.error} what="dokumen cetak" onRetry={() => void resource.reload()} backTo={`/chr/${encodeURIComponent(chrId)}`} backLabel="Kembali ke dokumen CHR" />;
  }

  const identity = `NIRMALA · ${data.documentNumber ? `CHR ${data.documentNumber}` : "CHR draf"} · versi ${data.versionNumber}`;
  const isDraft = data.status === "draft";
  const dateLabel = formatLongDate(data.issuedAt ?? data.generatedAt);
  const empty = data.groups.every((group) => group.rows.length === 0);

  return (
    <div className={styles.screen} style={{ "--chr-footer-identity": JSON.stringify(identity) } as React.CSSProperties}>
      <style>{PAGE_CSS}</style>
      <div className={styles.toolbar}>
        <ButtonLink to={`/chr/${encodeURIComponent(chrId)}`} icon={ArrowLeft} variant="ghost">
          Kembali ke dokumen
        </ButtonLink>
        <p className={styles.toolbarHint}>Pratinjau A4. Pilih Cetak lalu simpan sebagai PDF bila perlu.</p>
        <Button variant="utama" icon={Printer} onClick={() => window.print()}>
          Cetak
        </Button>
      </div>

      <article ref={sheet} className={styles.sheet} aria-label="Catatan Hasil Reviu">
        <header className={styles.kop}>
          <p className={styles.org}>{data.letterhead.organizationName}</p>
          <p className={styles.unit}>{data.letterhead.unitName}</p>
          {data.letterhead.address && <p className={styles.address}>{data.letterhead.address}</p>}
        </header>
        <div className={styles.rule} aria-hidden="true">
          <span />
          <span />
        </div>

        <div className={styles.docTitle}>
          <h1>CATATAN HASIL REVIU (CHR)</h1>
          <p>Reviu Rencana Kerja dan Anggaran Kementerian/Lembaga</p>
          <p className={styles.number}>Nomor: {data.documentNumber ?? "belum terbit (draf)"}</p>
        </div>

        <dl className={styles.identity}>
          <Row label="Eselon I" value={data.organizationUnitName} />
          <Row label="Tahun anggaran" value={String(data.fiscalYear)} />
          <Row label="Tahap reviu" value={STAGE_LABEL[data.stage]} />
          <Row label="Tanggal terbit" value={data.issuedAt ? formatLongDate(data.issuedAt) : "Belum terbit"} />
          <Row label="Versi dokumen" value={isDraft ? "Draf" : String(data.versionNumber)} />
        </dl>

        <table className={styles.table}>
          <colgroup>
            <col style={{ width: "5.6%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "9.7%" }} />
            <col style={{ width: "36.7%" }} />
            <col style={{ width: "19%" }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">No</th>
              <th scope="col">Satker</th>
              <th scope="col">Uraian item</th>
              <th scope="col">Akun</th>
              <th scope="col">Catatan</th>
              <th scope="col">Ekspektasi</th>
            </tr>
          </thead>
          {empty && (
            <tbody>
              <tr>
                <td colSpan={6} className={styles.none}>
                  Tidak ada catatan pada dokumen ini.
                </td>
              </tr>
            </tbody>
          )}
          {data.groups
            .filter((group) => group.rows.length > 0)
            .map((group) => (
              <tbody key={group.category}>
                <tr className={styles.groupRow}>
                  <th colSpan={6} scope="colgroup">
                    {group.letter}. {CATEGORY_LABEL[group.category]}
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.number}>
                    <td className={styles.no}>{row.number}</td>
                    <td>{row.workUnitName ?? "-"}</td>
                    <td>{row.itemDescription}</td>
                    <td className="mono">{row.accountCode ?? "-"}</td>
                    <td className={styles.text}>{row.text}</td>
                    <td className="mono">{expectationCode(row.expectation)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
        </table>

        <section className={styles.block}>
          <h2>Rekomendasi</h2>
          <p>{data.recommendation?.trim() ? data.recommendation : "Tidak ada rekomendasi."}</p>
        </section>

        <section className={styles.block}>
          <h2>Tanggapan eselon I</h2>
          <div className={styles.response}>{data.unitResponse?.trim() ? data.unitResponse : <span className={styles.placeholder}>Diisi oleh eselon I setelah CHR diterima.</span>}</div>
        </section>

        <div className={styles.fill} />

        <section className={styles.signature}>
          <p>
            {data.signatory.city}, {dateLabel}
          </p>
          <p className={styles.signTitle}>{data.signatory.title},</p>
          <div className={styles.signSpace} />
          {data.signatory.name ? (
            <>
              <p className={styles.signName}>{data.signatory.name}</p>
              {data.signatory.nip && <p>NIP {data.signatory.nip}</p>}
            </>
          ) : (
            <p className={styles.placeholder}>[Nama dan NIP pejabat penandatangan]</p>
          )}
        </section>

        <footer className={styles.footer}>
          <span>{identity}</span>
          <span>
            Halaman 1 dari {pages}
          </span>
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.idRow}>
      <dt>{label}</dt>
      <dd>
        <span aria-hidden="true">: </span>
        {value}
      </dd>
    </div>
  );
}
