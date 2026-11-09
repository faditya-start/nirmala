# Analisis Data Sumber NIRMALA

Status: **dikunci untuk MVP** · 9 Nov 2026
Terkait: [mvp-scope.md](mvp-scope.md) · [rule-catalog.md](rule-catalog.md) · [data-model.md](data-model.md)

> Dokumen internal tim. Semua angka di sini adalah agregat dari data privat di `data/private/` (di-gitignore). Dokumen ini tidak memuat nama Satker, nama pejabat, atau nilai per item. Jangan disalin ke materi publik tanpa izin narasumber.

## 1. Ringkasan

Ada tiga sumber data, dan ketiganya bisa dipakai:

| Sumber | Isi | Dipakai untuk |
|---|---|---|
| **SIPEKA – DIPA awal & revisi** | Rincian item anggaran TA 2026, 10 eselon I, 679 Satker | Data yang direviu, demo impor awal → revisi, cek tindak lanjut otomatis |
| **SIPEKA – catatan reviu** (`t_catatan_inefisiensi`, kolom `CHR_*` di DIPA awal) | 17 catatan inefisiensi + 43 item berlabel catatan akun | Isi awal katalog aturan dan "kunci jawaban" untuk menguji engine |
| **PTL LHP BPK** (xlsx) | 16.496 rekomendasi BPK 2005–2026 beserta status tindak lanjut | Riwayat temuan per Satker (faktor skor) dan tema aturan |

Tiga temuan paling penting:

1. **Dua versi data sudah tersedia.** Data DIPA awal dan DIPA revisi bisa diperlakukan sebagai snapshot v1 dan v2. Itu cukup untuk mendemokan seluruh loop: impor → aturan → catatan → impor ulang → cek otomatis.
2. **Data asli membuktikan wedge NIRMALA.** Ada 43 item di DIPA awal yang mendapat catatan ketepatan akun. Di DIPA revisi, **35 di antaranya (81%) masih memakai akun yang sama**, dan 8 lainnya hilang atau berubah uraian. Catatan dibuat, tetapi perbaikan per item tidak terverifikasi. Ini persis celah yang disebut di brief. (Lihat caveat di §2.4.)
3. **Aturan sederhana sudah menangkap sebagian besar catatan asli.** Enam aturan berbasis kata kunci dan akun menangkap 29 dari 43 item berlabel (67%) dan 12 dari 16 item catatan inefisiensi (75%). Tiga dari empat catatan yang lolos adalah item "1 paket / LS" tanpa rincian. Di MVP, pola itu ditangkap lewat faktor skor *kualitas uraian*, bukan aturan, karena sebagai aturan ia memicu 2.000–7.000 item.

## 2. SIPEKA (`data/private/DB_SIPEKA/*.sql`)

Berkasnya adalah dump MySQL. Tabel yang relevan:

| Tabel | Baris | Keterangan |
|---|---|---|
| `d_dipa_awal` | 405.079 | DIPA awal TA 2026 (`KODE_STS_HISTORY = B00`). Tidak punya `ID_ITEM`, tetapi punya kolom label catatan `CHR_AKUN`, `CHR_SBM`, `CHR_EFISIENSI`, `CHR_LAINNYA` |
| `d_dipa_revisi` | 320.629 | Revisi terakhir per Satker (status B05–B10). Punya `ID_ITEM` |
| `t_catatan_inefisiensi` | 17 | Catatan reviu per `ID_ITEM` (merujuk ke `d_dipa_revisi`), dengan kategori dan status `OPEN` / `RESOLVED` |
| `r_kategori_catatan` | 3 | `EFISIENSI BELANJA`, `KESESUAIAN PENGGUNAAN SATUAN BIAYA`, `KETEPATAN PENGGUNAAN AKUN` |
| `r_unit` | 10 | Eselon I (BAES1 14501–14512) |
| `r_satker` | 679 | Satker → eselon I |
| `r_akun` | 870 | Kode dan nama akun BAS |
| `d_list_dipa` | 17.269 | Riwayat dokumen DIPA per Satker (nomor, revisi ke-, tanggal) |

