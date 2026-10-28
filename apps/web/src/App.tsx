import { Activity, ArrowRight, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { PRODUCT_NAME, PRODUCT_SUBTITLE } from "@nirmala/shared";

function App() {
  return (
    <main className="app-shell">
      <section className="hero-panel" aria-labelledby="product-title">
        <div className="brand-mark" aria-hidden="true">N</div>
        <p className="eyebrow">Budget Review Platform</p>
        <h1 id="product-title">{PRODUCT_NAME}</h1>
        <p className="tagline">Membebaskan Anggaran Pembangunan dari Noda Inefisiensi.</p>
        <p className="hero-copy">{PRODUCT_SUBTITLE} untuk membantu reviewer memprioritaskan pemeriksaan, mencatat keputusan, dan memantau tindak lanjut secara tertelusur.</p>
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
          <div><Activity size={18} /><span>Cookie session authentication</span><strong>Berikutnya</strong></div>
        </div>
        <p className="notice">Tahap ini adalah fondasi teknis. Data workflow, database migration, dan autentikasi penuh akan dibangun pada tahap berikutnya.</p>
      </section>
    </main>
  );
}

export default App;
