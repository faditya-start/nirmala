import { Activity, ArrowRight, ClipboardCheck, FileBarChart, History, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, SlidersHorizontal, Users, X } from "lucide-react";
import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import type { AuthResponse, SessionUser } from "@nirmala/shared";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RiskItemDetail, RiskTriage } from "./RiskTriage";
import { ChrEditor } from "./ChrEditor";
import { Tracker, TrackerDetail } from "./Tracker";
import { AuditLogs, Reports } from "./Reports";
import { Transparency } from "./Transparency";
import { AdminSettings, UsersAdmin } from "./Admin";

const roleLabels: Record<SessionUser["role"], string> = { reviewer: "Reviewer", uki: "PIC UKI", leader: "Pimpinan", admin: "Administrator" };

function Landing() {
  return (
    <main className="app-shell">
      <section className="hero-panel" aria-labelledby="product-title">
        <div className="brand-mark" aria-hidden="true">N</div>
        <p className="eyebrow">Budget Review Platform</p>
        <h1 id="product-title">NIRMALA</h1>
        <p className="tagline">Membebaskan Anggaran Pembangunan dari Noda Inefisiensi.</p>
        <p className="hero-copy">Budget Review &amp; Follow-up Intelligence untuk membantu reviewer memprioritaskan pemeriksaan, mencatat keputusan, dan memantau tindak lanjut secara tertelusur.</p>
        <Link className="primary-button" to="/login">
          Masuk ke aplikasi <ArrowRight size={18} />
        </Link>
        <Link className="public-home-link" to="/transparansi">Lihat transparansi publik demo</Link>
      </section>
      <section className="status-panel" aria-label="Alur kerja NIRMALA">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Alur kerja reviu</p>
            <h2>Dari catatan sampai bukti perbaikan</h2>
          </div>
          <ShieldCheck className="status-icon" size={28} />
        </div>
        <div className="status-list">
          <div><Activity size={18} /><span>Risk Triage: item RKA diurutkan dengan aturan dan skor yang bisa dijelaskan</span></div>
          <div><Activity size={18} /><span>CHR: catatan reviu, terkunci saat diterbitkan</span></div>
          <div><Activity size={18} /><span>Smart Tracker: tindak lanjut dipantau sampai reviewer menutupnya</span></div>
          <div><Activity size={18} /><span>Audit log: setiap keputusan tercatat</span></div>
        </div>
        <p className="notice">Skor hanya membantu memprioritaskan peninjauan; keputusan tetap di tangan reviewer. Data pada demo ini sintetis.</p>
      </section>
    </main>
  );
}

function Login({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget); const result = await fetch("/api/auth/login", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) }); const data = await result.json(); setBusy(false); if (!result.ok) return setError(data.error ?? "Tidak dapat masuk."); onLogin((data as AuthResponse).user); navigate("/dashboard"); }
  return <main className="auth-page"><form className="login-card" onSubmit={submit}><p className="eyebrow">NIRMALA</p><h1>Masuk ke aplikasi</h1><p>Gunakan akun demo lokal untuk menguji peran dan akses.</p><label>Username<input name="username" required autoComplete="username" placeholder="reviewer.demo" /></label><label>Password<input name="password" required type="password" autoComplete="current-password" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="login-button" disabled={busy}>{busy ? "Memproses…" : "Masuk"}</button><p className="demo-hint">Reviewer: reviewer.demo / Review123!</p><Link to="/">Kembali ke beranda</Link></form></main>;
}

function InternalShell({ user, onLogout, children }: { user: SessionUser; onLogout: () => void; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const navigation = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/risk-triage", label: "Risk Triage", icon: SlidersHorizontal },
    { to: "/tracker", label: "Smart Tracker", icon: ClipboardCheck },
    { to: "/reports", label: "Laporan", icon: FileBarChart },
    ...(user.role === "admin" ? [
      { to: "/audit-logs", label: "Audit Log", icon: History },
      { to: "/admin/risk-config", label: "Risk Configuration", icon: Settings },
      { to: "/admin/users", label: "Pengguna & Role", icon: Users }
    ] : [])
  ];
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    onLogout();
    navigate("/login");
  }
  return <div className={`internal-shell${collapsed ? " shell-collapsed" : ""}${mobileOpen ? " mobile-nav-open" : ""}`}>
    <button className="mobile-menu-button" aria-label="Buka navigasi" onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
    <aside className="sidebar">
      <div className="sidebar-brand"><div className="sidebar-mark">N</div><div className="sidebar-brand-copy"><strong>NIRMALA</strong><span>Budget Review &amp; Follow-up Intelligence</span></div><button className="sidebar-collapse" aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <Menu size={18} /> : <X size={18} />}</button></div>
      <div className="sidebar-context"><span className="sidebar-context-label">Ruang kerja</span><strong>Reviu Anggaran</strong></div>
      <nav className="sidebar-nav" aria-label="Navigasi utama">{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === "/dashboard"} onClick={() => setMobileOpen(false)} className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-footer"><div className="sidebar-user"><div className="avatar">{user.name.slice(0, 1)}</div><div className="sidebar-user-copy"><strong>{user.name}</strong><span>{roleLabels[user.role]}</span></div></div><button className="sidebar-logout" onClick={() => void logout()}><LogOut size={17} /><span>Keluar</span></button></div>
    </aside>
    <button className="sidebar-overlay" aria-label="Tutup navigasi" onClick={() => setMobileOpen(false)} />
    <div className="internal-content">{children}</div>
  </div>;
}

