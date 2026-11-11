# NIRMALA Concept Brief

Nov 9, 2026 · @ally

## Ringkasan

NIRMALA adalah platform pendukung reviu RKA untuk APIP dan unit perencanaan K/L yang bekerja di fase Pra-DIPA. Ia memprioritaskan item RKA berisiko lewat skor yang bisa dijelaskan, lalu mengawal setiap catatan CHR sampai perbaikan Satker terverifikasi, sebelum anggaran disahkan.

Wedge utamanya bukan deteksi. Pedoman reviu Itjen PU dan narasumber sama-sama menunjukkan bahwa perbaikan Satker atas catatan CHR tidak pernah dicek ulang per item; tanggung jawabnya dialihkan ke unit eselon I. NIRMALA menutup celah itu dengan bukti per item, yang sekaligus menjadi jawaban saat BPK bertanya.

**Dampak yang terukur.** Hari ini reviu dilakukan manual baris per baris selama sekitar satu minggu, dan hasilnya kadang baru keluar sehari sebelum tenggat ADK masuk Kemenkeu (sekitar tanggal 10 sampai 12), sehingga Satker tidak sempat memperbaiki. Target NIRMALA: reviu selesai paling lambat H-3 tenggat, karena kerja auditor bergeser dari mencari menjadi mengonfirmasi.

Pilot dirancang untuk Kementerian PU. Engine-nya dibangun di atas konsep siklus reviu yang generik, sehingga K/L lain dan fase lain (misalnya Revisi POK) bisa dilayani lewat konfigurasi, bukan rewrite.

> Status: konsep yang sudah diselaraskan dari deck, user flow, class diagram, dan catatan diskusi tim. Sebagian besar asumsi sudah divalidasi lewat narasumber dan pedoman reviu Itjen PU; sisanya ada di bagian Hasil validasi.

## Siklus anggaran dan titik kontrol

Ada lima lapisan kontrol atas satu anggaran, dan hanya dua yang terjadi sebelum uang bisa dibelanjakan. NIRMALA fokus di lapisan 2, karena itu titik terakhir di mana perbaikan masih murah dan bersifat preventif.

| # | Fase | Pelaku | Keluaran | Sifat kontrol | Di NIRMALA |
| --- | --- | --- | --- | --- | --- |
| 1 | Penyusunan RKA Satker | Satker (pengelola keuangan, PPK) | RKA Satker di SAKTI modul penganggaran | Penyusunan dan cek internal, bukan audit | Sumber data |
| 2 | Penelitian dan reviu RKA (Pra-DIPA) | Biro Perencanaan (Biro PAKLN) dan Biro Keuangan meneliti; Itjen sebagai APIP mereviu, berjalan paralel | CHP awal dan akhir, CHR per unit eselon I, lalu LHR; dua tahap: pagu dan alokasi anggaran | Preventif, keyakinan terbatas | **Fokus pilot** |
| 3 | Penelaahan | DJA Kemenkeu bersama Bappenas | RKA K/L hasil penelaahan, lalu DIPA | Gerbang eksternal | Di luar scope |
| 4 | Pelaksanaan dan revisi (Pasca-DIPA) | KPA untuk Revisi POK; Kanwil DJPb dan DJA sesuai kewenangan; dipantau Biro Keu, Biro PAKLN, Dit. SS, Itjen | DIPA Revisi, POK | Detektif selama tahun berjalan | Fase 2, engine yang sama |
| 5 | Pemeriksaan akhir tahun | BPK | LHP atas Laporan Keuangan K/L | Korektif | Di luar scope |

RKA yang sudah masuk SAKTI belum berarti disahkan. Di lapisan 2, auditor menarik rancangan dari SAKTI, meneliti, merapatkan, lalu menerbitkan catatan. Hasilnya dikirim ke unit eselon I untuk diperbaiki sebelum RKA lanjut ke penelaahan DJA.

Di dalam Kemen PU, pengendalian mengikuti model tiga lapis: Satker sebagai lapis 1 yang bersentuhan langsung dengan lapangan, UKI eselon I sebagai lapis 2 (quality control), dan Itjen sebagai lapis 3 (quality assurance). Biro Keuangan melaporkan temuannya ke UKI. Setelah RKA masuk Kemenkeu, DJA menyaring lagi dengan mesinnya sendiri berdasarkan data historis PU, dan item bermasalah yang lolos reviu bisa langsung diblokir.

## Koreksi atas pemahaman flow saat ini

Secara garis besar flow yang dipahami tim sudah benar. Ada enam hal yang perlu dipertajam, dan koreksi nomor 3 justru membuat pitch lebih kuat.

