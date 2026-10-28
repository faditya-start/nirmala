import { ArrowLeft, Save } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

type User = { id: string; username: string; displayName: string; role: string };
const defaultWeights = { price_variance: 35, bas_alignment: 25, historical_similarity: 20, description_quality: 10, revision_pattern: 10 };

export function AdminSettings() {
  const [config, setConfig] = useState({ version: "rules-v2", weights: defaultWeights, thresholds: { medium: 35, high: 70 } }); const [notice, setNotice] = useState("");
  useEffect(() => { fetch("/api/risk-config", { credentials: "include" }).then((response) => response.json()).then((body) => { if (body.config) setConfig(body.config); }); }, []);
  async function save(event: FormEvent) { event.preventDefault(); const response = await fetch("/api/risk-config", { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(config) }); const body = await response.json(); setNotice(response.ok ? "Konfigurasi tersimpan dan diaudit." : body.error ?? "Konfigurasi tidak valid."); }
  return <main className="workspace"><Link to="/dashboard" className="back-link"><ArrowLeft size={16} /> Dashboard</Link><p className="eyebrow">Admin · Risk Configuration</p><h1>Konfigurasi risk scoring</h1><p className="page-copy">Bobot ini hanya untuk prioritas pemeriksaan demo, bukan standar resmi instansi.</p><form className="assessment config-form" onSubmit={save}><label>Versi konfigurasi<input value={config.version} onChange={(event) => setConfig({ ...config, version: event.target.value })} /></label>{Object.keys(config.weights).map((key) => <label key={key}>{key}<input type="number" min="0" value={config.weights[key as keyof typeof config.weights]} onChange={(event) => setConfig({ ...config, weights: { ...config.weights, [key]: Number(event.target.value) } })} /></label>)}<label>Ambang Medium<input type="number" value={config.thresholds.medium} onChange={(event) => setConfig({ ...config, thresholds: { ...config.thresholds, medium: Number(event.target.value) } })} /></label><label>Ambang High<input type="number" value={config.thresholds.high} onChange={(event) => setConfig({ ...config, thresholds: { ...config.thresholds, high: Number(event.target.value) } })} /></label><button className="confirm" type="submit"><Save size={16} /> Simpan konfigurasi</button>{notice && <p className="notice">{notice}</p>}</form></main>;
}

export function UsersAdmin() {
  const [users, setUsers] = useState<User[]>([]); const [notice, setNotice] = useState("");
  async function load() { const response = await fetch("/api/users", { credentials: "include" }); const body = await response.json(); if (response.ok) setUsers(body.users); else setNotice(body.error ?? "Tidak dapat memuat user."); }
  useEffect(() => { void load(); }, []);
  async function changeRole(id: string, role: string) { const response = await fetch(`/api/users/${id}/role`, { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ role }) }); const body = await response.json(); setNotice(response.ok ? "Role diperbarui dan diaudit." : body.error ?? "Role tidak dapat diperbarui."); await load(); }
  return <main className="workspace"><Link to="/dashboard" className="back-link"><ArrowLeft size={16} /> Dashboard</Link><p className="eyebrow">Admin · User Management</p><h1>Pengguna dan role</h1><p className="page-copy">Perubahan role membutuhkan akses Admin dan dicatat pada audit log.</p>{notice && <p className="notice">{notice}</p>}<div className="table-wrap"><table><thead><tr><th>Username</th><th>Nama</th><th>Role</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.username}</td><td>{user.displayName}</td><td><select value={user.role} onChange={(event) => void changeRole(user.id, event.target.value)}><option value="reviewer">Reviewer</option><option value="leader">Pimpinan</option><option value="admin">Admin</option></select></td></tr>)}</tbody></table></div></main>;
}
