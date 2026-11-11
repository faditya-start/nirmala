import { ChartColumn, FileText, ListChecks, LogIn, ScanSearch, type LucideIcon } from "lucide-react";
import { ButtonLink, StatusBadge, type NoteStatus } from "../../ui";
import styles from "./Home.module.css";

/** P1 · Beranda (aszmF desktop, M1k21R mobile 390). Route: /. Rendered inside PublicShell. Static, no API. */

const JOURNEY: ReadonlyArray<{ status: NoteStatus; text: string }> = [
  { status: "draf", text: "Reviewer menyusun catatan dari item yang ditandai aturan." },
  { status: "menunggu_revisi", text: "CHR terbit. Satker menyesuaikan RKA." },
  { status: "perlu_verifikasi", text: "ADK revisi masuk dan sistem mengecek hasilnya." },
  { status: "closed", text: "Reviewer menyetujui. Catatan ditutup." }
];

const PILLARS: ReadonlyArray<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: ScanSearch, title: "Deteksi", text: "Aturan dan skor menandai item yang perlu ditinjau, beserta alasannya." },
  { icon: FileText, title: "CHR", text: "Catatan disusun per eselon I, lalu diterbitkan sebagai dokumen yang terkunci." },
  { icon: ListChecks, title: "Smart Tracker", text: "Tiap catatan dicek otomatis terhadap revisi ADK berikutnya, lalu diverifikasi reviewer." }
];

export function HomePage() {
  return (
    <>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Alat bantu reviu untuk APIP</p>
          <h1 id="hero-title" className={styles.heroTitle}>
            Reviu RKA yang bisa ditelusuri, dari impor sampai catatan ditutup
          </h1>
          <p className={styles.lead}>NIRMALA membantu reviewer menandai item RKA yang perlu ditinjau, menerbitkan catatan reviu, lalu memastikan tindak lanjutnya sebelum ADK diajukan.</p>
          <div className={styles.actions}>
            <ButtonLink to="/login" variant="utama" icon={LogIn}>
              Masuk
            </ButtonLink>
            <ButtonLink to="/transparansi" icon={ChartColumn}>
              Lihat transparansi
            </ButtonLink>
          </div>
        </div>

        <section className={styles.journey} aria-labelledby="journey-title">
          <h2 id="journey-title" className={styles.journeyTitle}>
            Perjalanan satu catatan
          </h2>
          <ol className={styles.steps} role="list">
            {JOURNEY.map((step) => (
              <li key={step.status} className={styles.step}>
                <StatusBadge status={step.status} />
                <p className={styles.stepText}>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </section>

      <section aria-label="Tiga bagian utama">
        <ul className={styles.pillars} role="list">
          {PILLARS.map(({ icon: Icon, title, text }) => (
            <li key={title} className={styles.pillar}>
              <span className={styles.iconBox} aria-hidden="true">
                <Icon size={18} />
              </span>
              <div className={styles.pillarBody}>
                <h2 className={styles.pillarTitle}>{title}</h2>
                <p className={styles.pillarText}>{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.cta} aria-labelledby="cta-title">
        <div className={styles.ctaText}>
          <h2 id="cta-title" className={styles.ctaTitle}>
            Ringkasan terbuka untuk publik
          </h2>
          <p className={styles.ctaBody}>Jumlah catatan, persentase closed, dan median hari per eselon I. Tanpa item, nama Satker, atau rupiah per item.</p>
        </div>
        <ButtonLink to="/transparansi" icon={ChartColumn}>
          Lihat transparansi
        </ButtonLink>
      </section>
    </>
  );
}
