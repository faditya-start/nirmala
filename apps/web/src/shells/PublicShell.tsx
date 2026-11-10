import { ChartColumn, LogIn } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../app/auth";
import { ButtonLink } from "../ui";
import { Monogram } from "./Brand";
import styles from "./PublicShell.module.css";

/**
 * Public header + footer (frames aszmF desktop, M1k21R mobile 390). Responsive down to 390 px:
 * the nav links hide below 640 px and only "Masuk" stays, exactly as in the mobile frame.
 * Page content goes in `children` (rendered inside <main>); the feature owns the sections.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
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

      <main id="main" tabIndex={-1} className={styles.main}>
        <div className={styles.container}>{children}</div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p>NIRMALA · Reviu RKA Pra-DIPA</p>
          <p>Data pada demo ini sintetis.</p>
        </div>
      </footer>
    </div>
  );
}
