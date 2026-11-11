# MVP Scope, User Flow & Daftar Layar

Status: **dikunci** · 9 Nov 2026
Acuan produk: [concept-brief.md](concept-brief.md). Dokumen ini memotong brief menjadi MVP.
Terkait: [data-analysis.md](data-analysis.md) · [rule-catalog.md](rule-catalog.md) · [data-model.md](data-model.md) · [plan.md](plan.md)

## 1. Satu kalimat

NIRMALA MVP membantu reviewer menemukan item anggaran yang perlu dicatat dengan bantuan aturan dan skor yang bisa dijelaskan, lalu mengawal setiap catatan sampai versi anggaran berikutnya membuktikan bahwa item itu sudah diperbaiki, dan reviewer yang menutupnya.

## 2. Masuk MVP vs backlog

| Area | Masuk MVP | Backlog (didokumentasikan di plan.md) |
|---|---|---|
| Data masuk | Impor CSV format SIPEKA (`es1_<BAES1>_<tahun>.csv`) per eselon I sebagai snapshot "Awal" lalu "Revisi"; idempoten berdasarkan hash; diff baru/berubah/tetap/hilang | Adapter ADK, API SAKTI |
| Siklus | Siklus reviu = tahun anggaran + tahap (pagu / alokasi) + tenggat ADK + tanggal DIPA terbit | Fase Revisi POK (Fase 2 brief) |
| Deteksi | 8 aturan (R01–R08) + skor 5 faktor (F1–F5), semua bisa dijelaskan | LLM, embedding, lineage lintas tahun, carry-over, tabel SBM resmi |
| Triage | Daftar per eselon I / Satker, confirm / dismiss dengan kategori alasan | Kalibrasi bobot otomatis |
| CHR | Satu CHR per eselon I per tahap, berisi banyak catatan; kategori = 3 kategori SIPEKA + Lainnya; terbit → terkunci + versi; tampilan cetak | Checklist A–P Formulir H, tanggapan Itjen, ekspor DOCX |
| Catatan | Ekspektasi terstruktur: `ganti_akun`, `hapus_item`, `turunkan_nilai`, `rinci_item`, `manual` | Ekspektasi lain setelah melihat contoh CHR asli |
| Tracker | Cek otomatis saat revisi diimpor → Perlu Verifikasi → reviewer setujui / kembalikan; justifikasi; status Satker "siap diajukan" | Pemantauan setelah closed (Fase 2) |
| Peran | Reviewer, PIC UKI, Pimpinan, Admin; akses dibatasi per eselon I | Peran Satker, pembatasan per Satker, lapisan reviewer (Itjen / Biro) |
| Dashboard & laporan | Dashboard per siklus dan per eselon I, laporan metrik proses + CSV, validasi engine (kunci jawaban) | precision@N lintas tahun |
| Publik | Halaman transparansi dari agregat nyata (per eselon I × kategori), hanya untuk siklus yang DIPA-nya sudah terbit, eselon I kecil digabung | Tren antar tahun |
| Notifikasi | Badge / daftar "perlu tindakan" di dalam aplikasi | Email, WhatsApp |
| Infrastruktur | SQLite + Drizzle, server sendiri lewat Cloudflare Tunnel | PostgreSQL + pgvector |

## 3. Peran

| Peran | Siapa | Bisa melakukan | Melihat |
|---|---|---|---|
| **Reviewer** | Itjen / Biro PAKLN / Biro Keuangan | Impor snapshot, triage, confirm / dismiss, menulis dan menerbitkan CHR, verifikasi (setujui / kembalikan / terima justifikasi) | Eselon I yang ditugaskan |
| **PIC UKI** | Koordinator eselon I | Melihat progres per Satker, mengisi justifikasi atas nama Satker, mengisi tanggapan eselon I di CHR | Eselon I miliknya |
| **Pimpinan** | Irjen, Kepala Biro | Membaca dashboard dan laporan | Semua |
| **Admin** | Pengelola sistem | Pengguna, akses eselon I, katalog aturan, bobot skor, siklus, audit log | Semua |

## 4. User flow MVP

