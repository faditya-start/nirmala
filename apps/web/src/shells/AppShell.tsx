import { Bell, CalendarRange, ChevronsUpDown, LogOut, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Sun, type LucideIcon } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app/auth";
import { useBreadcrumbOverride } from "../app/breadcrumb";
import { useCycle } from "../app/cycle";
import { findNav, navForRole } from "../app/nav";
import { useNeedsAction } from "../app/needsAction";
import { cn } from "../lib/cn";
import { readStorage, writeStorage } from "../lib/storage";
import { nextTheme, THEME_LABEL, type ThemePreference } from "../lib/theme";
import { useTheme } from "../lib/useTheme";
import { daysUntil, formatCountdown, formatDayMonth } from "../lib/format";
import { initials, ROLE_LABEL, type AuthUser } from "../lib/roles";
import { cycleLabel } from "../lib/types";
import { Breadcrumb, IconButton, type BreadcrumbItem } from "../ui";
import { Monogram } from "./Brand";
import styles from "./AppShell.module.css";

/* ------------------------------------------------------------ Cycle picker */

/** Shell/PemilihSiklus: "Siklus aktif", the cycle name and the ADK countdown. A native select sits invisibly on top. */
function CyclePicker({ collapsed }: { collapsed: boolean }) {
  const { cycles, active, status, setActiveId } = useCycle();
  const deadline = active?.adkDeadline ?? null;
  const days = daysUntil(deadline);
  const countdown = deadline ? `ADK ${formatDayMonth(deadline)} · ${formatCountdown(days)}` : null;
  const name = active ? cycleLabel(active) : status === "loading" ? "Memuat siklus…" : status === "error" ? "Siklus tidak termuat" : "Belum ada siklus";

  return (
    <div className={styles.cycle}>
      <CalendarRange size={16} aria-hidden="true" className={styles.cycleIcon} />
      <span className={styles.cycleLabel}>Siklus aktif</span>
      <span className={styles.cycleRow}>
        <span className={styles.cycleName}>{name}</span>
        <ChevronsUpDown size={14} aria-hidden="true" />
      </span>
      {countdown && <span className={styles.cycleDeadline}>{countdown}</span>}
      <select
        className={styles.cycleSelect}
        aria-label="Siklus aktif"
        title={collapsed ? [name, countdown].filter(Boolean).join(" · ") : undefined}
        value={active ? String(active.id) : ""}
        disabled={cycles.length === 0}
        onChange={(event) => setActiveId(event.target.value)}
      >
        {cycles.length === 0 && <option value="">{name}</option>}
        {cycles.map((cycle) => (
          <option key={String(cycle.id)} value={String(cycle.id)}>
            {cycleLabel(cycle)}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------ Theme control */

const THEME_OPTIONS: { value: ThemePreference; icon: LucideIcon }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor }
];

/**
 * Tema: a three-way segmented control in the expanded sidebar; a single cycle button in the collapsed rail
 * (CSS shows one of the two). The pressed segment pairs a filled chip with a border, never colour alone.
 */
function ThemeControl({ theme, onTheme }: { theme: ThemePreference; onTheme: (theme: ThemePreference) => void }) {
  const next = nextTheme(theme);
  const Current = THEME_OPTIONS.find((option) => option.value === theme)?.icon ?? Monitor;
  return (
    <div className={styles.theme}>
      <span className={styles.themeLabel} aria-hidden="true">
        Tema
      </span>
      <div role="group" aria-label="Tema" className={styles.themeGroup}>
        {THEME_OPTIONS.map(({ value, icon: Icon }) => (
          <button
            key={value}
            type="button"
            className={styles.themeOption}
            aria-pressed={theme === value}
            aria-label={THEME_LABEL[value]}
            title={THEME_LABEL[value]}
            onClick={() => onTheme(value)}
          >
            <Icon size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
      <IconButton
        icon={Current}
        label={`Tema: ${THEME_LABEL[theme]}. Ganti ke ${THEME_LABEL[next]}`}
        className={cn(styles.railTool, styles.themeCycle)}
        onClick={() => onTheme(next)}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- Sidebar */

function Sidebar({
  user,
  open,
  collapsed,
  onNavigate,
  onLogout
}: {
  user: AuthUser;
  open: boolean;
  collapsed: boolean;
  onNavigate: () => void;
  onLogout: () => void;
}) {
  const groups = useMemo(() => navForRole(user.role), [user.role]);
  const { navCounts } = useNeedsAction();
  const [theme, setTheme] = useTheme();
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const unit = user.unitLabel ? ` · ${user.unitLabel}` : "";
  const identity = `${user.name} · ${ROLE_LABEL[user.role]}${unit}`;

  // The nav scrolls on its own: keep the current page in view (also after the rail or a short window hides it).
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [pathname, collapsed]);

  return (
    <aside id="app-sidebar" className={cn(styles.sidebar, open && styles.sidebarOpen, collapsed && styles.sidebarRail)} aria-label="Bilah samping">
      <Link to="/dashboard" className={styles.brand} onClick={onNavigate}>
        <Monogram />
        <span className={styles.brandText}>
          <span className={styles.brandName}>NIRMALA</span>
          <span className={styles.brandTagline}>Reviu RKA Pra-DIPA</span>
        </span>
      </Link>

      <CyclePicker collapsed={collapsed} />

      <nav ref={navRef} aria-label="Navigasi utama" className={styles.nav}>
        {groups.map((group) => (
          <div key={group.label} role="group" aria-label={group.label} className={styles.navGroup}>
            <p className={styles.navHeading} aria-hidden="true">
              {group.label}
            </p>
            {group.items.map((item) => {
              const count = item.badge && navCounts ? navCounts[item.badge.key] : null;
              return (
                <NavLink key={item.to} to={item.to} className={styles.navItem} title={collapsed ? item.label : undefined} onClick={onNavigate}>
                  <item.icon size={16} aria-hidden="true" className={styles.navIcon} />
                  <span className={styles.navLabel}>{item.label}</span>
                  {count !== null && count > 0 && (
                    <span className={cn(styles.navCount, "num")}>
                      {count}
                      <span className="sr-only"> {item.badge?.note}</span>
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={styles.footer}>
        <ThemeControl theme={theme} onTheme={setTheme} />
        <div className={styles.user} title={collapsed ? identity : undefined}>
          <span className={styles.avatar} aria-hidden="true">
            {initials(user.name)}
          </span>
          <span className={styles.userText}>
            <span className={styles.userName}>{user.name}</span>
            <span className={styles.userRole}>
              {ROLE_LABEL[user.role]}
              {unit}
            </span>
          </span>
          <IconButton icon={LogOut} label="Keluar" onClick={onLogout} className={styles.logout} />
        </div>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------- Needs-action menu */

/** Tindakan saya: bell + "Perlu tindakan" + count badge; opens the list from GET /needs-action. */
function NeedsActionMenu() {
  const { count, items, failed, loading, refresh } = useNeedsAction();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector("button")?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className={styles.needs}
      ref={rootRef}
      onBlur={(event) => {
        // Keyboard: Tab out of the popover closes it. Mouse: handled by the pointer listener.
        if (open && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={styles.needsButton}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (!open) void refresh();
          setOpen(!open);
        }}
      >
        <Bell size={14} aria-hidden="true" />
        <span>Perlu tindakan</span>
        {count !== null && count > 0 && (
          <span className={cn(styles.needsCount, "num")}>
            {count}
            <span className="sr-only"> tindakan</span>
          </span>
        )}
      </button>
      {open && (
        <div id={panelId} className={styles.needsPanel}>
          {failed ? (
            <p className={styles.needsEmpty}>Daftar belum dapat dimuat. Coba lagi sebentar lagi.</p>
          ) : loading && items.length === 0 ? (
            <p className={styles.needsEmpty}>Memuat…</p>
          ) : items.length === 0 ? (
            <p className={styles.needsEmpty}>Tidak ada yang perlu ditindaklanjuti saat ini.</p>
          ) : (
            <ul className={styles.needsList}>
              {items.map((item) => (
                <li key={`${item.href}-${item.label}`}>
                  <Link to={item.href} className={styles.needsItem}>
                    <span>{item.label}</span>
                    <span className={cn(styles.needsItemCount, "num")}>{item.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- AppShell */

const SIDEBAR_KEY = "nirmala.sidebar";

export interface AppShellProps {
  user: AuthUser;
  /** Screen name for the default breadcrumb tail. */
  title: string;
  children: ReactNode;
}

/**
 * Shell: Sidebar (role based navigation, cycle picker, user footer) + Header (breadcrumb, Perlu tindakan)
 * + content. Desktop first (>= 1024 px); below that the sidebar becomes a drawer.
 */
export function AppShell({ user, title, children }: AppShellProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const override = useBreadcrumbOverride();
  const [drawer, setDrawer] = useState(false);
  // Desktop only: the 56 px icon rail. The drawer below 1024 px always shows the full sidebar (CSS ignores this flag there).
  const [collapsed, setCollapsed] = useState(() => readStorage(SIDEBAR_KEY) === "collapsed");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  const firstRender = useRef(true);

  // Single-page navigation: move focus to <main> so keyboard and screen reader users start at the new page.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  useEffect(() => setDrawer(false), [location.pathname]);

  // Drawer (below 1024 px): move focus in when it opens, close on Escape and hand focus back to the menu button.
  useEffect(() => {
    if (!drawer) return;
    document.querySelector<HTMLElement>("#app-sidebar a[href], #app-sidebar select, #app-sidebar button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        restoreFocus.current = true;
        setDrawer(false);
      }
    }
    document.addEventListener("keydown", onKey);
    // The page behind the drawer must not scroll while it is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawer]);

  // Runs after the page behind the drawer is no longer inert, otherwise the focus call is ignored.
  useEffect(() => {
    if (!drawer && restoreFocus.current) {
      restoreFocus.current = false;
      menuButtonRef.current?.focus();
    }
  }, [drawer]);

  const crumbs = useMemo<BreadcrumbItem[]>(() => {
    if (override) return override;
    const nav = findNav(location.pathname);
    const items: BreadcrumbItem[] = [];
    if (nav) items.push({ label: nav.group.label });
    // On a nav root the page title equals the nav label; on a detail page keep the list as a link.
    if (nav && location.pathname !== nav.item.to) items.push({ label: nav.item.label, to: nav.item.to });
    items.push({ label: title });
    return items;
  }, [override, location.pathname, title]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    writeStorage(SIDEBAR_KEY, next ? "collapsed" : null);
  }

  async function onLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className={styles.shell}>
      <a href="#main" className="skip-link">
        Lewati ke konten
      </a>
      <Sidebar user={user} open={drawer} collapsed={collapsed} onNavigate={() => setDrawer(false)} onLogout={onLogout} />
      {drawer && <div
          className={styles.scrim}
          onClick={() => {
            restoreFocus.current = true;
            setDrawer(false);
          }}
          aria-hidden="true"
        />}
      {/* While the drawer is open the page behind it is inert, so Tab stays in the drawer. */}
      <div className={styles.main} inert={drawer || undefined}>
        <header className={styles.header}>
          <div className={styles.headerStart}>
            <IconButton
              icon={collapsed ? PanelLeftOpen : PanelLeftClose}
              label={collapsed ? "Perluas bilah samping" : "Ciutkan bilah samping"}
              className={styles.collapseButton}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar"
              onClick={toggleCollapsed}
            />
            <IconButton
              ref={menuButtonRef}
              icon={Menu}
              label="Buka navigasi"
              className={styles.menuButton}
              aria-expanded={drawer}
              aria-controls="app-sidebar"
              onClick={() => setDrawer(true)}
            />
            <Breadcrumb items={crumbs} />
          </div>
          <NeedsActionMenu />
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