1. **Pengendalian berlapis tiga, bukan dua.** Satker adalah lapis 1 yang bersentuhan langsung dengan lapangan, UKI eselon I lapis 2 sebagai quality control, dan Itjen lapis 3 sebagai quality assurance. Draf awal brief melewatkan UKI, padahal PIC eselon I yang harus mengoordinasi ratusan Satker (satu eselon I bisa membawahi 219 Satker) adalah pengguna utama Smart Tracker.
2. **Penelitian dan reviu adalah dua kegiatan berbeda yang paralel.** Biro PAKLN meneliti kebenaran dan kelengkapan RKA (keluarannya CHP awal dan akhir), sedangkan Itjen mereviu kepatuhan pada kaidah penganggaran (keluarannya CHR). Reviu Itjen dilakukan di level unit eselon I dengan Satker sampel, dua kali per tahun anggaran: tahap pagu anggaran dan tahap alokasi anggaran.
3. **"Di SAKTI tidak ada guardrail" terbukti, dengan dua nuansa.** Pertama, DJA menyaring RKA dengan mesinnya sendiri berdasarkan data historis PU dan bisa memblokir item bermasalah, jadi mengikuti CHR sebenarnya menolong Satker agar tidak kena blokir. Kedua, yang tidak ada adalah verifikasi per item: narasumber menegaskan pengecekan ulang revisi Satker terhadap catatan reviu "selama ini tidak ada, seharusnya ada", dan template CHR Itjen PU hanya mengalihkan tanggung jawab ke eselon I. Itu celah yang diisi NIRMALA.
4. **"Tiap audit konsepnya sama" benar di level loop, beda di konsekuensi.** Loop-nya selalu deteksi, catatan, perbaikan, verifikasi. Bedanya: di Pra-DIPA perbaikan cukup mengubah rancangan; di Pasca-DIPA harus lewat revisi dengan kewenangan berlapis (KPA, Kanwil DJPb, DJA); di akhir tahun BPK hanya bisa memberi temuan dan rekomendasi, termasuk menyetor kembali belanja ke kas negara. Implikasinya untuk desain: engine generik, aturan dan status per fase dikonfigurasi.
5. **Nemesis bukan sekadar "audit setelah DIPA".** Nemesis mengaudit data pengadaan publik (SIRUP dan INAPROC) dari luar pemerintah. Ia hanya melihat apa yang diposting di portal pengadaan, jadi pengadaan yang tidak diposting atau barisnya kosong tidak tertangkap.
6. **Revisi POK adalah titik buta yang sah.** Revisi POK adalah kewenangan KPA di dalam satu Satker dan tidak melewati penelaahan DJA. Di sinilah item yang sudah ditegur bisa dimunculkan lagi setelah DIPA terbit, sehingga Revisi POK menjadi kandidat terkuat untuk Fase 2.
7. **CHR bukan praktik khas Kemen PU saja.** Istilah dan fungsinya ada di pedoman reviu RKA-K/L Kemenkeu dan dipakai APIP K/L lain; SOP Kemenkumham misalnya menyebut IHP dan CHR sebagai keluaran penelitian dan reviu. Yang khas Kemen PU adalah format dan alurnya, diatur SE Irjen PU 02/SE/Ij/2024. Yang benar: CHR memang tidak tercatat di SAKTI, sehingga NIRMALA bisa menjadi system of record-nya.

## Keputusan scope: Pra-DIPA dulu, Pasca-DIPA sebagai Fase 2

Pilot mengambil fase penelitian dan reviu RKA sebelum DIPA disahkan, sesuai saran pembimbing di Kemen PU. Fase Pasca-DIPA (Revisi POK) tidak dibuang, tetapi diposisikan sebagai Fase 2 yang memakai engine yang sama.

Alasannya ada empat. Pertama, perbaikan sebelum disahkan jauh lebih murah daripada revisi DIPA atau temuan BPK. Kedua, fase ini sudah punya dokumen wajib (CHP, CHR, LHR), jadi NIRMALA mengisi proses yang sudah ada, bukan menciptakan proses baru yang harus diadopsi. Ketiga, posisinya berbeda tajam dari Nemesis dan dari SIPEKA versi sekarang yang bersifat reaktif. Keempat, pembimbing sebagai calon pengguna sudah menyatakan preferensinya.

Risikonya adalah musiman: reviu Pra-DIPA hanya terjadi dalam dua tahap per tahun anggaran (pagu dan alokasi), sehingga tool yang hanya melayani fase ini akan menganggur sebagian besar tahun. Mitigasinya ada di model data: siklus reviu dijadikan entitas utama, sehingga menambah Fase 2 cukup dengan konfigurasi fase, bukan rewrite.

### Kenapa bukan auditor yang menginput ke SAKTI

Ide agar auditor yang menginput RKA ke SAKTI setelah Satker memperbaiki memang menutup celah, tetapi melanggar dua prinsip dasar. Auditor yang menginput angka ikut memiliki angka yang ia audit, sehingga independensi APIP hilang. Tanggung jawab anggaran juga tetap ada di KPA dan eselon I, bukan di Itjen, jadi pemisahan tugasnya terbalik.

