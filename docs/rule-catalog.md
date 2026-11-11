# Katalog Aturan & Faktor Skor (MVP)

Status: **dikunci untuk MVP**, isi aturan masih **perlu validasi auditor** · 9 Nov 2026
Terkait: [data-analysis.md](data-analysis.md) · [data-model.md](data-model.md) · [mvp-scope.md](mvp-scope.md)

Sesuai brief, deteksi NIRMALA berjalan dalam dua lapis (*rule-first*):

1. **Aturan.** Deterministik dan selalu bisa ditunjuk alasannya. Hasilnya berupa **flag** di item, dan flag tidak mengubah skor.
2. **Skor 0–100.** Hanya untuk **mengurutkan** item, terutama item yang tidak kena aturan apa pun.

Urutan di Risk Triage: item yang kena aturan tampil di atas, lalu diurutkan berdasarkan skor.

Angka "hit" di bawah dihitung dari item detail SIPEKA TA 2026 (awal / revisi). Fungsinya untuk menilai apakah sebuah aturan terlalu luas, **bukan** jumlah temuan.

## 1. Kategori catatan

MVP memakai kategori dari `r_kategori_catatan` SIPEKA. Checklist A–P Formulir H masuk backlog.

| Kode | Kategori |
|---|---|
| `EFISIENSI` | Efisiensi belanja |
| `SATUAN_BIAYA` | Kesesuaian penggunaan satuan biaya |
| `AKUN` | Ketepatan penggunaan akun |
| `LAINNYA` | Lainnya (untuk catatan reviewer yang tidak masuk tiga kategori di atas) |

## 2. Jenis aturan yang didukung engine

| Jenis | Parameter | Arti |
|---|---|---|
| `keyword` | `include` (regex uraian), `exclude?`, `akun_prefix?` | Uraian cocok pola (opsional: hanya di akun tertentu) |
| `keyword_wrong_account` | `include`, `exclude?`, `akun_salah` (daftar / prefix), `akun_benar` | Uraian cocok pola, tetapi akunnya ada di daftar yang salah |
| `value_check` | `kondisi` (mis. `volume = 0 AND total > 0`) | Pemeriksaan nilai |
| `blokir_history` | — | Item ini atau padanannya di versi sebelumnya punya `KODE_BLOKIR` |

Setiap aturan menyimpan:
- `kode`, `nama`, `kategori`, `jenis`, `parameter`
- `alasan` (template kalimat yang ditampilkan ke reviewer)
- `sumber` (catatan SIPEKA / LHP BPK / regulasi)
- `ekspektasi_default`: diusulkan otomatis saat reviewer mengonfirmasi flag
- `aktif`, `berlaku_tahun`, `catatan_validasi`

## 3. Aturan

### R01 · Pakaian / seragam hari besar
- **Kategori:** `EFISIENSI` · **Jenis:** `keyword`
- **Pola:** uraian mengandung (`pakaian` | `seragam` | `kaos` | `batik`) **dan** (`17 agustus` | `kemerdekaan` | `hari bakti/bhakti` | `harbak` | `hari besar` | `hut`)
- **Alasan:** "Alokasi pakaian hari besar tidak memiliki standar penetapan biaya dan tidak esensial dalam mendukung fungsi utama."
- **Sumber:** 8 catatan `t_catatan_inefisiensi` (eselon I 14504, 14506); rujukan PMK SBM TA 2026 dan LHR Itjen atas RKA 2026
- **Hit:** awal 240 · revisi 140 · tertangkap 7 dari 8 catatan asli
- **Ekspektasi default:** `hapus_item`
- **Validasi:** varian tanpa kata "pakaian" ("keperluan hari peringatan kemerdekaan", 1 KEG) lolos. Perlu ditanyakan apakah semua keperluan hari besar dilarang, atau hanya pakaian.

### R02 · Honor / jasa outsourcing satpam, pengemudi, kebersihan di luar 521111
- **Kategori:** `AKUN` · **Jenis:** `keyword_wrong_account`
- **Pola:** uraian mengandung `satpam` | `pengamanan` | `pengemudi` | `sopir` | `kebersihan` | `cleaning` | `pramubakti` | `outsourc`; akun ∈ {522191, 521119, 521213}
- **Akun benar:** 521111 Belanja Keperluan Perkantoran
- **Alasan:** "Biaya tenaga outsourcing (satpam, pengemudi, kebersihan) menggunakan akun 521111 sesuai KEP-331/PB/2021 tentang Kodefikasi Segmen Akun pada BAS."
- **Sumber:** `CHR_AKUN` (d_dipa_awal) + 2 catatan `t_catatan_inefisiensi` kategori akun
- **Hit:** awal 202 · revisi 178
- **Ekspektasi default:** `ganti_akun → 521111`

