# Rencana Pengembangan NIRMALA (MVP + Backlog)

Status: **dikunci** · 9 Nov 2026 · menggantikan versi plan sebelumnya (rencana penuh berbasis brief)
Basis kode: branch `feat/alya`, commit `d9bca47` (dibangun dari PRD v1.0)

Urutan dokumen yang dibaca sebelum mengembangkan:
1. [concept-brief.md](concept-brief.md): acuan produk
2. [mvp-scope.md](mvp-scope.md): apa yang dibangun, user flow, daftar layar
3. [data-analysis.md](data-analysis.md): data apa yang ada dan bisa dipakai
4. [rule-catalog.md](rule-catalog.md): aturan dan faktor skor
5. [data-model.md](data-model.md): skema
6. Dokumen ini: urutan kerja

Alur kerja tim: **dokumen dikunci → desain UI di Pencil (`design/nirmala.pen`) berdasarkan [mvp-scope.md](mvp-scope.md) §5 → pengembangan.** Fase 0–2 di bawah tidak butuh desain UI, jadi boleh dimulai sambil desain berjalan. Fase 3–6 menunggu layar terkait selesai di Pencil.

## 1. Keputusan yang sudah dikunci

| # | Keputusan | Alasan |
|---|---|---|
| D-01 | **SQLite + Drizzle** untuk MVP; PostgreSQL + pgvector masuk backlog | Waktu; volume (~700 ribu baris) masih ringan untuk SQLite; pgvector baru dibutuhkan saat ada embedding. Drizzle membuat pindah DB nanti murah |
| D-02 | **Server sendiri + Cloudflare Tunnel**; target Workers / D1 dibuang | API memakai `node:sqlite` (tidak jalan di Workers); impor CSV besar; data pemerintah tetap di server sendiri. Cloudflare tetap dipakai untuk tunnel dan domain |
| D-03 | **Tidak ada integrasi SAKTI.** Data masuk lewat impor CSV berformat SIPEKA; simulasi sync CHR dibuang | Brief: sync dicoret; SAKTI tidak punya API resmi; kolom CSV `es1_*` = `d_dipa_revisi` |
| D-04 | **Scope MVP** sesuai [mvp-scope.md](mvp-scope.md) §2; sisanya backlog §5 | Waktu |
| D-05 | CHR **per eselon I per tahap**, dengan catatan sebagai sumber status | Brief; perubahan model terbesar tapi inti wedge |
| D-06 | Kategori catatan = 3 kategori SIPEKA + Lainnya; checklist A–P di backlog | Formulir H belum tersedia sebagai data |
| D-07 | Demo publik / juri memakai **seed sintetis**; data asli hanya di server sendiri | Privasi; [data-analysis.md](data-analysis.md) §5 |

## 2. Gap analysis terhadap MVP

### Pertahankan
- Stack React + Vite + TS, Hono, `@nirmala/shared`, validasi zod
- Login scrypt + cookie session ber-HMAC + security header
- Struktur skor yang bisa dijelaskan di `apps/api/src/services/riskScoring.ts` + test-nya
- Confirm / dismiss wajib beralasan dan tidak bisa diubah diam-diam
- Konsep CHR draf → terbit → terkunci + versi
- Audit log + halaman admin
- Halaman transparansi yang terpisah dari tabel internal
- Ekspor CSV laporan
- Copy "untuk ditinjau, bukan pelanggaran"

### Ubah
| Area | Dari | Ke |
|---|---|---|
| Skema | Raw SQL di `apps/api/src/db/store.ts` + `ensureColumn`, `schema.ts` tidak sinkron | Drizzle-SQLite sebagai satu sumber ([data-model.md](data-model.md)) |
| Skor | `scoreRisk()` tidak pernah dipanggil; skor di-hardcode di seed; detail item menghitung faktor ad-hoc (`apps/api/src/index.ts:158-161`) | Skor dihitung saat impor, disimpan per faktor, dan ditampilkan apa adanya |
| Referensi harga | Dicocokkan lewat unit saja (`apps/api/src/index.ts:155`) → salah barang | Perbandingan antar-Satker (F1) |
| RKA | Dokumen per Satker, item tanpa identitas stabil | Snapshot per eselon I, `item_key`, diff |
| CHR | Per item | Per eselon I + `chr_notes` |
| Tracker | Revisi diketik manual, cek harga saja, admin menutup | Cek ekspektasi dari snapshot baru, reviewer menutup |
| Peran | reviewer / leader / admin, tanpa batas data | + UKI, akses per eselon I |
| Dashboard / laporan / publik | Global, konstanta sintetis | Per siklus dan eselon I; publik dari `public_metrics` |
| API | Satu file `apps/api/src/index.ts` (249 baris) | Dipecah per modul + middleware akses |