Tujuan yang sama bisa dicapai lewat gerbang: Satker tetap yang menginput, NIRMALA memverifikasi perubahan terhadap setiap catatan, dan status "siap diajukan" hanya hijau kalau semua catatan sudah selesai atau dijustifikasi dan diterima reviewer. Ini juga yang dimaksud ide tracker tahapan revisi dari Cello.

### Mesin dekat ke auditor dulu, penyusun menyusul

Pembimbing mengangkat pilihan desain: mesin deteksi didekatkan ke penyusun RAB (peringatan "tahun lalu ini jadi temuan" saat item diinput) atau ke auditor. Keputusannya satu engine dengan dua titik sentuh. Untuk pilot dan MIA, titik sentuhnya auditor, karena loop CHR adalah wedge-nya. Library kriteria temuan dibangun sebagai service terpisah, sehingga aplikasi penyusunan RAB seperti RAKA bisa memanggilnya sebagai peringatan dini di Fase 3.

### Posisi terhadap Nemesis

| Dimensi | Nemesis | NIRMALA |
| --- | --- | --- |
| Pengguna | Publik, peneliti, jurnalis | Reviewer internal (Itjen, Biro) dan pimpinan |
| Data | Pengadaan publik (SIRUP, INAPROC) | Rancangan RKA di SAKTI dan histori CHR |
| Waktu | Setelah anggaran tersedia | Sebelum anggaran disahkan |
| Keluaran | Penanda anomali | Penanda, CHR, dan verifikasi tindak lanjut sampai tuntas |
| Peran | Pengawas eksternal | Kontrol internal yang preventif |

NIRMALA juga bukan satu-satunya alat pengawasan di Kemen PU. Itjen PU sudah punya CACM (continuous auditing, continuous monitoring) yang menerima rekap pengadaan red flag dari Inaproc secara berkala. NIRMALA berada di hulunya: menangkap masalah di tahap rencana, sebelum ada data pengadaan. Ke depan, catatan CHR yang cocok dengan red flag CACM bisa menjadi konfirmasi bagi auditor untuk turun ke lapangan.

### Rekomendasi untuk lapisan transparansi publik

Buka metrik proses, bukan isi anggaran, dan baru setelah DIPA terbit. Konkretnya: jumlah catatan per Unor dan per kategori checklist (standar biaya, akun, data dukung, dan seterusnya), persentase catatan yang closed sebelum RKA diajukan, median hari penyelesaian, dan tren antar tahun. Tidak ada item, nama Satker, atau nilai rupiah per item.

Alasannya tiga. RKA Pra-DIPA masih rancangan yang sedang dibahas, dan membukanya bisa dibaca sebagai tuduhan sebelum ada keputusan. Metrik proses justru menjawab pertanyaan transparansi yang paling relevan untuk publik: apakah pengawasan internal berjalan dan apakah temuannya ditindaklanjuti. Jeda sampai DIPA terbit menghilangkan risiko mengganggu pembahasan.

Unor dengan jumlah catatan sangat sedikit sebaiknya digabung agar angka tidak bisa ditelusuri ke satu Satker. Batas akhirnya tetap perlu dikonfirmasi ke PPID Kemen PU.

## Solusi: tiga pilar dan satu lapisan publik

NIRMALA menutup loop dari deteksi sampai bukti perbaikan, dengan manusia memegang setiap keputusan yang berkonsekuensi.

&#91;embedded content: closed loop NIRMALA · 8 langkah, 2 loop balik\]

Baris atas adalah deteksi dan penerbitan catatan; baris bawah adalah verifikasi tindak lanjut. Catatan yang belum sesuai kembali ke Satker, bukan ke triage, dan setiap RKA versi baru tetap di-scoring ulang untuk item yang baru atau berubah.

1. **Deteksi rule-first, skor untuk ranking.** Auditor hari ini bekerja dengan kriteria yang sudah mereka tahu (misalnya item tertentu tidak boleh di akun 526, kaos seragam sudah dilarang) lalu mencarinya manual. NIRMALA menjalankan kriteria itu otomatis lewat library kriteria temuan dari CHR dan LHR lama, ditambah deteksi temuan berulang dan deteksi RKA hasil salin dari tahun lalu. Skor 0-100 dari lima faktor dipakai untuk mengurutkan hasilnya, dan setiap flag menampilkan aturan atau alasan yang memicunya.
2. **CHR Editor dengan human in the loop.** Reviewer mengonfirmasi atau menolak flag, menyusun catatan, lalu menerbitkan CHR. Setelah terbit, dokumen terkunci dan setiap perubahan menjadi versi baru di audit log.
3. **Smart Tracker sebagai gerbang.** Setiap catatan membawa ekspektasi perubahan yang terstruktur. Saat RKA versi baru di-ingest, sistem mengecek ekspektasi itu, reviewer mengonfirmasi, dan status siap diajukan hanya hijau kalau semua catatan closed. UKI eselon I mendapat tampilan per Satker untuk melihat siapa yang belum bergerak.
4. **Lapisan transparansi publik.** Agregat proses per Unor (jumlah catatan, tingkat penyelesaian, waktu penyelesaian) tanpa membuka item RKA yang belum final.

