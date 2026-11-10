import type { RiskConfigParams, RiskConfigWeights } from "../schema.js";

/** Eselon I fiktif untuk demo. Data asli tidak pernah di-seed dari sini. */
export const ORGANIZATION_UNIT_SEEDS = [
  { id: "org_90001", code: "90001", shortName: "DJCA", name: "Direktorat Jenderal Contoh A (fiktif)" },
  { id: "org_90002", code: "90002", shortName: "DJCB", name: "Direktorat Jenderal Contoh B (fiktif)" }
] as const;

/** Daftar awal akun BAS yang dipakai aturan dan faktor skor. Lengkapi dari `r_akun` lewat skrip impor lokal. */
export const ACCOUNT_SEEDS = [
  { code: "521111", name: "Belanja Keperluan Perkantoran" },
  { code: "521119", name: "Belanja Barang Operasional Lainnya" },
  { code: "521211", name: "Belanja Bahan" },
  { code: "521213", name: "Belanja Honor Output Kegiatan" },
  { code: "521811", name: "Belanja Barang Persediaan Barang Konsumsi" },
  { code: "522191", name: "Belanja Jasa Lainnya" },
  { code: "524111", name: "Belanja Perjalanan Dinas Biasa" },
  { code: "524113", name: "Belanja Perjalanan Dinas Dalam Kota" },
  { code: "524114", name: "Belanja Perjalanan Dinas Paket Meeting Dalam Kota" },
  { code: "524119", name: "Belanja Perjalanan Dinas Paket Meeting Luar Kota" },
  { code: "526113", name: "Belanja Gedung dan Bangunan untuk Diserahkan kepada Masyarakat/Pemda" },
  { code: "532111", name: "Belanja Modal Peralatan dan Mesin" },
  { code: "533111", name: "Belanja Modal Gedung dan Bangunan" }
] as const;

export const DISMISS_REASON_SEEDS = [
  { code: "harga_wajar_lokasi", label: "Harga wajar karena lokasi" },
  { code: "akun_sudah_tepat", label: "Akun sudah tepat" },
  { code: "ada_dasar_hukum", label: "Sudah ada dasar hukum" },
  { code: "esensial_fungsi_utama", label: "Item esensial untuk fungsi utama" },
  { code: "data_tidak_lengkap", label: "Data tidak lengkap / salah impor" },
  { code: "lainnya", label: "Lainnya" }
] as const;

/** Bobot awal = hipotesis (rule-catalog.md §4); skor akun rawan adalah nilai awal yang bisa dikonfigurasi. */
export const DEFAULT_WEIGHTS: RiskConfigWeights = { price_vs_peer: 30, risky_account: 20, satker_history: 20, description_quality: 15, change_from_previous: 15 };
export const DEFAULT_THRESHOLDS = { medium: 35, high: 70 };
export const DEFAULT_RISK_PARAMS: RiskConfigParams = {
  riskyAccounts: { "524111": 70, "524113": 70, "524114": 80, "524119": 80, "521213": 70, "521211": 50, "521811": 50 },
  packageThreshold: 100_000_000,
  peerMinSatker: 5
};

export const DEMO_USER_SEEDS = [
  { id: "usr_reviewer", username: "reviewer.demo", displayName: "Rani Reviewer", role: "reviewer", password: "Review123!", scope: ["org_90001"] },
  { id: "usr_uki", username: "uki.demo", displayName: "Umar UKI", role: "uki", password: "Uki12345!", scope: ["org_90001"] },
  { id: "usr_leader", username: "pimpinan.demo", displayName: "Pandu Pimpinan", role: "leader", password: "Pimpin123!", scope: [] },
  { id: "usr_admin", username: "admin.demo", displayName: "Ayu Admin", role: "admin", password: "Admin123!", scope: [] }
] as const;