File `data/private/data_dipa_revisi/es1_<BAES1>_2026.csv` punya **kolom yang persis sama** dengan `d_dipa_revisi`, dipecah per eselon I. Inilah format "CSV ekspor" yang dipakai NIRMALA sebagai format impor. Tidak ada integrasi SAKTI langsung.

### 2.1 Kolom yang dipakai

| Kelompok | Kolom | Pemakaian |
|---|---|---|
| Organisasi | `TAHUN`, `BAES1`, `KDSATKER` | Siklus, eselon I, Satker |
| Hierarki | `KODE_PROGRAM`, `KODE_KEGIATAN`, `KODE_OUTPUT`, `KODE_SUBOUTPUT`, `KODE_KOMPONEN`, `KODE_SUBKOMPONEN`, `URAIAN_SUBKOMPONEN` | Kunci item, tampilan konteks |
| Akun | `KODE_AKUN` (+ nama dari `r_akun`) | Aturan akun, faktor akun rawan |
| Item | `HEADER1`, `HEADER2`, `KODE_ITEM`, `NOMOR_ITEM`, `CONS_ITEM`, `URAIAN_ITEM` | Identitas dan uraian item |
| Nilai | `VOLKEG`, `SATKEG`, `HARGASAT`, `TOTAL` (+ `VOL_KEG_1..4`, `SAT_KEG_1..4` sebagai rincian) | Aturan volume/satuan, faktor harga |
| Blokir | `KODE_BLOKIR`, `NILAI_BLOKIR` | Aturan R08, label validasi |
| Referensi | `ID_ITEM` (revisi saja), `KODE_STS_HISTORY` | Tautan ke catatan SIPEKA, versi |
| Diabaikan di MVP | `POK_NILAI_1..12`, `KODE_JENIS_BEBAN`, `KODE_CARA_TARIK`, `KODE_REGISTER`, `KDIB`, `SUMBER_DANA`, `VOLUME_*` | Relevan untuk Fase 2 (Revisi POK) |

### 2.2 Baris header harus disaring

Baris dengan `HEADER1 = 1` atau `HEADER2 = 1` adalah judul kelompok (misalnya "PELAPORAN"), bukan item. Volume dan nilainya 0.

| | Total baris | Baris header | Item detail | Total pagu item detail |
|---|---|---|---|---|
| DIPA awal | 405.079 | 64.396 | 340.683 | ±Rp119,8 T |
| DIPA revisi | 320.629 | 53.750 | 266.879 | ±Rp132,4 T |

### 2.3 Identitas item: `ID_ITEM` tidak bisa dipakai sebagai kunci

- `ID_ITEM` adalah gabungan kode **tanpa pemisah**, dan formatnya tidak konsisten. Rumus gabungan yang dicoba hanya cocok untuk 20% baris.
- `ID_ITEM` juga mengandung tahun, mengandung akun (jadi berubah ketika akun diperbaiki), dan tidak tersedia di DIPA awal.

Hasil uji kunci pencocokan dari DIPA awal ke DIPA revisi (item detail):

| Kunci | Unik di awal | Kunci awal yang ketemu di revisi | Catatan |
|---|---|---|---|
| hierarki + akun + `NOMOR_ITEM` | ~100% | 211.757 | Hanya 64% yang uraiannya sama; nomor bergeser kalau ada sisipan |
| hierarki + akun + `CONS_ITEM` | 100% | 202.608 | 89% uraiannya sama |
| **hierarki tanpa akun + uraian ternormalisasi** | 94% | 176.733 | Tetap cocok walaupun akun diganti; ini yang dibutuhkan untuk cek "ganti akun" |

**Keputusan:** pencocokan dilakukan dua langkah. Detailnya ada di [data-model.md](data-model.md) §4.

1. Cocokkan dengan `item_key` = Satker + program + kegiatan + output + suboutput + komponen + subkomponen + uraian ternormalisasi + urutan kemunculan.
2. Item yang tidak cocok dicoba lagi dengan hierarki + akun + `CONS_ITEM`.
3. Item yang tetap tidak cocok ditandai **baru** (di revisi) atau **hilang** (dari awal).