### Buang
- Simulasi sync SAKTI:
  - endpoint `/api/chr/:id/sync`, `/sync/retry`, `/sync-logs` dan fungsi `syncChr`
  - tabel `integration_logs`
  - tombol di `apps/web/src/ChrEditor.tsx`
- `simulate-revision`, tabel `rka_revisions`, form revisi sintetis di `apps/web/src/Tracker.tsx`
- Penutupan tugas oleh admin
- Tabel `follow_up_tasks` dan `tracker_checks`
- `wrangler.jsonc` dan `apps/api/src/worker.ts`
- `apps/api/src/publicData.ts`
- Tabel `price_references`
- Faktor `revision_pattern`
- Migrasi SQLite lama `apps/api/drizzle/0000–0004`

### Tambah
- Siklus reviu
- Impor CSV + pencocokan item
- Katalog aturan + `rule_hits`
- `satker_finding_stats`
- `chr_notes` + ekspektasi + `follow_up_checks`
- Tampilan UKI per Satker
- Kategori alasan dismiss
- Validasi engine (kunci jawaban)
- `public_metrics`
- Generator seed sintetis
- Skrip impor data asli lokal

### Bug kecil yang ikut diperbaiki
- Tombol Keluar di sidebar tidak memanggil fungsi (`apps/web/src/App.tsx:79`).
- Copy landing page usang (`apps/web/src/App.tsx:41`).

## 3. Fase MVP

Setiap fase bisa di-merge sendiri, dan aplikasi tetap jalan di akhir tiap fase.

### Fase 0: Pembersihan (tidak butuh desain)
- Buang semua yang ada di daftar "Buang" yang tidak bergantung pada skema baru: simulasi SAKTI, Workers / D1, bagian README terkait.
  - Supaya tracker lama tetap hidup sampai Fase 5, follow-up task sementara dibuat saat CHR diterbitkan.
- Perbaiki logout dan copy landing page.
- README: arsitektur baru (D-01..D-03), cara menjalankan.

File:
- `apps/api/src/index.ts`, `apps/api/src/db/store.ts`
- `apps/web/src/{App,ChrEditor,Tracker}.tsx`
- `README.md`, `wrangler.jsonc`, `apps/api/src/worker.ts`

**Selesai bila:**
- Tidak ada lagi kata "simulasi SAKTI" di `apps/`.
- `npm run typecheck` dan `npm test` hijau.
- Alur lama (triage → CHR → terbit → tracker) masih bisa dijalankan.
- Tombol Keluar berfungsi.

### Fase 1: Skema Drizzle + peran + struktur API (tidak butuh desain)
- Tulis ulang `apps/api/src/db/schema.ts` sesuai [data-model.md](data-model.md).
- `apps/api/src/db/client.ts`: koneksi `node:sqlite` + WAL + foreign keys.
- Hapus migrasi lama, generate migrasi baru, lalu tambah migrasi SQL trigger append-only `audit_logs`.
- Hapus `store.ts`. Seed sementara: master data + akun demo (reviewer, uki, pimpinan, admin) + `user_scopes` + `dismiss_reasons` + `accounts` + `rules` (dari [rule-catalog.md](rule-catalog.md)).
- Pecah API:
  - `app.ts`, `server.ts`
  - `middleware/auth.ts`, `middleware/scope.ts`
  - `routes/*.ts`, `repositories/*.ts`
- Endpoint lama yang belum diporting sementara mengembalikan 501 dengan pesan jelas.
- `packages/shared`: peran, status catatan, skema ekspektasi (zod), DTO.
- Test (node:test + DB SQLite sementara):
  - auth
  - akses (reviewer eselon I A tidak bisa membaca eselon I B)
  - `UPDATE audit_logs` gagal

File:
- `apps/api/src/db/*`, `apps/api/drizzle/*`, `apps/api/drizzle.config.ts`
- `apps/api/src/{app,server}.ts`, `apps/api/src/{routes,middleware,repositories}/*`
- `packages/shared/src/*`, `.env.example`, `apps/api/test/*`

**Selesai bila:**
- `rm nirmala.sqlite && npm run db:migrate && npm run db:seed && npm run dev` jalan.
- Tidak ada raw SQL di luar migrasi.
- Test akses dan audit lulus.

### Fase 2: Siklus, impor CSV, seed sintetis (tidak butuh desain untuk backend)
- `apps/api/src/ingest/`:
  - `csvParser.ts`: streaming, skema baris zod mengikuti kolom `es1_*`
  - `matcher.ts`: algoritma [data-model.md](data-model.md) §4
  - `ingestService.ts`: hash → idempoten; transaksi; simpan item; diff; panggil hook deteksi (Fase 3) dan hook tracker (Fase 5)