```
[Admin]    Buat siklus (TA 2026 · tahap alokasi · tenggat ADK)
[Reviewer] Impor CSV eselon I ──► snapshot v1 "Awal"
              │  aturan + skor dijalankan otomatis
              ▼
           Risk Triage (yang kena aturan di atas, lalu skor)
              │
              ├─ Dismiss → wajib pilih kategori alasan → selesai (masuk korpus)
              └─ Confirm → catatan Draf di CHR eselon I
                             (kategori, teks, ekspektasi)
              ▼
           Terbitkan CHR → dokumen terkunci, semua catatan → Menunggu Revisi
              │                      ▲
[UKI]      Pantau per Satker,        │ Kembalikan (alasan)
           isi justifikasi bila      │
           Satker tidak mengubah     │
              │                      │
           (Satker memperbaiki di SAKTI — di luar NIRMALA)
              ▼                      │
[Reviewer] Impor CSV revisi ──► snapshot v2 "Revisi"
              │  cek ekspektasi per catatan; item baru/berubah di-skor ulang
              ▼                      │
           Catatan → Perlu Verifikasi (bukti sebelum → sesudah)
              │                      │
           Reviewer: Setujui ─► Closed
                     Kembalikan ─────┘
              ▼
           Semua catatan Satker Closed → Satker "Siap diajukan"
           Semua catatan CHR Closed → CHR "Selesai"
```

### 4.1 Status catatan

Sumber status hanya catatan, sesuai brief.

| Status | Masuk ketika | Oleh |
|---|---|---|
| **Draf** | Reviewer mengonfirmasi flag | Reviewer |
| **Menunggu Revisi** | CHR diterbitkan, atau catatan dikembalikan | Reviewer |
| **Perlu Verifikasi** | Snapshot baru diimpor dan cek otomatis selesai | Sistem |
| **Dijustifikasi** | UKI mengisi alasan Satker tidak mengubah | PIC UKI |
| **Closed** | Reviewer menyetujui hasil cek atau menerima justifikasi | Reviewer |

Aturan keras: sistem **tidak pernah** menutup catatan sendiri. Hasil cek otomatis hanya usulan.

### 4.2 Hasil cek otomatis per jenis ekspektasi

| Ekspektasi | Terpenuhi jika (di snapshot baru) | Tampilan bukti |
|---|---|---|
| `ganti_akun → X` | Item padanan ada dan akunnya = X | akun lama → akun baru |
| `hapus_item` | Item padanan tidak ditemukan, atau total = 0 | "item tidak ada di revisi" |
| `turunkan_nilai` (harga satuan maks / total maks) | Nilai ≤ batas | nilai lama → nilai baru |
| `rinci_item` | Volume > 1 dan satuan bukan paket/LS, atau uraian berubah dan rincian `VOL_KEG_*` terisi | volume/satuan lama → baru |
| `manual` | Selalu "perlu dicek manual" | Uraian ekspektasi + nilai item terbaru |

Setiap hasil cek bernilai `terpenuhi`, `belum terpenuhi`, `data tidak cukup`, atau `item tidak ditemukan`.

## 5. Daftar layar (untuk Pencil)

Konvensi semua layar internal:
- Sidebar kiri: navigasi sesuai peran, pemilih **siklus aktif** di atas.
- Header berisi breadcrumb.
- Badge status memakai warna konsisten:
  - Draf: abu-abu
  - Menunggu Revisi: kuning
  - Perlu Verifikasi: biru
  - Dijustifikasi: ungu
  - Closed: hijau
  - Flag aturan: merah
  - Skor tinggi / sedang / rendah: merah / oranye / hijau
- Bahasa UI: Indonesia, dengan nada "untuk ditinjau", bukan "pelanggaran".

### Publik

**P1 · Beranda**
- Nama dan tagline.
- Tiga pilar (Deteksi, CHR, Smart Tracker).
- Tombol "Masuk" dan "Lihat transparansi".

**P2 · Transparansi publik**
- Pilihan tahun / tahap. Hanya siklus yang DIPA-nya sudah terbit.
- KPI:
  - jumlah catatan
  - % catatan closed sebelum diajukan
  - median hari dari terbit sampai closed
- Tabel per eselon I × kategori. Eselon I dengan catatan sedikit digabung jadi "Lainnya".
- Penjelasan metodologi dan disclaimer.
- Tanpa item, nama Satker, atau rupiah per item.