### R03 · Langganan internet / paket data di luar 521111
- **Kategori:** `AKUN` · **Jenis:** `keyword_wrong_account`
- **Pola:** uraian mengandung `internet` | `paket data`; akun berawalan 52, kecuali 521111
- **Akun benar:** 521111
- **Sumber:** `CHR_AKUN` (7 item berlabel, semua tertangkap)
- **Hit:** awal 569 · revisi 592
- **Ekspektasi default:** `ganti_akun → 521111`
- **Validasi:** apakah internet yang bukan keperluan kantor sehari-hari (misalnya untuk kegiatan lapangan) dikecualikan? Kalau ya, tambahkan `exclude`.

### R04 · Cetak kop surat / amplop / map di 521111
- **Kategori:** `AKUN` · **Jenis:** `keyword_wrong_account`
- **Pola:** uraian mengandung `kop surat` | `amplop` | `cetak map` | `map`; akun = 521111
- **Akun benar:** 521211 Belanja Bahan atau 521811 Barang Persediaan Konsumsi
- **Sumber:** `CHR_AKUN`
- **Hit:** awal 17 · revisi 15
- **Ekspektasi default:** `ganti_akun → 521211` (reviewer bisa mengganti ke 521811)

### R05 · Rehabilitasi / pembangunan sarana yang diserahkan ke masyarakat di akun belanja modal
- **Kategori:** `AKUN` · **Jenis:** `keyword_wrong_account`
- **Pola:** uraian mengandung `madrasah` | `masjid` | `stadion` | `pesantren` | `gereja`; akun berawalan 53
- **Akun benar:** 526113 Belanja Gedung dan Bangunan untuk Diserahkan kepada Masyarakat/Pemda
- **Sumber:** `CHR_AKUN` + `CHR_LAINNYA` (18 item berlabel, semua tertangkap)
- **Hit:** awal 84 (±Rp1,06 T) · revisi 166
- **Ekspektasi default:** `ganti_akun → 526113`
- **Validasi:** item "Sekolah Rakyat" di 533111 juga diberi catatan. Perlu dipastikan apakah termasuk aset yang diserahkan.

### R06 · Barang modal di akun belanja barang
- **Kategori:** `AKUN` · **Jenis:** `keyword_wrong_account`
- **Pola:** uraian mengandung `laptop` | `notebook` | `komputer` | `pc` | `printer` | `kendaraan` | `mobil` | `sepeda motor` | `ac split` | `server`; akun berawalan 52
- **Pengecualian:** `pemeliharaan` | `sewa` | `servis` | `perbaikan` | `bbm` | `stnk` | `tinta` | `toner` | `suku cadang` | `jasa` | `pengemudi` | `sopir` (tiga yang terakhir ditambahkan di Fase 3: "Jasa pengemudi kendaraan dinas" adalah kasus R02, bukan pembelian kendaraan)
- **Akun benar:** 532111 Belanja Modal Peralatan dan Mesin
- **Sumber:** tema LHP BPK "Kesalahan penganggaran belanja barang/modal" (lebih dari 100 baris rekomendasi dengan judul sejenis)
- **Hit:** awal 3.063 · revisi 3.675 → **terlalu luas**
- **Ekspektasi default:** `ganti_akun → 532111`
- **Validasi:** tambahkan syarat harga satuan ≥ batas minimum kapitalisasi BMN (nilainya dicek ke ketentuan terbaru dan dijadikan parameter). Kalau setelah itu masih >500 hit, nonaktifkan dan jadikan faktor skor.

### R07 · Nilai tanpa volume
- **Kategori:** `EFISIENSI` · **Jenis:** `value_check`
- **Kondisi:** `VOLKEG = 0 AND TOTAL > 0` (item detail)
- **Alasan:** "Alokasi item tidak dirinci volumenya sehingga kebutuhan riil tidak dapat dinilai."
- **Sumber:** 5 catatan `t_catatan_inefisiensi` ("tidak ada penjelasan rincian dan volume")
- **Hit:** awal 41 (±Rp735 M) · revisi 62
- **Ekspektasi default:** `rinci_item`
- **Catatan:** pola "1 paket / LS tanpa rincian" juga muncul di catatan asli, tetapi terlalu banyak sebagai aturan (2.292 item ≥Rp100 jt di awal). Pola itu ditangani faktor skor F4.

