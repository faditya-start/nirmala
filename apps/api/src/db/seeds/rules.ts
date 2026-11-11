import type { Expectation, NoteCategory, RuleKind } from "@nirmala/shared";
import type { RuleParams } from "../schema.js";

/**
 * Katalog aturan MVP (docs/rule-catalog.md §3). Isi masih perlu validasi auditor (K2).
 * Parameter per jenis:
 * - keyword: `all` (semua regex harus cocok pada uraian), `none?` (tidak boleh cocok), `akunPrefix?`
 * - keyword_wrong_account: `include`, `exclude?` (regex), `akunSalah` (prefix), `akunSalahKecuali?`, `akunBenar`, `minUnitPrice?`
 * - value_check: `condition`
 * - blokir_history: `onlyRevision`
 */
export interface RuleSeed {
  code: string;
  name: string;
  category: NoteCategory;
  kind: RuleKind;
  params: RuleParams;
  reasonTemplate: string;
  source: string;
  defaultExpectation: Expectation;
  validationNote: string | null;
}

export const RULE_SEEDS: RuleSeed[] = [
  {
    code: "R01", name: "Pakaian / seragam hari besar", category: "EFISIENSI", kind: "keyword",
    params: { all: ["pakaian|seragam|kaos|batik", "17 agustus|kemerdekaan|hari bakti|hari bhakti|harbak|hari besar|\\bhut\\b"] },
    reasonTemplate: "Alokasi pakaian hari besar tidak memiliki standar penetapan biaya dan tidak esensial dalam mendukung fungsi utama.",
    source: "Catatan inefisiensi SIPEKA; PMK SBM TA 2026; LHR Itjen atas RKA 2026",
    defaultExpectation: { type: "hapus_item" },
    validationNote: "Varian tanpa kata 'pakaian' lolos. Tanyakan apakah semua keperluan hari besar dilarang atau hanya pakaian."
  },
  {
    code: "R02", name: "Honor / jasa outsourcing satpam, pengemudi, kebersihan di luar 521111", category: "AKUN", kind: "keyword_wrong_account",
    params: { include: "satpam|pengamanan|pengemudi|sopir|kebersihan|cleaning|pramubakti|outsourc", akunSalah: ["522191", "521119", "521213"], akunBenar: "521111" },
    reasonTemplate: "Biaya tenaga outsourcing (satpam, pengemudi, kebersihan) menggunakan akun 521111 sesuai KEP-331/PB/2021 tentang Kodefikasi Segmen Akun pada BAS.",
    source: "Catatan ketepatan akun SIPEKA; catatan inefisiensi kategori akun",
    defaultExpectation: { type: "ganti_akun", to: "521111" },
    validationNote: null
  },
  {
    code: "R03", name: "Langganan internet / paket data di luar 521111", category: "AKUN", kind: "keyword_wrong_account",
    params: { include: "internet|paket data", akunSalah: ["52"], akunSalahKecuali: ["521111"], akunBenar: "521111" },
    reasonTemplate: "Langganan internet dan paket data untuk keperluan kantor menggunakan akun 521111.",
    source: "Catatan ketepatan akun SIPEKA",
    defaultExpectation: { type: "ganti_akun", to: "521111" },
    validationNote: "Tanyakan apakah internet untuk kegiatan lapangan dikecualikan; jika ya, tambahkan `exclude`."
  },
  {
    code: "R04", name: "Cetak kop surat / amplop / map di 521111", category: "AKUN", kind: "keyword_wrong_account",
    params: { include: "kop surat|amplop|cetak map|\\bmap\\b", akunSalah: ["521111"], akunBenar: "521211" },
    reasonTemplate: "Pencetakan kop surat, amplop, dan map menggunakan akun belanja bahan (521211) atau persediaan konsumsi (521811), bukan 521111.",
    source: "Catatan ketepatan akun SIPEKA",
    defaultExpectation: { type: "ganti_akun", to: "521211" },
    validationNote: "Reviewer dapat mengganti akun tujuan ke 521811."
  },
  {
    code: "R05", name: "Rehabilitasi / pembangunan sarana yang diserahkan ke masyarakat di akun belanja modal", category: "AKUN", kind: "keyword_wrong_account",
    params: { include: "madrasah|masjid|stadion|pesantren|gereja", akunSalah: ["53"], akunBenar: "526113" },
    reasonTemplate: "Sarana yang diserahkan kepada masyarakat/Pemda dianggarkan pada akun 526113, bukan belanja modal.",
    source: "Catatan ketepatan akun dan catatan lainnya SIPEKA",
    defaultExpectation: { type: "ganti_akun", to: "526113" },
    validationNote: "Item 'Sekolah Rakyat' di 533111 juga diberi catatan; pastikan apakah termasuk aset yang diserahkan."
  },
  {
    code: "R06", name: "Barang modal di akun belanja barang", category: "AKUN", kind: "keyword_wrong_account",
    params: {
      include: "laptop|notebook|komputer|\\bpc\\b|printer|kendaraan|mobil|sepeda motor|ac split|server",
      exclude: "pemeliharaan|sewa|servis|perbaikan|bbm|stnk|tinta|toner|suku cadang|jasa|pengemudi|sopir",
      akunSalah: ["52"], akunBenar: "532111", minUnitPrice: 1_000_000
    },
    reasonTemplate: "Barang yang memenuhi kriteria kapitalisasi BMN dianggarkan pada belanja modal peralatan dan mesin (532111), bukan belanja barang.",
    source: "Tema LHP BPK: kesalahan penganggaran belanja barang/modal",
    defaultExpectation: { type: "ganti_akun", to: "532111" },
    validationNote: "Terlalu luas tanpa batas kapitalisasi. `minUnitPrice` adalah nilai sementara dan belum divalidasi (K4). Jika masih >500 hit, nonaktifkan dan jadikan faktor skor."
  },
  {
    code: "R07", name: "Nilai tanpa volume", category: "EFISIENSI", kind: "value_check",
    params: { condition: "volume_zero_total_positive" },
    reasonTemplate: "Alokasi item tidak dirinci volumenya sehingga kebutuhan riil tidak dapat dinilai.",
    source: "Catatan inefisiensi SIPEKA ('tidak ada penjelasan rincian dan volume')",
    defaultExpectation: { type: "rinci_item" },
    validationNote: "Pola '1 paket / LS tanpa rincian' ditangani faktor skor F4, bukan aturan."
  },
  {
    code: "R08", name: "Item pernah diblokir DJA", category: "SATUAN_BIAYA", kind: "blokir_history",
    params: { onlyRevision: true },
    reasonTemplate: "Item ini pernah diblokir; agar dicek kembali kesesuaiannya dengan ketentuan standar biaya sebelum diajukan.",
    source: "Catatan inefisiensi SIPEKA ('telah di-blokir sebelumnya oleh DJA')",
    defaultExpectation: { type: "manual", instruction: "Periksa kesesuaian item dengan ketentuan standar biaya." },
    validationNote: "Aktif hanya di snapshot revisi (K1). Arti tiap KODE_BLOKIR perlu dikonfirmasi."
  }
];
