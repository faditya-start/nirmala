import { ArrowLeft, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Report = { metrics: Record<string, number>; riskDistribution: { category: string; count: number }[]; followUpProgress: { status: string; count: number }[]; definitions: Record<string, string> };
type Log = { action: string; entityType: string; entityId: string; detail: string; actor: string; createdAt: number };
const labels: Record<string, string> = { totalItems: "Total item RKA", highRisk: "Item high risk", evaluatedItems: "Sudah dievaluasi", issuedChr: "CHR diterbitkan", openFollowUps: "Tindak lanjut terbuka", resolvedFollowUps: "Tindak lanjut selesai", falsePositives: "False positive" };
const date = (value: number) => new Date(value).toLocaleString("id-ID");

export function Reports() {
  const [data, setData] = useState<Report | null>(null); const [error, setError] = useState("");
  useEffect(() => { fetch("/api/reports/summary", { credentials: "include" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body); }).catch((reason: Error) => setError(reason.message)); }, []);
  function download() { window.location.href = "/api/reports/export"; }
  return <main className="workspace"><Link to="/dashboard" className="back-link"><ArrowLeft size={16} /> Dashboard</Link><div className="page-heading"><div><p className="eyebrow">Reporting</p><h1>Laporan proses reviu</h1><p className="page-copy">Ringkasan ini dihitung dari data workflow internal yang tersimpan. Ekspor mengikuti otorisasi pengguna yang sedang login.</p></div><button className="secondary-button" onClick={download}><Download size={16} /> Ekspor CSV</button></div>{error && <p className="form-error">{error}</p>}{data && <><section className="report-kpis">{Object.entries(data.metrics).map(([key, value]) => <article key={key}><span>{labels[key] ?? key}</span><strong>{value}</strong></article>)}</section><section className="report-columns"><article className="assessment"><h2>Distribusi risiko</h2>{data.riskDistribution.map((row) => <div className="metric-row" key={row.category}><span>{row.category}</span><strong>{row.count}</strong></div>)}</article><article className="assessment"><h2>Status tindak lanjut</h2>{data.followUpProgress.map((row) => <div className="metric-row" key={row.status}><span>{row.status}</span><strong>{row.count}</strong></div>)}</article></section><section className="assessment"><h2>Definisi metrik</h2><ul>{Object.entries(data.definitions).map(([key, value]) => <li key={key}><strong>{labels[key] ?? key}:</strong> {value}</li>)}</ul></section></>}</main>;
}

export function AuditLogs() {
  const [logs, setLogs] = useState<Log[]>([]); const [error, setError] = useState("");
  useEffect(() => { fetch("/api/audit-logs", { credentials: "include" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setLogs(body.logs); }).catch((reason: Error) => setError(reason.message)); }, []);
  return <main className="workspace"><Link to="/dashboard" className="back-link"><ArrowLeft size={16} /> Dashboard</Link><p className="eyebrow">Audit Log · Admin</p><h1>Riwayat aktivitas</h1><p className="page-copy">Catatan ini bersifat read-only dari halaman aplikasi. Password, token, dan secret tidak disimpan di dalamnya.</p>{error && <p className="form-error">{error}</p>}<div className="table-wrap"><table><thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Entitas</th><th>Ringkasan</th></tr></thead><tbody>{logs.map((log, index) => <tr key={`${log.createdAt}-${index}`}><td>{date(log.createdAt)}</td><td>{log.actor}</td><td>{log.action}</td><td>{log.entityType} · {log.entityId}</td><td>{log.detail}</td></tr>)}</tbody></table></div></main>;
}