- Endpoint siklus (CRUD admin) dan `POST /api/cycles/:id/snapshots` (multipart; reviewer / admin).
- `apps/api/scripts/generate-synthetic.ts` → `apps/api/fixtures/synthetic/{awal,revisi}/es1_9xxx1_2026.csv` (eselon I fiktif). Isinya kasus R01–R08, item perbaikan / bukan / dihapus.
- `apps/api/scripts/import-private.ts`: impor lokal dari `data/private` (CSV DIPA revisi + `d_dipa_awal` dari dump SQL) dan bangun `satker_finding_stats` dari PTL. Hanya membaca kolom yang diizinkan.
  - **Selesai (10 Nov 2026).** `--awal-sql` (dump → CSV per eselon I → snapshot v1), folder CSV revisi (v2), dan `--ptl` (xlsx → statistik). Pembaca dump SQL dan xlsx ditulis sendiri tanpa dependensi baru (`src/ingest/sqlDump.ts`, `xlsxReader.ts`, `ptlProfile.ts`) dan dites dengan data sintetis (`test/privateImport.test.ts`).
  - Hasil impor penuh ke DB terpisah (`--db`): v1 = 340.683 item (sama dengan angka di data-analysis §2.2), v2 = 258.217 item, 10 eselon I × 2 snapshot, 679 Satker. CSV terbesar (143.545 item) terimpor dalam ±44 detik.
  - Nama tidak pernah masuk DB: eselon I `Eselon I <kode>`, Satker `Satker <kode>`. Kolom catatan reviu `CHR_*`, "Pejabat Terkait", dan semua kolom uraian PTL tidak dibaca.
- `db:seed` = master data + impor fixture sintetis.

**Selesai bila:**
- File yang sama diimpor dua kali menghasilkan 1 snapshot.
- Diff fixture sesuai angka yang diharapkan (test).
- Item yang akunnya diganti di revisi tetap cocok (test).
- Baris header tersaring.
- CSV eselon I terbesar (±168 ribu baris) terimpor tanpa error di server.

### Fase 3: Aturan, skor, Risk Triage (butuh desain S3, S4, S5, S12a–b)
- `apps/api/src/detection/rules.ts`: evaluator 4 jenis aturan (fungsi murni) → `rule_hits`.
- `apps/api/src/detection/peer.ts`: median per (uraian, satuan) per siklus untuk ≥5 Satker.
- `apps/api/src/services/riskScoring.ts`: faktor F1–F5. Data kosong tetap tidak menaikkan skor.
- Pipeline dijalankan setelah impor, hanya untuk item `baru` / `berubah`.
- Bobot baru → versi config baru → tombol "hitung ulang".
- UI:
  - S3 impor
  - S4 triage
  - S5 detail + confirm / dismiss (confirm membuat catatan Draf di CHR eselon I, dibuat otomatis jika belum ada)
  - S12a katalog aturan
  - S12b bobot

**Selesai bila:**
- Pada fixture, setiap kasus R01–R08 ter-flag oleh aturan yang benar (test).
- Skor reproducible.
- Faktor yang tampil di S5 = yang tersimpan.
- Dismiss tanpa kategori ditolak.

### Fase 4: CHR per eselon I (butuh desain S6, S7)
- Endpoint CHR:
  - daftar per siklus
  - detail + catatan
  - edit catatan (hanya Draf)
  - rekomendasi
  - terbit (kunci, nomor, `chr_versions`, semua catatan → `menunggu_revisi`)
  - tanggapan eselon I (UKI)
  - adendum (versi baru)
- UI S6 editor dan S7 cetak (CSS print A4).

**Selesai bila:**
- Satu siklus × eselon I = satu CHR (constraint).
- Dua item dari dua Satker di eselon I yang sama masuk ke satu CHR.
- Setelah terbit, edit ditolak (409) kecuali lewat adendum.
- Halaman cetak memuat semua catatan.

### Fase 5: Smart Tracker + progres Satker (butuh desain S8, S9, S10)
- `apps/api/src/tracker/expectationChecker.ts`: fungsi murni per jenis ekspektasi ([mvp-scope.md](mvp-scope.md) §4.2).
- Hook impor: untuk catatan `menunggu_revisi` di eselon I itu → `follow_up_checks` → status `perlu_verifikasi`. Item baru / berubah di-skor ulang.
- Aksi:
  - setujui → `closed`
  - kembalikan → `menunggu_revisi` (alasan wajib)
  - justifikasi (UKI) → `dijustifikasi`
  - terima justifikasi → `closed`
  - CHR otomatis `completed` saat catatan terakhir ditutup