## Roadmap: dari Pra-DIPA ke tahun berjalan

Scope pilot berhenti di Pra-DIPA, sesuai arahan pembimbing, dan tahap berikutnya disampaikan sebagai roadmap. Dua fase lanjutan memakai engine yang sama.

&#91;embedded content: roadmap NIRMALA · 3 fase, satu engine\]

Fase 2 menjawab pola kucing-kucingan yang disebut narasumber: Satker mengikuti CHR sebelum DIPA terbit, lalu memunculkan lagi item yang sudah ditegur lewat revisi di tengah tahun, menyiapkan alokasi cadangan untuk menggantikan item yang diblokir, atau membeli barang yang tidak pernah ada di RAB awal. Regulasi saat ini hanya mewajibkan penelitian dan reviu di Pra-DIPA, dan usulan memperluasnya ke tahun berjalan tertahan karena UKI kekurangan SDM. Otomasi menjawab keberatan itu: catatan CHR yang sudah closed dijadikan baseline yang dicek ulang di setiap Revisi POK, sehingga pengawasan berlanjut tanpa menambah reviu manual.

## User flow dan status catatan

Flow lama sudah benar urutannya. Dua hal diubah: catatan yang belum sesuai kembali ke Satker (bukan ke triage), dan penutupan selalu dikonfirmasi reviewer, bukan ditutup otomatis.

**Peran.** Reviewer (Itjen, Biro PAKLN, Biro Keuangan) bekerja di triage dan CHR. PIC UKI eselon I memakai Smart Tracker untuk mengoordinasi tindak lanjut di seluruh Satker-nya dan melihat siapa yang belum bergerak. Pimpinan membaca dashboard dan laporan. Admin mengatur library kriteria, konfigurasi risiko, pengguna, dan membaca audit log. Peran Satker bersifat opsional untuk pilot: hanya melihat catatan miliknya dan mengirim justifikasi.

1. **Dashboard.** Pimpinan dan reviewer melihat sebaran risiko dan progres tindak lanjut per Unor, lalu drill-down ke Satker berisiko tinggi.
2. **Risk Triage.** Item RKA diurutkan dari skor tertinggi. Reviewer membuka item yang di-flag.
3. **Evaluasi item.** Reviewer membaca uraian, kesesuaian BAS, selisih harga terhadap referensi, dan temuan historis yang mirip, lalu memutuskan:
   1. Dismiss: wajib memilih alasan (misalnya harga wajar karena lokasi, BAS sudah tepat). Keputusan masuk korpus feedback.
   2. Confirm: item masuk draf CHR.
4. **Terbitkan CHR.** Reviewer menulis catatan dan ekspektasi perubahan terstruktur per item, lalu menerbitkan. Dokumen terkunci dan dikirim ke unit eselon I, yang meneruskan perbaikan ke Satker terkait.
5. **Satker memperbaiki di SAKTI** (di luar NIRMALA).
6. **Re-ingest dan Smart Tracker.** RKA versi baru masuk, sistem mengecek setiap catatan terhadap ekspektasinya dan men-scoring ulang item baru atau berubah.
7. **Verifikasi akhir.** Reviewer menyetujui hasil cek atau mengembalikan catatan ke Satker. Saat semua catatan Satker itu closed, statusnya menjadi siap diajukan.

### Status per catatan

Status melekat pada catatan per item, bukan pada dokumen CHR. Dokumen CHR selesai otomatis saat seluruh catatannya closed, jadi tidak ada dua sumber status yang bisa saling bertentangan.

| Status | Masuk ketika | Dipindahkan oleh |
| --- | --- | --- |
| Draf | Reviewer mengonfirmasi flag | Reviewer |
| Menunggu Revisi | CHR diterbitkan, atau catatan dikembalikan | Reviewer |
| Perlu Verifikasi | RKA versi baru masuk dan Smart Tracker selesai mengecek | Sistem |
| Dijustifikasi | Satker memberi alasan tidak mengubah | Satker atau reviewer |
| Closed | Reviewer menyetujui hasil cek atau menerima justifikasi | Reviewer |

## Model data yang direvisi

Class diagram yang ada sudah menangkap domain intinya, tetapi belum bisa mendukung Smart Tracker dan generalisasi lintas instansi. Dua entitas yang paling penting untuk ditambahkan adalah siklus reviu dan snapshot RKA.