### R08 · Item pernah diblokir DJA
- **Kategori:** `SATUAN_BIAYA` · **Jenis:** `blokir_history`
- **Kondisi:** `KODE_BLOKIR` terisi di item ini atau di padanannya di snapshot sebelumnya
- **Alasan:** "Item ini pernah diblokir; agar dicek kembali kesesuaiannya dengan ketentuan standar biaya sebelum diajukan."
- **Sumber:** 2 catatan `t_catatan_inefisiensi` ("telah di-blokir sebelumnya oleh DJA")
- **Hit:** awal 7.144 · revisi 568
- **Ekspektasi default:** `manual`
- **Validasi:** di data awal, blokir menumpuk di 3 eselon I dan akun perjalanan dinas, sehingga kemungkinan besar blokir kebijakan. Untuk MVP, flag ini hanya aktif di snapshot revisi. Arti tiap `KODE_BLOKIR` (2, A, 3, …) perlu dikonfirmasi.

## 4. Faktor skor (ranking)

Lima faktor, mengikuti struktur brief. Faktor yang datanya tidak tersedia ditandai `dataAvailable = false` dan tidak menaikkan skor. Ini perilaku `riskScoring.ts` yang sekarang dan dipertahankan.

| # | Faktor | Pengganti dari brief | Cara hitung | Bobot awal |
|---|---|---|---|---|
| F1 | **Harga vs Satker lain** | Price Variance (tanpa tabel SBM) | Rasio `HARGASAT` terhadap median kelompok (uraian ternormalisasi + satuan) yang muncul di ≥5 Satker dalam siklus yang sama. 1,0× = 0; ≥2,0× = 100; linear di antaranya | 30 |
| F2 | **Akun rawan** | BAS Alignment | Skor tetap per akun dari daftar konfigurasi: 524111/524113 perjalanan dinas, 524114/524119 paket meeting, 521213 honor output, 521211, 521811 (akun yang paling sering diblokir dan menjadi tema temuan BPK) | 20 |
| F3 | **Riwayat temuan BPK Satker** | Historical Similarity (tanpa embedding) | Jumlah rekomendasi BPK bertema penganggaran untuk kode Satker ini (PTL), ditimbang status BS/BT ×2, dan dibatasi 100 | 20 |
| F4 | **Kualitas uraian** | Description Quality | Uraian < 3 kata, **atau** satuan paket/LS/KEG dengan volume ≤ 1 dan total ≥ ambang (default Rp100 jt), **atau** tidak ada `VOL_KEG_1` | 15 |
| F5 | **Perubahan dari versi sebelumnya** | Carry-over (lintas tahun → backlog) | Item baru di snapshot ini = 60; nilai naik >20% = 80; tidak berubah = 0; snapshot pertama = tidak tersedia | 15 |

- **Ambang kategori:** sedang ≥ 35, tinggi ≥ 70 (dipertahankan dari kode sekarang).
- **Bobot adalah hipotesis.** Diuji dengan "kunci jawaban" di §5.
- Setiap perubahan bobot membuat versi konfigurasi baru.

## 5. Kunci jawaban untuk menguji engine

| Label | Isi | Metrik |
|---|---|---|
| L1 | 43 item `CHR_AKUN`/`CHR_LAINNYA` (awal) | Recall aturan. Saat ini 29/43 dengan R02–R05 |
| L2 | 16 item `t_catatan_inefisiensi` (revisi) | Recall aturan + posisi di ranking. Saat ini 12/16 dengan R01, R02 |
| L3 | Item blokir (revisi) | Precision@N skor (label lemah) |

Laporan "validasi engine" di MVP menampilkan L1 dan L2 untuk data asli (hanya di server sendiri), dan versi sintetisnya untuk demo.

## 6. Yang belum masuk katalog (backlog)

- Checklist A–P Formulir H sebagai kategori resmi.
- Aturan `cost_cap` terhadap tabel SBM resmi, setelah tabel SBM tersedia.
- Temuan berulang dan RKA hasil salin lintas tahun (butuh data TA sebelumnya).
- Daftar kriteria dari auditor (brief: "item tertentu tidak boleh di akun 526"). Katalog ini perlu dibandingkan dengan daftar itu begitu tersedia.
