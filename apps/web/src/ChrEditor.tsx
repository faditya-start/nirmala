import { ArrowLeft, Save } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

type Chr = { id: string; documentNumber: string | null; title: string; findings: string; recommendation: string; status: "draft" | "issued"; itemDescription: string; basCode: string; createdBy: string };

export function ChrEditor() {
  const { id } = useParams(); const [chr, setChr] = useState<Chr | null>(null); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  async function load() { const response = await fetch(`/api/chr/${id}`, { credentials: "include" }); if (response.ok) setChr((await response.json()).chr); else setNotice("CHR tidak ditemukan atau Anda tidak memiliki akses."); }
  useEffect(() => { void load(); }, [id]);
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!chr) return; setBusy(true); const response = await fetch(`/api/chr/${id}`, { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: chr.title, findings: chr.findings, recommendation: chr.recommendation }) }); const data = await response.json(); setBusy(false); if (!response.ok) return setNotice(data.error ?? "Draft tidak dapat disimpan."); setChr(data.chr); setNotice("Draft dan versi CHR tersimpan."); }
  async function issue() { if (!chr || !confirm("Terbitkan CHR ini? Dokumen yang terbit tidak dapat diedit.")) return; setBusy(true); const response = await fetch(`/api/chr/${id}/issue`, { method: "POST", credentials: "include" }); const data = await response.json(); setBusy(false); if (!response.ok) return setNotice(data.error ?? "CHR tidak dapat diterbitkan."); setChr(data.chr); setNotice("CHR diterbitkan dan dikunci."); }
  if (!chr) return <main className="workspace">{notice || "Memuat CHR…"}</main>;
  const locked = chr.status === "issued";
  return <main className="workspace"><Link to="/risk-triage" className="back-link"><ArrowLeft size={16} /> Risk Triage</Link><p className="eyebrow">Catatan Hasil Reviu</p><h1>{locked ? chr.documentNumber : "Draft CHR"}</h1><p className="page-copy">Item: {chr.itemDescription} · {chr.basCode}</p><form className="chr-form" onSubmit={save}><label>Judul<input disabled={locked} value={chr.title} onChange={(event) => setChr({ ...chr, title: event.target.value })} /></label><label>Temuan<textarea disabled={locked} value={chr.findings} onChange={(event) => setChr({ ...chr, findings: event.target.value })} /></label><label>Rekomendasi<input disabled={locked} value={chr.recommendation} onChange={(event) => setChr({ ...chr, recommendation: event.target.value })} /></label>{notice && <p className="notice">{notice}</p>}{!locked && <div className="decision-actions"><button type="submit" className="confirm" disabled={busy}><Save size={16} /> Simpan Draft</button><button type="button" disabled={busy} onClick={() => void issue()}>Terbitkan CHR</button></div>}{locked && <div className="decision-actions"><Link className="confirm" to="/tracker">Buka Smart Tracker</Link></div>}</form></main>;
}