| Entitas | Isi utama | Kenapa perlu |
| --- | --- | --- |
| Instansi, Unor, Satker | Hierarki K/L, eselon I, Satker | Satu deployment bisa melayani lebih dari satu K/L |
| ReviewCycle | Tahun anggaran, fase dan tahap (Pra-DIPA pagu, Pra-DIPA alokasi, Revisi POK), unit eselon I, Satker sampel beserta alasan pemilihannya, status | Kunci generalisasi: fase baru cukup jadi konfigurasi |
| RkaSnapshot | Versi RKA per Satker per siklus, sumber file, hash, waktu ingest | Smart Tracker butuh membandingkan versi, bukan sekadar pagu awal dan revisi |
| RkaItem | Baris RKA per snapshot dengan item key komposit yang stabil antar versi (seperti ID\_ITEM di SIPEKA) | Delta per item hanya bisa dihitung kalau identitas item stabil |
| RiskAssessment | Skor total, skor per faktor, versi konfigurasi bobot, alasan, temuan historis teratas | Skor harus bisa direproduksi dan diaudit |
| ReviewerDecision | Confirm atau dismiss, kategori alasan, reviewer | Menggantikan AiFeedbackLoop; berlaku juga untuk dismiss |
| ChrDocument | Per unit eselon I per tahap, mengikuti Formulir H: checklist A sampai P, tanggapan eselon I, tanggapan Itjen, rekomendasi; versi, status terbit, terkunci | Sesuai bentuk CHR di SE Irjen PU 02/SE/Ij/2024 |
| ChrNote | Catatan per butir checklist, opsional terkait Satker dan item; jenis (CHP atau CHR), teks, ekspektasi terstruktur, status, flag pantau setelah closed (Fase 2) | Sumber tunggal status; ekspektasi terstruktur yang memungkinkan cek otomatis |
| FollowUpCheck | Hasil cek per catatan per snapshot, bukti delta | Jejak bukti bahwa perbaikan memang terjadi |
| HistoricalFinding | Pola temuan lama, akun seharusnya, embedding | Korpus untuk faktor Historical Similarity |
| PriceReference | Standar biaya (SBM) dan referensi harga lain | Faktor Price Variance |
| AuditLog | Siapa, apa, kapan, nilai sebelum dan sesudah; append-only | Traceability yang dijanjikan di deck |
| KriteriaTemuan | Aturan eksplisit dari CHR dan LHR lama: item terlarang, pasangan item dan akun yang tidak boleh, batas standar biaya; sumber temuan, pemilik, masa berlaku | Detektor utama yang paling dekat dengan cara auditor bekerja; juga dipakai penyusun RAB di Fase 3 |
| ItemLineage | Pasangan item tahun ini dengan item tahun lalu dan skor kemiripannya | Deteksi temuan berulang dan RKA hasil salin yang hanya berganti judul |

### Catatan atas class diagram saat ini

- `paguAwal` dan `paguRevisi` di RkaItem hanya muat satu kali revisi. Ganti dengan snapshot per versi.
- RkaItem ke AiTriageResult tertulis 1:1. Seharusnya 1:N, satu penilaian per snapshot dan per versi konfigurasi.
- AiFeedbackLoop menempel di CHR, padahal dismiss tidak pernah menghasilkan CHR. Pindahkan ke keputusan reviewer atas penilaian risiko.
- CHR digambarkan per item. CHR yang sebenarnya adalah dokumen per unit eselon I yang berisi checklist dan banyak catatan, jadi pecah menjadi ChrDocument dan ChrNote.
- `statusPerbaikan` di RkaItem dan `statusTracker` di CHR adalah dua sumber status untuk hal yang sama. Sisakan satu, di ChrNote.
- `matchedFindingId` tunggal. Simpan beberapa temuan teratas beserta skor kemiripannya agar alasan bisa ditampilkan.
- `syncChrToSakti` mengasumsikan SAKTI menerima CHR lewat API. Asumsi ini belum terbukti; untuk sekarang ganti dengan ekspor dokumen CHR dan notifikasi ke Satker.
- Engine dan service sebaiknya dipindah ke component diagram terpisah, supaya class diagram hanya berisi entitas domain.

## Keputusan teknis

Prinsipnya: skor yang bisa dipertanggungjawabkan lebih penting daripada model yang canggih, karena keluaran NIRMALA dipakai sebagai dasar catatan resmi APIP.

**Rule-first, lalu hybrid.** Lapis pertama adalah library kriteria temuan yang deterministik, karena begitulah auditor sudah bekerja dan setiap flag harus bisa ditunjuk aturannya. Lapis kedua adalah skor berbobot untuk mengurutkan prioritas. LLM dan embedding hanya mengisi faktor yang butuh pemahaman bahasa: kemiripan uraian item terhadap temuan lama, kualitas uraian, dan saran kode BAS, semuanya dengan skema keluaran yang tetap. Faktor Revision Pattern diganti deteksi carry-over, yaitu RKA yang disalin dari tahun lalu.

