import { Activity, ArrowRight, LogOut, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import type { AuthResponse, SessionUser } from "@nirmala/shared";
import { RiskItemDetail, RiskTriage } from "./RiskTriage";

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
      </section>
      <section className="status-panel" aria-label="Status fondasi aplikasi">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Initial foundation</p>
            <h2>Fondasi aplikasi siap dikembangkan</h2>
          </div>
          <ShieldCheck className="status-icon" size={28} />
        </div>
        <div className="status-list">
          <div><Activity size={18} /><span>React + Vite frontend</span><strong>Siap</strong></div>
          <div><Activity size={18} /><span>Hono API service</span><strong>Siap</strong></div>
          <div><Activity size={18} /><span>Shared TypeScript contracts</span><strong>Siap</strong></div>
          <div><Activity size={18} /><span>Cookie session authentication</span><strong>Aktif</strong></div>
        </div>
        <p className="notice">Fondasi data dan autentikasi demo telah aktif. Workflow reviu, CHR, dan Smart Tracker akan dibangun pada tahap berikutnya.</p>
      </section>
    </main>
  );
}

function Login({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget); const result = await fetch("/api/auth/login", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) }); const data = await result.json(); setBusy(false); if (!result.ok) return setError(data.error ?? "Tidak dapat masuk."); onLogin((data as AuthResponse).user); navigate("/dashboard"); }
  return <main className="auth-page"><form className="login-card" onSubmit={submit}><p className="eyebrow">NIRMALA</p><h1>Masuk ke aplikasi</h1><p>Gunakan akun demo lokal untuk menguji peran dan akses.</p><label>Username<input name="username" required autoComplete="username" placeholder="reviewer.demo" /></label><label>Password<input name="password" required type="password" autoComplete="current-password" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="login-button" disabled={busy}>{busy ? "Memproses…" : "Masuk"}</button><p className="demo-hint">Reviewer: reviewer.demo / Review123!</p><Link to="/">Kembali ke beranda</Link></form></main>;
}

function Dashboard({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [metrics, setMetrics] = useState<{ totalItems: number; highRisk: number } | null>(null); const navigate = useNavigate();
  useEffect(() => { fetch("/api/dashboard/bootstrap", { credentials: "include" }).then((response) => response.json()).then((data) => setMetrics(data.metrics)).catch(() => setMetrics(null)); }, []);
  async function logout() { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); onLogout(); navigate("/login"); }
  return <main className="dashboard"><header><div><p className="eyebrow">NIRMALA · Dashboard</p><h1>Selamat datang, {user.name}</h1><p>Peran aktif: {user.role}</p></div><button className="logout" onClick={logout}><LogOut size={16} /> Keluar</button></header><section className="kpis"><article><span>Total Item RKA</span><strong>{metrics?.totalItems ?? "—"}</strong></article><article><span>Item High Risk</span><strong>{metrics?.highRisk ?? "—"}</strong></article></section><Link className="dashboard-link" to="/risk-triage">Buka Risk Triage <ArrowRight size={16} /></Link><p className="notice">Data dashboard ini berasal dari seed sintetis lokal. Workflow CHR akan ditambahkan pada tahap berikutnya.</p></main>;
}

function App() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  useEffect(() => { fetch("/api/auth/me", { credentials: "include" }).then((result) => result.json()).then((data) => setUser(data.user ?? null)).catch(() => setUser(null)); }, []);
  if (user === undefined) return <main className="loading">Memeriksa sesi…</main>;
  return <Routes><Route path="/" element={<Landing />} /><Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login onLogin={setUser} />} /><Route path="/dashboard" element={user ? <Dashboard user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" replace />} /><Route path="/risk-triage" element={user ? <RiskTriage /> : <Navigate to="/login" replace />} /><Route path="/risk-triage/:id" element={user ? <RiskItemDetail /> : <Navigate to="/login" replace />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}

export default App;