### Internal

**S1 · Login**
- Username, password, pesan error.

**S2 · Dashboard**
- KPI siklus:
  - item dianalisis
  - item kena aturan
  - catatan per status
  - Satker siap diajukan / total Satker sampel
  - **sisa hari ke tenggat ADK**
- Tabel per eselon I: flag, catatan terbuka, % closed, progres. Klik → S4 terfilter.
- Grafik distribusi kategori catatan.
- "Perlu tindakan saya": catatan Perlu Verifikasi, CHR draf.
- Pimpinan: semua eselon I. Reviewer / UKI: eselon I miliknya.

**S3 · Siklus & Impor Data**
- Daftar siklus: tahun, tahap, tenggat, status, DIPA terbit.
- Detail siklus berisi tabel eselon I × snapshot (v1 Awal, v2 Revisi, …): tanggal, jumlah item, pengimpor.
- Tombol **Impor CSV**: pilih eselon I, label versi, unggah file, lalu proses.
- Hasil impor:
  - baris dibaca, header disaring, item tersimpan
  - baru / berubah / tetap / hilang
  - error per baris (jika ada)
  - aturan yang terpicu
  - catatan yang dicek ulang
- State: file sama sudah pernah diimpor (idempoten) → tampilkan snapshot lama.

**S4 · Risk Triage**
- Filter: eselon I, Satker, kategori aturan, hanya flag, status keputusan, cari uraian.
- Tabel:
  - uraian (+ Satker · akun)
  - total (Rp)
  - chip aturan (R01…)
  - skor + kategori
  - perubahan (baru / berubah)
  - status (belum ditinjau / dikonfirmasi / dismiss)
- Urutan: kena aturan dulu, lalu skor.
- Ringkasan di atas: "N item kena aturan · M belum ditinjau".

**S5 · Detail Item (Evaluasi)**
- **Kiri: konteks.**
  - Hierarki (program → … → subkomponen)
  - Uraian, akun (kode + nama)
  - Volume × harga = total, rincian volume
  - Status blokir
  - Versi sebelumnya (diff, jika ada)
- **Tengah: alasan.**
  - Kartu tiap aturan yang terpicu: nama, alasan, sumber.
  - Rincian skor 5 faktor: nilai, bobot, kontribusi, penjelasan, "data tidak tersedia".
  - Perbandingan harga Satker lain: median, n Satker, posisi item.
  - Riwayat temuan BPK Satker: jumlah per tema, tanpa detail.
- **Kanan: keputusan.**
  - **Confirm** → form catatan: kategori (prefill dari aturan), teks (prefill dari alasan aturan), ekspektasi (prefill dari ekspektasi default; bisa diubah).
  - **Dismiss** → kategori alasan (dropdown) + catatan.
- Setelah confirm: link ke CHR eselon I.

**S6 · CHR Editor (per eselon I per tahap)**
- Header: nomor (setelah terbit), siklus, eselon I, status (Draf / Terbit / Selesai), jumlah catatan per status.
- Daftar catatan dikelompokkan per kategori. Tiap catatan memuat:
  - Satker, item (link ke S5)
  - teks, ekspektasi
  - status
  - aksi edit / hapus (hanya saat Draf)
- Isian:
  - **Rekomendasi** (reviewer)
  - **Tanggapan eselon I** (UKI, bisa diisi setelah terbit)
- Aksi:
  - **Terbitkan**: dialog konfirmasi "dokumen akan dikunci"
  - **Cetak**
  - **Riwayat versi**
- State terkunci: semua input nonaktif, banner "Terbit · terkunci", tombol "Tambah adendum" yang membuat versi baru.

**S7 · Cetak CHR**
- Tata letak dokumen A4: kop, identitas siklus dan eselon I, tabel catatan per kategori (No · Satker · Uraian item · Akun · Catatan · Ekspektasi), rekomendasi, tanggapan, tanda tangan.

**S8 · Smart Tracker (daftar catatan)**
- Tab status: Menunggu Revisi · Perlu Verifikasi · Dijustifikasi · Closed.
- Filter: eselon I, Satker, kategori.
- Tabel:
  - Satker
  - uraian item
  - kategori
  - ekspektasi
  - hasil cek terakhir (ikon)
  - umur catatan (hari sejak terbit)