function Dashboard({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [data, setData] = useState<{ metrics: Record<string, number>; riskDistribution: { category: string; count: number }[]; reviewProgress: { unit: string; total: number; evaluated: number }[]; followUpProgress: { status: string; count: number }[] } | null>(null); const navigate = useNavigate();
  useEffect(() => { fetch("/api/dashboard/summary", { credentials: "include" }).then((response) => response.ok ? response.json() : null).then(setData).catch(() => setData(null)); }, []);
  async function logout() { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); onLogout(); navigate("/login"); }
  const metricCards = [["totalItems", "Total Item RKA"], ["highRisk", "Item High Risk"], ["evaluatedItems", "Sudah Dievaluasi"], ["issuedChr", "CHR Diterbitkan"], ["openFollowUps", "Tindak Lanjut Terbuka"], ["resolvedFollowUps", "Tindak Lanjut Selesai"]];
  const colors = { high: "#dc2626", medium: "#d97706", low: "#16a34a" };
  return <main className="dashboard"><header><div><p className="eyebrow">NIRMALA · Dashboard</p><h1>Selamat datang, {user.name}</h1><p>Peran aktif: {user.role}</p></div><button className="logout" onClick={logout}><LogOut size={16} /> Keluar</button></header><section className="kpis">{metricCards.map(([key, label]) => <article key={key}><span>{label}</span><strong>{data?.metrics[key] ?? "—"}</strong></article>)}</section>{data && <section className="dashboard-charts"><article className="assessment chart-card"><h2>Distribusi risiko</h2><ResponsiveContainer width="100%" height={240}><PieChart><Pie data={data.riskDistribution} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={80} label>{data.riskDistribution.map((row) => <Cell key={row.category} fill={colors[row.category as keyof typeof colors] ?? "#0284c7"} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></article><article className="assessment chart-card"><h2>Progres per satuan kerja</h2><ResponsiveContainer width="100%" height={240}><BarChart data={data.reviewProgress}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="unit" hide /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="total" name="Total item" fill="#94a3b8" /><Bar dataKey="evaluated" name="Dievaluasi" fill="#0284c7" /></BarChart></ResponsiveContainer></article></section>}<div className="dashboard-actions"><Link className="dashboard-link" to="/risk-triage">Buka Risk Triage <ArrowRight size={16} /></Link><Link className="dashboard-link" to="/tracker">Buka Smart Tracker <ArrowRight size={16} /></Link><Link className="dashboard-link secondary-link" to="/reports">Lihat Laporan <ArrowRight size={16} /></Link>{user.role === "admin" && <><Link className="dashboard-link secondary-link" to="/audit-logs">Audit Log <ArrowRight size={16} /></Link><Link className="dashboard-link secondary-link" to="/admin/risk-config">Risk Config <ArrowRight size={16} /></Link><Link className="dashboard-link secondary-link" to="/admin/users">Users <ArrowRight size={16} /></Link></>}</div><p className="notice">Data dashboard pada demo ini berasal dari seed sintetis lokal.</p></main>;
}

function App() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  useEffect(() => { fetch("/api/auth/me", { credentials: "include" }).then((result) => result.json()).then((data) => setUser(data.user ?? null)).catch(() => setUser(null)); }, []);
  if (user === undefined) return <main className="loading">Memeriksa sesi…</main>;
  const protectedPage = (page: ReactNode) => user ? <InternalShell user={user} onLogout={() => setUser(null)}>{page}</InternalShell> : <Navigate to="/login" replace />;
  return <Routes><Route path="/" element={<Landing />} /><Route path="/transparansi" element={<Transparency />} /><Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login onLogin={setUser} />} /><Route path="/dashboard" element={protectedPage(<Dashboard user={user as SessionUser} onLogout={() => setUser(null)} />)} /><Route path="/reports" element={protectedPage(<Reports />)} /><Route path="/audit-logs" element={user?.role === "admin" ? protectedPage(<AuditLogs />) : <Navigate to="/dashboard" replace />} /><Route path="/admin/risk-config" element={user?.role === "admin" ? protectedPage(<AdminSettings />) : <Navigate to="/dashboard" replace />} /><Route path="/admin/users" element={user?.role === "admin" ? protectedPage(<UsersAdmin />) : <Navigate to="/dashboard" replace />} /><Route path="/risk-triage" element={protectedPage(<RiskTriage />)} /><Route path="/risk-triage/:id" element={protectedPage(<RiskItemDetail />)} /><Route path="/chr/:id" element={protectedPage(<ChrEditor />)} /><Route path="/tracker" element={protectedPage(<Tracker />)} /><Route path="/tracker/:id" element={protectedPage(<TrackerDetail />)} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}

export default App;
