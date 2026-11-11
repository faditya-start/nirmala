import { ChartColumn, LogIn } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../app/auth";
import { ButtonLink } from "../ui";
import { Monogram } from "./Brand";
import styles from "./PublicShell.module.css";

const SyntheticNoticeContext = createContext<(show: boolean) => void>(() => undefined);

/**
 * A public page calls this to show "Data pada demo ini sintetis." in the public footer (design aszmF/rekTU).
 * Not shown by default: call it only when the data on the page really is synthetic (demo, mock, seed).
 *
 *   useSyntheticDataNotice();            // show while this page is mounted
 *   useSyntheticDataNotice(data.demo);   // conditional
 */
export function useSyntheticDataNotice(show = true): void {
  const set = useContext(SyntheticNoticeContext);
  useEffect(() => {
    set(show);
    return () => set(false);
  }, [show, set]);
}

/**
 * Public header + footer (frames aszmF desktop, M1k21R mobile 390). Responsive down to 390 px:
 * the nav links hide below 640 px and only "Masuk" stays, exactly as in the mobile frame.
 * Page content goes in `children` (rendered inside <main>); the feature owns the sections.
 */
export function PublicShell({ children, syntheticData = false }: { children: ReactNode; syntheticData?: boolean }) {
  const { user } = useAuth();
  const [pageSynthetic, setPageSynthetic] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const { pathname } = useLocation();

  // Single-page navigation: move focus to <main> so keyboard and screen reader users start at the new page.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);
  const showSynthetic = syntheticData || pageSynthetic;
  return (
    <SyntheticNoticeContext.Provider value={setPageSynthetic}>
      <div className={styles.shell}>
        <a href="#main" className="skip-link">
          Lewati ke konten
        </a>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <Link to="/" className={styles.brand} aria-label="NIRMALA, ke beranda">
              <Monogram />
              <span className={styles.brandName}>NIRMALA</span>
            </Link>
            <nav aria-label="Navigasi publik" className={styles.nav}>
              <NavLink to="/" end className={styles.navLink}>
                Beranda
              </NavLink>
              <NavLink to="/transparansi" className={styles.navLink}>
                Transparansi
              </NavLink>
            </nav>
            <ButtonLink to={user ? "/dashboard" : "/login"} variant="utama" icon={user ? ChartColumn : LogIn}>
              {user ? "Buka aplikasi" : "Masuk"}
            </ButtonLink>
          </div>
        </header>

        <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
          <div className={styles.container}>{children}</div>
        </main>

        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <p>NIRMALA · Reviu RKA Pra-DIPA</p>
            {showSynthetic && <p>Data pada demo ini sintetis.</p>}
          </div>
        </footer>
      </div>
    </SyntheticNoticeContext.Provider>
  );
}