**Tidak ada retrain di pilot.** Istilah "retrain AI" di user flow diganti dengan dua mekanisme yang lebih jujur: alasan dismiss memperkaya korpus temuan dan pengecualian, dan bobot faktor dikalibrasi ulang per siklus dari data keputusan reviewer.

**Bobot skor adalah hipotesis awal.** Karena skor sekarang hanya mengurutkan, bobotnya tidak perlu sempurna di awal. Cara mengujinya tetap sama: seberapa banyak item yang benar-benar mendapat CHR tahun lalu masuk ke N teratas versi NIRMALA (precision at N). Angka ini sekaligus bukti dampak yang terukur untuk juri.

**Ingestion lewat adapter berbasis file.** SAKTI tidak punya API resmi, jadi sumber data pilot adalah ekspor CSV (dengan ADK sebagai format kedua), memakai pipeline rekonsiliasi yang sudah dibangun untuk SIPEKA. Dibungkus di balik satu antarmuka sumber data, sehingga API bisa menggantikannya nanti tanpa mengubah domain. Setiap ingest idempoten berdasarkan hash file dan menghasilkan satu snapshot.

**PostgreSQL, bukan SQLite.** Beberapa reviewer menulis bersamaan, audit log harus append-only, dan embedding perlu disimpan dan dicari. PostgreSQL dengan pgvector menangani ketiganya dalam satu database, lengkap dengan constraint, JSONB untuk rincian faktor, dan tooling backup yang matang. Drizzle sudah mendukung PostgreSQL, jadi biaya pindahnya kecil.

**Stack lainnya dipertahankan.** React, Vite, TypeScript di frontend; Hono di API; kontrak tipe bersama. Tambahkan validasi skema di setiap batas sistem (input file, API, keluaran LLM).

**Akses berbasis peran dan wilayah.** RBAC dari deck ditambah pembatasan data: reviewer hanya melihat Satker yang ditugaskan kepadanya. Lapisan publik hanya membaca tabel agregat, tidak pernah tabel item.

**LLM eksternal diizinkan.** Narasumber mengonfirmasi data RKA boleh diproses lewat API LLM eksternal. Tetap kirim data minimum per panggilan (uraian, akun, volume, harga, tanpa identitas pejabat) dan simpan setiap prompt beserta keluarannya di audit log, supaya alasan sebuah skor bisa diperiksa ulang kapan pun.

## Decision log: yang diselaraskan

Sebagian besar rasa "berantakan" datang dari deck, user flow, dan class diagram yang menceritakan versi produk yang sedikit berbeda. Tabel ini mencatat versi mana yang dipakai mulai sekarang.

| Topik | Yang bertabrakan | Keputusan |
| --- | --- | --- |
| Pendekatan AI | Deck: skor deterministik. Class diagram: semantic matcher, anomaly detector, retrain | Hybrid: skor deterministik, LLM dan embedding hanya mengisi faktor |
| Sumber data | Deck: spreadsheet tanpa skema baku. Class diagram: API SAKTI dua arah | Adapter berbasis file; sinkronisasi CHR ke SAKTI dicoret sampai ada bukti jalurnya |
| Loop belum sesuai | User flow: kembali ke triage. Deck: Awaiting Revision | Kembali ke Menunggu Revisi; triage hanya untuk item baru atau berubah |
| Penutupan | User flow: auto-update dan close. Deck: human in the loop | Sistem mengusulkan, reviewer menutup |
| Feedback | Class diagram: menempel di CHR | Menempel di keputusan reviewer, termasuk dismiss |
| Database | Deck: SQLite | PostgreSQL dengan pgvector |
| Skala masalah | Deck: "jutaan baris" dan "ribuan item" di slide yang sama | Satu angka nyata dari data Kemen PU per tahun anggaran |
| Nama | SIPEKA reimagined vs NIRMALA | NIRMALA sebagai produk; SIPEKA disebut sebagai sistem yang ada sekarang |
| Unit CHR | Class diagram: CHR per item. Draf awal brief ini: per Satker | Per unit eselon I per tahap, sesuai Formulir H SE Irjen PU 02/SE/Ij/2024; catatan bisa merujuk Satker dan item |
| Detektor utama | Deck: skor 5 faktor sebagai mesin utama. Narasumber: auditor mencari dengan kriteria yang sudah mereka tahu | Rule-first: library kriteria temuan, temuan berulang, carry-over; skor untuk ranking |
| Pengguna tracker | Brief awal: reviewer saja | Reviewer dan PIC UKI eselon I, dengan tampilan per Satker |
| Posisi mesin | Dekat ke penyusun RAB atau ke auditor | Auditor di pilot; engine yang sama dibuka untuk penyusun di Fase 3 |
| Klaim dampak | Deck: memangkas waktu reviu | Reviu selesai H-3 tenggat ADK; kerja auditor bergeser dari mencari ke mengonfirmasi |