- Endpoint progres Satker (siap diajukan, terakhir bergerak).
- UI S8, S9, S10.
- Buang sisa tracker lama.

**Selesai bila:** skenario [mvp-scope.md](mvp-scope.md) §7 butir 2 lulus sebagai test end-to-end di API. Tidak ada jalur sistem menutup catatan.

### Fase 6: Dashboard, laporan, publik, deploy (butuh desain S2, S11, P1, P2, S12c–e)
- Dashboard per siklus / eselon I.
- Laporan: metrik proses + validasi engine (kunci jawaban) + CSV sesuai akses.
- `public_metrics` diisi saat siklus ditandai DIPA terbit. Eselon I dengan catatan < k digabung jadi "Lainnya". Endpoint publik hanya membaca tabel ini.
- Halaman publik P1 dan P2.
- Admin: pengguna + akses eselon I, siklus, audit log.
- Deploy:
  - `npm run build`, API serve hasil build web (satu proses)
  - systemd / pm2
  - `cloudflared` tunnel
  - backup harian file SQLite
  - `SESSION_SECRET` wajib di produksi
  - dokumentasi di `docs/deploy.md`

**Selesai bila:**
- [mvp-scope.md](mvp-scope.md) §7 terpenuhi seluruhnya.
- Aplikasi bisa diakses lewat domain tunnel.

## 4. Keputusan terbuka (butuh jawaban narasumber / tim)

Keputusan ini tidak memblokir pengembangan. Default dipakai sampai ada jawaban.

| ID | Pertanyaan | Default | Mempengaruhi |
|---|---|---|---|
| K1 | Arti tiap `KODE_BLOKIR` (2, A, 3, 7, …) | R08 hanya aktif di snapshot revisi | R08, F2 |
| K2 | Validasi aturan R01, R03, R05, R06 oleh auditor (lihat catatan validasi di [rule-catalog.md](rule-catalog.md)) | Aktif semua; R06 dengan batas kapitalisasi | Isi katalog |
| K3 | Boleh demo ke narasumber / juri dengan data asli? | Tidak; sintetis | Demo |
| K4 | Batas minimum kapitalisasi BMN terbaru | Parameter, diisi setelah dicek | R06 |
| K5 | Kapan catatan `CHR_AKUN` disampaikan ke Satker (untuk klaim "81% belum diperbaiki") | Klaim belum dipakai di pitch | Pitch |
| K6 | Format nomor CHR resmi | `CHR/<BAES1>/<TA>/<tahap>/<urut>` | S6, S7 |
| K7 | Ambang penggabungan eselon I di halaman publik + izin PPID | k = 5 catatan | P2 |
| K8 | Daftar kategori alasan dismiss | Daftar di [data-model.md](data-model.md) | S5 |

## 5. Backlog setelah MVP

Diurutkan dari yang paling berdampak. Tiap butir merujuk bagian brief.

1. **PostgreSQL + pgvector.** Pindah driver Drizzle; trigger audit versi Postgres. Ini prasyarat butir 2.
2. **Faktor LLM / embedding.** Kemiripan temuan historis, kualitas uraian, saran akun. Keluaran berskema tetap; prompt dan keluaran disimpan di `llm_calls`. (Brief: Keputusan teknis)
3. **Lineage lintas tahun.** Temuan berulang dan RKA hasil salin (faktor carry-over), setelah data TA sebelumnya tersedia. Tabel `item_lineage`.
4. **Formulir H penuh.** Checklist A–P (Sesuai / Tidak Sesuai + catatan), tanggapan Itjen, ekspor DOCX sesuai template SE Irjen PU 02/SE/Ij/2024.
5. **Tabel SBM resmi** + aturan `cost_cap`, menggantikan / melengkapi F1.
6. **Peran Satker** (lihat catatan sendiri, kirim justifikasi), akses per Satker, dan lapisan reviewer (Itjen / Biro PAKLN / Biro Keuangan) + catatan CHP.
7. **Kalibrasi bobot** dari keputusan reviewer per siklus + precision@N lintas tahun.
8. **Notifikasi** email / WhatsApp ke PIC UKI.
9. **Fase 2 brief: Revisi POK.** Catatan closed dipantau di setiap revisi (`monitor_after_close`), memakai kolom `POK_NILAI_*`.
10. **Fase 3 brief: early warning penyusun RAB.** Katalog aturan dibuka sebagai service.
11. **Integrasi CACM** (red flag pengadaan) dan adapter ADK.