`ID_ITEM` tetap disimpan sebagai kolom referensi, supaya catatan SIPEKA bisa ditautkan.

### 2.4 Label "kunci jawaban"

| Label | Jumlah | Catatan |
|---|---|---|
| `d_dipa_awal.CHR_AKUN` / `CHR_LAINNYA` terisi | 43 item (eselon I 14501, 14503, 14506) | Teks catatan ketepatan akun, misalnya honor outsourcing → 521111, internet → 521111, rehab madrasah → 526113 |
| `CHR_SBM`, `CHR_EFISIENSI` | 0 | Kolom ada tapi kosong |
| `t_catatan_inefisiensi` | 17 catatan untuk 16 item (eselon I 14501, 14504, 14506) | Semua ditemukan di DIPA revisi lewat `ID_ITEM`; semua berstatus `OPEN` |
| Item diblokir (`KODE_BLOKIR` terisi) | Awal: 7.144 item (±Rp11,7 T). Revisi: 568 item (±Rp1,5 T) | Kebanyakan di akun 524111, 521211, 521811. Alasan blokir tidak tercatat, jadi ini hanya label lemah |

Tindak lanjut 43 item berlabel CHR_AKUN, dicocokkan dengan hierarki tanpa akun + uraian:

| Hasil di DIPA revisi | Jumlah |
|---|---|
| Akun masih sama (belum diperbaiki) | **35** |
| Item hilang / uraian berubah | 8 |
| Akun berubah | 0 |

**Caveat sebelum dipakai di pitch:** tanggal penerbitan catatan `CHR_AKUN` tidak tercatat. Bisa saja sebagian revisi terjadi sebelum catatan disampaikan, atau Satker sudah memberi justifikasi di luar sistem. Konfirmasikan ke narasumber sebelum angka 81% diklaim.

### 2.5 Yang tidak tersedia di data SIPEKA

- **Hanya TA 2026.** Deteksi temuan berulang dan RKA hasil salin lintas tahun tidak bisa diuji dengan data asli → masuk backlog.
- **Tidak ada tabel SBM / standar biaya.** Pengganti di MVP adalah perbandingan harga antar-Satker. Dari item detail revisi, 1.533 kelompok uraian + satuan muncul di ≥5 Satker (92.091 item). Banyak di antaranya justru item ber-SBM, seperti uang harian perjalanan dinas per provinsi, penginapan, honor narasumber, dan konsumsi rapat. Dengan ambang 1,5× median, 7.107 item tergolong mahal.
- **Tidak ada Formulir H (checklist A–P).** MVP memakai 3 kategori `r_kategori_catatan` sebagai kategori catatan; checklist A–P masuk backlog.

## 3. PTL LHP BPK (`data/private/PTL 27 JULI 2026 (1).xlsx`)

Sheet `PTL 27 JULI 2026`: 16.496 baris rekomendasi, 2.217 judul temuan unik, LHP tahun 2005–2026.

| Dimensi | Sebaran |
|---|---|
| Jenis LHP | LK 10.989 · PDTT 2.272 · LOAN 1.825 · Kinerja 1.316 · BUN 94 |
| Jenis temuan | Lain-lain 10.094 · SPI 3.503 · Kepatuhan 2.899 |
| Status SiPTL | SS (sesuai) 10.718 · BS (belum sesuai) 3.333 · BT (belum ditindaklanjuti) 2.380 · TPTD 65 |
| Tag temuan teratas | Kelebihan pembayaran, Teguran, Aset Tetap, Revaluasi, Penatausahaan Aset, Perencanaan (332), **Penganggaran (279)** |