- Aksi massal: setujui semua yang "terpenuhi" (dengan konfirmasi).

**S9 · Detail Catatan (Verifikasi)**
- Teks catatan dan ekspektasi.
- **Timeline:** dibuat → terbit → cek v2 (hasil + bukti sebelum → sesudah) → dikembalikan → cek v3 → closed.
- Kartu bukti: nilai lama vs baru dengan field yang berubah di-highlight.
- Aksi reviewer: **Setujui & tutup**, **Kembalikan** (alasan wajib), **Terima justifikasi**.
- Aksi UKI: **Isi justifikasi**.

**S10 · Progres per Satker (PIC UKI)**
- Pilih eselon I (otomatis untuk UKI).
- Tabel Satker:
  - Menunggu Revisi, Perlu Verifikasi, Dijustifikasi, Closed
  - **terakhir bergerak**
  - badge **Siap diajukan**
- Urutan default: Satker yang paling lama tidak bergerak di atas.
- Klik Satker → S8 terfilter.
- Ringkasan: "X dari Y Satker siap diajukan · Z hari ke tenggat ADK".

**S11 · Laporan**
- Metrik proses: catatan per kategori, % closed sebelum diajukan, median hari terbit → closed, distribusi alasan dismiss.
- **Validasi engine**: recall aturan terhadap kunci jawaban.
- Ekspor CSV mengikuti akses pengguna.

**S12 · Admin**
- **12a Katalog aturan:** daftar R01…, aktif / nonaktif, edit parameter dan alasan, jumlah hit di siklus aktif.
- **12b Bobot skor:** 5 bobot (total 100%), ambang, simpan sebagai versi baru, tombol "hitung ulang siklus".
- **12c Pengguna:** username, nama, peran, akses eselon I.
- **12d Siklus:** buat / ubah siklus, tandai "DIPA terbit" (memicu agregat publik).
- **12e Audit log:** filter aksi / entitas / pengguna, read-only.

### Matriks akses layar

| Layar | Reviewer | UKI | Pimpinan | Admin |
|---|---|---|---|---|
| S2 Dashboard | ✓ (eselon I sendiri) | ✓ (eselon I sendiri) | ✓ | ✓ |
| S3 Impor | ✓ | lihat | lihat | ✓ |
| S4–S5 Triage | ✓ | lihat | lihat | ✓ |
| S6–S7 CHR | ✓ | lihat + tanggapan | lihat | ✓ |
| S8–S9 Tracker | ✓ | lihat + justifikasi | lihat | ✓ |
| S10 Progres Satker | ✓ | ✓ | ✓ | ✓ |
| S11 Laporan | ✓ | ✓ | ✓ | ✓ |
| S12 Admin | — | — | — | ✓ |

### State yang perlu didesain

- Kosong: belum ada siklus, belum ada snapshot, belum ada flag, tracker kosong.
- Impor sedang diproses (ratusan ribu baris → progress).
- Error impor per baris.
- CHR terkunci.
- Akses ditolak.
- Hasil cek "data tidak cukup".

## 6. Data demo

- **Untuk juri dan publik:** seed sintetis (2 eselon I fiktif × 4–6 Satker, v1 Awal + v2 Revisi). Isinya sengaja memuat kasus R01–R08, item yang diperbaiki, yang tidak, dan yang dihapus.
- **Untuk narasumber:** data asli SIPEKA di server sendiri, jika diizinkan ([data-analysis.md](data-analysis.md) §5).

## 7. Definisi selesai MVP

1. Dari server yang bersih: `npm install && npm run db:migrate && npm run db:seed && npm run build && npm start` menjalankan aplikasi dengan data sintetis.
2. Skenario demo end-to-end jalan tanpa langkah manual di database:
   impor v1 → triage → confirm 3 item → terbit CHR → impor v2 → 2 terpenuhi + 1 belum → setujui 2, kembalikan 1 → justifikasi → closed → Satker siap diajukan.
3. Impor CSV asli satu eselon I terbesar (±168 ribu baris) selesai di server sendiri tanpa error.
4. Setiap flag dan skor bisa dijelaskan di S5. Setiap aksi tercatat di audit log.
5. Halaman publik hanya membaca tabel agregat.