Dua catatan kecil soal brand. Kata "Laporan" di kepanjangan NIRMALA kurang pas karena RKA adalah rencana, bukan laporan; layak dicari kata lain berawalan L. Lalu sebaiknya hindari framing "kecurangan" atau fraud di pitch: NIRMALA menandai risiko inefisiensi untuk ditinjau manusia, dan framing itu lebih mudah diterima oleh calon pengguna di pemerintahan.

## Hasil validasi

Hipotesis utama terkonfirmasi, dan lebih kuat dari dugaan awal: pedoman reviu Itjen PU sendiri mengalihkan tanggung jawab atas catatan yang tidak diperbaiki ke unit eselon I, alih-alih memverifikasinya per item.

### Temuan dari SE Irjen PU 02/SE/Ij/2024

- Dasar hukum reviu sekarang PMK 62/2023 Pasal 59 ayat (1) huruf b, yang sudah diubah dengan PMK 107/2024.
- Reviu dilakukan atas permintaan Unor atau Biro PAKLN, dua kali per tahun anggaran: tahap pagu anggaran dan tahap alokasi anggaran.
- Program Kerja Reviu wajib disusun dengan pendekatan risiko, dan Satker yang diperiksa adalah sampel. Ini pintu masuk paling alami untuk risk scoring NIRMALA.
- CHR (Formulir H) dibuat per unit eselon I: checklist A sampai P dengan indikator Sesuai atau Tidak Sesuai plus catatan, lalu tanggapan dan rencana tindak lanjut eselon I, tanggapan Itjen, dan rekomendasi.
- Salah satu rekomendasi baku: eselon I bertanggung jawab penuh atas RKA yang tidak dapat direviu, tidak menjadi sampel, atau tidak diperbaiki sesuai CHR. Verifikasi tindak lanjut per item memang bukan bagian prosedur.
- Data yang dipakai reviewer: ADK SAKTI (RKA-K/L dan kertas kerja), Renja di KRISNA, i-emonitoring, SIMAK-BMN, RKBMN, dan standar biaya.

### Jawaban narasumber

| Pertanyaan | Jawaban | Implikasi |
| --- | --- | --- |
| Verifikasi tindak lanjut CHR | Revisi terlihat di SAKTI, tetapi kualitas perbaikannya belum tentu dicek. SIPEKA sendiri lahir agar Biro Keuangan punya jawaban saat ditanya BPK | Nilai jual bergeser dari "kami sudah berusaha" menjadi bukti per item yang bisa ditunjukkan ke BPK |
| Volume item dan catatan | Belum ada angka | Masih prioritas; tanpa angka, dampak belum terukur |
| Pelaku dan jendela reviu | Berlapis: internal Satker, lalu Itjen, Biro Keuangan, Biro PAKLN | ReviewCycle punya dua tahap; peran reviewer dibedakan per lapisan |
| Ekspor SAKTI | Tidak ada API resmi, biasanya CSV | Adapter CSV jadi jalur utama |
| CHR di SAKTI | Tidak ada, CHR beredar sebagai dokumen terpisah | NIRMALA menjadi system of record CHR |
| Histori CHR dan LHR | Sedang ditanyakan | Menentukan apakah faktor Historical Similarity dan kalibrasi bobot bisa dipakai di pilot |
| Data publik | Belum diputuskan | Rekomendasi ada di bagian Keputusan scope |
| LLM eksternal | Boleh | API LLM dipakai dengan data minimum dan prompt tercatat |
| Regulasi terbaru | Sudah dicek | PMK 62/2023 jo. PMK 107/2024 dan SE Irjen PU 02/SE/Ij/2024 |

### Temuan dari diskusi lanjutan dengan pembimbing