**Relevansi untuk RKA terbatas.** Sebagian besar temuan BPK terjadi di tahap pelaksanaan (kelebihan bayar, kekurangan volume, aset), sehingga tidak bisa dideteksi saat RKA disusun. Yang relevan adalah **700 baris** yang bertag Penganggaran atau judulnya menyebut penganggaran, akun/klasifikasi, perjalanan dinas, honorarium, atau paket meeting. Baris-baris ini tersebar di 174 Satker, dan 170 di antaranya ada di DIPA 2026. Tema berulangnya:

- Kesalahan penganggaran / klasifikasi **belanja barang vs belanja modal** → aturan R06
- **Perjalanan dinas** tidak sesuai ketentuan → faktor akun rawan (524xxx)
- **Honorarium** tanpa dasar hukum / melebihi ketentuan → faktor akun rawan (521213)
- **Paket meeting** dan honor melebihi ketentuan → faktor akun rawan (524114 / 524119)

**Pencocokan ke Satker.** Kolom `KODE SATKER` (tersimpan sebagai angka, misalnya `693741.0`, jadi perlu dinormalisasi ke 6 digit) mencakup 596 Satker, dan 582 di antaranya ada di DIPA 2026. Jadi **riwayat temuan BPK per Satker** bisa dihitung untuk hampir semua Satker.

**Kolom yang boleh dipakai:** `KODE SATKER`, `UNIT ORGANISASI`, `TAHUN LHP`, `JENIS LHP`, `JENIS TEMUAN`, `Tagging Temuan`, `STATUS SiPTL`, `JUDUL TEMUAN BESAR` (hanya untuk merumuskan tema aturan, tidak disimpan per Satker).

**Kolom yang dilarang:** `Pejabat Terkait`, `Keterangan Paket`, dan semua kolom uraian tindak lanjut (`URAIAN TINDAK LANJUT BPK`, `TL BARU ...`, `RENCANA AKSI`, dst.). Kolom-kolom ini memuat nama orang dan nomor surat.

## 4. Mengubah data asli menjadi katalog aturan dan seed sintetis

"LHP dan SIPEKA diubah jadi katalog rule dan seed sintetis" artinya:

| Keluaran | Isi | Boleh di-commit? |
|---|---|---|
| **Katalog aturan** ([rule-catalog.md](rule-catalog.md), lalu file seed aturan) | Pola umum hasil turunan catatan SIPEKA dan tema BPK: kata kunci, akun salah → akun benar, batas, sumber, alasan | Ya. Tidak memuat data identitas |
| **Profil riwayat BPK per Satker** | Hitungan temuan bertag penganggaran per kode Satker, per tahun, per status | Tidak. Dibangkitkan lokal dari `data/private` |
| **Seed sintetis** (`apps/api/fixtures/`) | CSV berformat SIPEKA dengan 2 eselon I fiktif × 4–6 Satker fiktif, versi awal dan revisi. Item diambil dari pola umum (makan rapat, perjalanan dinas, ATK, dsb.) dan sengaja disisipi kasus untuk setiap aturan. Revisi berisi campuran item yang diperbaiki, tidak diperbaiki, dan dihapus | Ya |
| **Impor data asli untuk demo lokal / narasumber** | Jalur impor yang sama, membaca `data/private/data_dipa_revisi/*.csv` | Tidak di-commit; hanya di server sendiri |

Generator seed sintetis ditulis sebagai skrip (`apps/api/scripts/generate-synthetic.ts`). Skrip ini **tidak** membaca `data/private`. Distribusi akun dan satuan cukup ditiru secara kasar dari angka agregat di dokumen ini.

## 5. Aturan privasi data (mengikat)

1. `data/private/` tetap di-gitignore. Isinya tidak pernah di-commit, diunggah ke layanan pihak ketiga, atau dimasukkan ke artifact.
2. Dokumen repo hanya memuat agregat. Tidak ada nama Satker, nama orang, nomor surat, atau nilai per item.
3. Demo publik dan juri memakai seed sintetis. Demo dengan data asli hanya di server sendiri dan atas izin narasumber (**[KEPUTUSAN K3]** di plan.md).
4. Panggilan LLM eksternal (backlog) hanya mengirim uraian, akun, volume, dan harga, sesuai brief.