- Pengecekan ulang revisi Satker terhadap teguran reviu memang tidak ada: "selama ini tidak ada proses itu, seharusnya ada."
- Reviu berjalan manual baris per baris, dibagi per balai, sekitar satu minggu. Auditor mencari dengan kriteria yang sudah diketahui, misalnya item yang tidak boleh berada di akun 526 atau kaos seragam yang sudah dilarang.
- Tenggat ADK ke Kemenkeu sekitar tanggal 10 sampai 12, sementara auditor kadang baru selesai tanggal 11, sehingga Satker tidak sempat memperbaiki.
- Temuan berulang sering terjadi. Satker kerap menyalin ADK tahun lalu dan hanya mengganti judul, lalu tetap ditandatangani kepala Satker. Tenggat yang mendadak membuat Satker mengejar kuantitas di atas kualitas.
- Satu PIC eselon I bisa membawahi 219 Satker, dan diperkirakan hanya sekitar separuh yang benar-benar menindaklanjuti catatan.
- DJA menyaring RKA dengan mesinnya sendiri berdasarkan data historis PU dan bisa memblokir; rekomendasi reviu menolong Satker menghindari blokir.
- Setelah DIPA terbit, item yang sudah ditegur bisa dimunculkan lagi lewat revisi, dan barang di luar RAB bisa dibeli dengan menggeser pagu. Usulan memperluas reviu ke tahun berjalan tertahan karena UKI kekurangan SDM.
- Sanksi kini tanggung renteng: unit pusat yang tidak mengendalikan, seperti Biro Keuangan dan Biro BMN, ikut kena.
- Itjen PU sudah memiliki CACM yang menerima red flag pengadaan dari Inaproc.
- Pembimbing menyarankan scope cukup sampai Pra-DIPA, dengan pengembangan berikutnya disampaikan sebagai roadmap.

### Yang masih terbuka

- [ ] Angka volume: jumlah item RKA, jumlah catatan CHR, dan persentase yang ditindaklanjuti per tahun anggaran
- [ ] Klaim "sekitar 50% sudah terdeteksi": 50% dari apa, dan dibandingkan dengan hasil reviu manual yang mana
- [ ] Daftar kriteria yang dipakai auditor saat mencari: apakah sudah tertulis, dan bisa dijadikan isi awal library kriteria
- [ ] Tanggal pasti tenggat ADK dan jadwal reviu tahap alokasi TA 2027
- [ ] Ketersediaan histori CHR dan LHR dalam bentuk digital
- [ ] Satu contoh CHR asli yang sudah dianonimkan, untuk memodelkan ekspektasi terstruktur
- [ ] Struktur kolom CSV ekspor SAKTI dan apakah detailnya sampai level item
- [ ] Ketentuan LHR final terhadap pelaksanaan DIPA di PMK 62/2023

## Next steps

Validasi inti sudah selesai, jadi fokus bergeser ke angka dampak dan desain.

- [ ] Minta daftar kriteria temuan yang dipakai auditor, lalu jadikan isi awal library kriteria
- [ ] Pastikan angka before-after: durasi reviu manual hari ini, tenggat ADK, dan klaim 50% terdeteksi
- [ ] Kunci model data: ReviewCycle dua tahap, RkaSnapshot, KriteriaTemuan, ItemLineage, ChrNote dengan ekspektasi terstruktur
- [ ] Tambah satu layar wireframe untuk PIC UKI: progres tindak lanjut per Satker
- [ ] Revisi deck: dampak H-3 tenggat, UKI sebagai pengguna, deteksi rule-first, slide roadmap
- [ ] Siapkan dataset demo sintetis dengan struktur kolom CSV SAKTI, termasuk contoh item berulang dan RKA hasil salin

Jangan masukkan anekdot kasus di luar Kemen PU atau framing negatif tentang Satker ke pitch; cukup sebut kapasitas Satker bervariasi dan tenggatnya mendadak.

## Sumber

- [SE Irjen PU Nomor 02/SE/Ij/2024 tentang Pedoman Reviu RKA-K/L](https://itjen.pu.go.id/assets/berkas/peraturan/1729666414SE_Irjen_No__02-SE-Ij-2024_-_Pedoman_Reviu_RKA-KL_-_Final.pdf): prosedur, tahap, dan format CHR (Formulir H)
- [PMK 62 Tahun 2023](https://peraturan.bpk.go.id/Details/254789/pmk-no-62-tahun-2023): perencanaan dan pelaksanaan anggaran, dasar reviu RKA-K/L
- [PMK 107 Tahun 2024](https://peraturan.bpk.go.id/Details/315595): perubahan PMK 62/2023, termasuk ketentuan reviu RKA-K/L
- [SOP penyusunan RKA-K/L Kemenkumham](https://esopi-bpsdm.kemenkumham.go.id/download/cf9884e276d24f34dc15928e7f9dc0d9.pdf): contoh K/L lain yang memakai IHP dan CHR
- [PMK 117/PMK.02/2020](https://pasal.id/peraturan/permen/permenkeu-no-117-pmk-02-2020-tahun-2020): ketentuan lama LHR APIP final terhadap pelaksanaan DIPA
- [Nemesis, ASSAI](https://assai.id/nemesis/): cakupan dan pendekatan Nemesis
- Slide Rencana Penerapan Proyek SIPEKA (Kemen PU), deck MIA tim, user flow, class diagram, dan jawaban narasumber internal

SE Irjen PU dibaca utuh; rujukan PMK dibaca dari ringkasan dan cuplikan, jadi cek pasal persisnya sebelum dikutip di pitch.
