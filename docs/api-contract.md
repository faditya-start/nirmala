# Kontrak API Fase 3-6

Status: **draf untuk ditinjau** · 10 Nov 2026 · Fase 6 backend selesai (asumsi A55-A63)
Terkait: [plan.md](plan.md) · [mvp-scope.md](mvp-scope.md) · [data-model.md](data-model.md) · [rule-catalog.md](rule-catalog.md) · [../design/SCREENS.md](../design/SCREENS.md)

Dokumen ini adalah kontrak antara agen backend (`apps/api`) dan agen UI (`apps/web`). Tipe-nya ada di `packages/shared/src/contracts/*.ts` dan diekspor dari `@nirmala/shared`:

- **Body dan query** punya skema zod (`...BodySchema`, `...QuerySchema`). API wajib memvalidasi dengan skema itu, dan UI boleh memakainya untuk validasi form.
- **Respons** berupa tipe TypeScript (`...Response`, `...Dto`). Nama tipe disebut di tiap endpoint.
- Bila dokumen ini dan kode di `contracts/` berbeda, **kode menang**; laporkan selisihnya agar dokumen diperbaiki.

Penanda endpoint: **NEW** = belum ada di `apps/api`. **EXISTS** = sudah ada (fase 0-2); bila diberi "diperluas", hanya menambah bidang atau query, tidak ada bidang lama yang berubah arti.

## Daftar isi

1. Konvensi
2. Aturan bisnis dan mesin status
3. Endpoint fase 3
4. Endpoint fase 4
5. Endpoint fase 5
6. Endpoint fase 6
7. Peta layar -> endpoint -> DTO
8. Perubahan skema yang dibutuhkan
9. Pertanyaan terbuka dan asumsi

---

## 1. Konvensi

### 1.1 Umum

| Hal | Aturan |
|---|---|
| Format | JSON (`Content-Type: application/json`), kecuali unggah CSV (multipart) dan ekspor CSV |
| Uang | integer rupiah. Tidak ada desimal |
| Waktu | epoch ms (integer). Tanggal tenggat/DIPA juga epoch ms; body boleh mengirim string `YYYY-MM-DD` (lihat `dateInputSchema`) |
| Id | string buram. Jangan menebak formatnya |
| Rasio / persen | persen = bilangan bulat 0-100 kecuali dinyatakan lain; rasio = bilangan desimal |
| Nilai kosong | `null` (bukan string kosong). Query kosong `?x=` sama dengan tidak dikirim |
| Bahasa | Pesan galat Indonesia. Kode enum (`menunggu_revisi`, `R01`) bukan teks tampilan; label dipegang UI |
| Presentasi | DTO tidak membawa kalimat tampilan. Teks yang berasal dari data (uraian item, nama Satker, alasan aturan, penjelasan faktor dari engine) dikirim apa adanya |
| Nama tipe | Semua nama baru unik di `@nirmala/shared`; tidak ada yang memakai ulang nama di `base.ts` |

### 1.2 Autentikasi dan peran

- Sesi lewat cookie `nirmala_session` (httpOnly, sudah ada). Semua `/api/*` selain `/api/health`, `/api/auth/login`, dan `/api/public/*` mewajibkan sesi.
- Peran: `reviewer`, `uki` (PIC UKI), `leader` (Pimpinan), `admin`. Di tabel endpoint ditulis **R / U / L / A**.
- `leader` selalu **baca saja**: tidak boleh memanggil endpoint yang mengubah data.
- `admin` boleh semua aksi `reviewer` dan `uki` di semua eselon I (matriks akses layar mvp-scope.md bagian 5).

### 1.3 Scope eselon I

`context.get("orgScope")` yang sudah ada: `null` = semua eselon I (`leader`, `admin`); array id = hanya eselon I itu (`reviewer`, `uki`, dari `user_scopes`); array kosong = tidak melihat apa pun.

| Situasi | Perilaku |
|---|---|
| Daftar/agregat tanpa filter eselon I | Otomatis dibatasi ke scope. Scope kosong -> hasil kosong (bukan galat) |
| Filter `organizationUnitId` di luar scope | **403** `Anda tidak memiliki akses ke eselon I ini.` |
| `GET/POST ... /:id` untuk entitas milik eselon I di luar scope | **403** dengan pesan yang sama (selaras dengan `GET /api/cycles/:id/snapshots/:snapshotId` yang sudah ada). 404 hanya bila id tidak ada |
| Peran tidak diizinkan | **403** `Peran Anda tidak memiliki akses ke sumber daya ini.` |

### 1.4 Galat

Selalu `{ "error": "<pesan Indonesia>" }` (`ApiError`). Pesan validasi = pesan pertama dari zod (lihat pola endpoint yang sudah ada).

| Status | Dipakai untuk |
|---|---|
| 400 | Body/query tidak valid, aturan input dilanggar (mis. alasan dismiss kosong) |
| 401 | Belum masuk / sesi kedaluwarsa. Pesan: `Silakan masuk untuk melanjutkan.` |
| 403 | Peran atau scope tidak mencukupi |
| 404 | Id tidak ada. Halaman publik: siklus tidak ada atau DIPA belum terbit juga **404** (tidak membocorkan keberadaan) |
| 409 | Konflik status/keadaan: transisi tidak diizinkan, dokumen terkunci, duplikat, sudah diputuskan |
| 413 | Berkas unggahan terlalu besar (sudah ada, maks. 500 MB) |
| 501 | Dipakai `legacy.ts` selama endpoint belum diporting. Hapus prefix itu dari `legacyRoutes` saat fasenya selesai |

Halaman UI "Akses ditolak" (`JD30D`) muncul dari 403; state kosong dari hasil kosong bukan galat.

### 1.5 Daftar berhalaman, urutan, filter

- Daftar besar: query `page` (mulai 1, default 1) dan `pageSize` (default 25, maks. 100) -> `paginationQuerySchema`.
- Respons: `{ items: T[], pagination: { page, pageSize, total, totalPages } }` (`Paginated<T>`). Daftar yang tidak berhalaman memakai nama koleksi (`cycles`, `users`, `logs`, `rules`) sesuai kode yang sudah ada.
- `sort` memakai enum per endpoint, `dir` = `asc|desc`. Pengurutan selalu diakhiri tie-breaker `id` supaya halaman stabil.
- Parameter filter yang sama dipakai oleh daftar, hitungan ringkasan, dan navigasi; tiap endpoint menyebut filter mana yang dikecualikan dari hitungan.
- `true|false|1|0` untuk boolean di query (`queryBoolean`).
- Hitungan `total` harus akurat (tabel 12.702 baris, 1.155 halaman pada desain). Implementasi disarankan dengan `COUNT(*)` terindeks; `LIMIT/OFFSET` cukup untuk MVP.

### 1.6 Audit log

Setiap endpoint yang **mengubah data** menulis tepat satu baris `audit_logs` dalam transaksi yang sama (`recordAudit`), dengan `action` dari `AUDIT_ACTIONS` dan `entityType` dari `AUDIT_ENTITY_TYPES` (admin.ts). `before`/`after` berisi status atau nilai yang berubah. Kegiatan sistem (cek otomatis setelah impor) memakai `actorUserId = null` (tampil "Sistem"). Penutupan catatan massal menulis satu baris `note.approved` per catatan.

### 1.7 Job asinkron (impor besar, hitung ulang)

Impor ±168 ribu baris dan hitung ulang skor tidak boleh membuat browser menunggu satu request:

1. UI memanggil endpoint dengan `async=true` (impor) atau endpoint hitung ulang (selalu asinkron).
2. Server membuat job di memori, menjawab **202** `{ jobId }`.
3. UI memanggil `GET /api/jobs/:jobId` tiap 1 detik; respons `JobDto` memuat `steps`, `rowsDone`, `rowsTotal`, `percent`, dan `result` saat `selesai`.
4. Job hilang bila server restart (404). UI lalu memuat ulang daftar snapshot; impor yang terpotong dibatalkan oleh transaksi.
5. Satu job impor per (siklus, eselon I) pada satu waktu; yang kedua -> **409**.

Impor tanpa `async` tetap sinkron (perilaku sekarang, dipakai test dan berkas kecil).

---

## 2. Aturan bisnis dan mesin status

### 2.1 Status catatan (sumber status = `chr_notes.status`)

```
(baru)             --konfirmasi (R/A)-------------> draf
draf               --terbitkan CHR (R/A)----------> menunggu_revisi
(baru)             --adendum_tambah (R/A)---------> menunggu_revisi
menunggu_revisi    --cek_otomatis (SISTEM)--------> perlu_verifikasi
perlu_verifikasi   --setujui (R/A)----------------> closed
perlu_verifikasi   --kembalikan (R/A)-------------> menunggu_revisi
dijustifikasi      --kembalikan (R/A)-------------> menunggu_revisi
menunggu_revisi    --justifikasi (U/A)------------> dijustifikasi
perlu_verifikasi   --justifikasi (U/A)------------> dijustifikasi
dijustifikasi      --terima_justifikasi (R/A)-----> closed
```

Tabel kebenaran ada di kode: `NOTE_TRANSITIONS` dan `canTransition(action, from, role)` di `contracts/tracker.ts`. API **wajib** memakai fungsi itu untuk setiap perubahan status; UI memakainya untuk menampilkan/menonaktifkan tombol (selain `permissions` dari server).

| Aksi | Dari | Ke | Oleh | Syarat |
|---|---|---|---|---|
| `konfirmasi` | (baru) | `draf` | R, A | CHR eselon I berstatus `draft`; item belum diputuskan |
| `terbitkan` | `draf` | `menunggu_revisi` | R, A | Satu transaksi untuk semua catatan draf saat CHR diterbitkan; minimal satu catatan |
| `adendum_tambah` | (baru) | `menunggu_revisi` | R, A | CHR `issued`/`completed`; lewat adendum |
| `cek_otomatis` | `menunggu_revisi` | `perlu_verifikasi` | **Sistem** | Snapshot revisi eselon I diimpor; satu baris `follow_up_checks` per catatan. Catatan yang sudah `perlu_verifikasi` hanya mendapat baris cek baru, statusnya tetap |
| `setujui` | `perlu_verifikasi` | `closed` | R, A | Boleh walau hasil cek bukan `terpenuhi` (keputusan reviewer, tercatat) |
| `kembalikan` | `perlu_verifikasi`, `dijustifikasi` | `menunggu_revisi` | R, A | Alasan wajib (min. 5 karakter); disimpan di `follow_up_checks.reviewer_note` (cek terbaru) dan di audit `after.reason` |
| `justifikasi` | `menunggu_revisi`, `perlu_verifikasi` | `dijustifikasi` | U (eselon I miliknya), A | Alasan Satker wajib (min. 10 karakter) -> `chr_notes.justification`, `justified_by` |
| `terima_justifikasi` | `dijustifikasi` | `closed` | R, A | - |

**Aturan keras: sistem tidak pernah menutup catatan.** Satu-satunya aktor `sistem` adalah `cek_otomatis`, yang tidak pernah menghasilkan `closed`. `closed` hanya dapat dicapai oleh `setujui` dan `terima_justifikasi`, yang membutuhkan pengguna R/A. Endpoint tidak boleh menyediakan jalur lain (tidak ada "auto-close", tidak ada cron). Test API wajib memeriksa: setelah impor snapshot revisi, tidak ada catatan berstatus `closed` yang bukan hasil aksi pengguna.

Pada `closed`: `closed_by` dan `closed_at` diisi. Pada `kembalikan`: `closed_*` tetap kosong.

### 2.2 Status dokumen CHR

| Status | Arti | Perubahan |
|---|---|---|
| `draft` | Semua catatan `draf`; catatan dan rekomendasi boleh diubah | Dibuat otomatis saat konfirmasi pertama di eselon I itu, atau lewat `POST /api/chr` |
| `issued` | Terbit dan **terkunci** | `POST /api/chr/:id/issue`; setelah itu edit catatan / rekomendasi -> **409**; yang diizinkan hanya tanggapan UKI dan adendum |
| `completed` | Semua catatan `closed` | Otomatis, lihat 2.4 |

### 2.3 Penomoran CHR

`CHR/<BAES1>/<TA>/<tahap>/<urut>`, mis. `CHR/90001/2026/alokasi/001`. `BAES1` = `organization_units.code`, `TA` = `fiscal_year`, `tahap` = `stage` (`pagu|alokasi`), `urut` = nomor urut tiga digit CHR yang diterbitkan pada siklus yang sama (semua eselon I), dimulai 001, ditentukan saat terbit di dalam transaksi terbit (`MAX(urut)+1`). Pembuat nomor: `buildChrNumber`; pembaca: `parseChrNumber` (`contracts/chr.ts`). Nomor dibuat sekali saat terbit dan tidak berubah oleh adendum. Desain memakai contoh `014/CHR/2026`; format di dokumen ini yang berlaku (K6 di plan.md).

### 2.4 "CHR selesai" dan "Satker siap diajukan"

Diturunkan dari `chr_notes.status` (data-model.md bagian 6):

- **CHR selesai**: semua catatan CHR itu `closed`. Dalam transaksi yang sama dengan penutupan catatan terakhir (`setujui`, `terima_justifikasi`, atau setujui massal), API mengubah `chr_documents.status` menjadi `completed` dan mengisi `completed_at`. Bila adendum kemudian menambah catatan, status kembali `issued` dan `completed_at` dikosongkan. Audit: `chr.completed`.
- **Satker siap diajukan** (per siklus): Satker punya **>= 1 catatan pada CHR yang sudah terbit** dan **semua** catatan itu `closed`. Satker tanpa catatan terbit = `tidak_ada_catatan` dan tidak dihitung di "X dari Y Satker" (penyebut Y = Satker yang punya catatan terbit). Catatan `draf` tidak dihitung. Satker dihitung per `chr_notes.work_unit_id`.
- **Terakhir bergerak** (S10): waktu terbaru dari perubahan status catatan Satker, pengisian justifikasi, cek otomatis, dan impor snapshot eselon I yang memuat item Satker itu; `null` bila Satker tidak punya catatan terbit.

### 2.5 Alur saat snapshot diimpor (urutan wajib, dalam satu transaksi)

1. Parse dan simpan item, `item_key`, pencocokan, `diff_summary` (fase 2). Baris yang tidak valid **dilewati** dan dicatat di `row_errors`, bukan membatalkan impor (kecuali kolom wajib tidak ada, BAES1/TAHUN tidak konsisten, atau tidak ada item sama sekali -> 400). Tiap galat: nomor baris, kolom, nilai mentah, alasan (`ImportRowError`).
2. **Deteksi (fase 3):** untuk item `baru`/`berubah` (semua item di v1) jalankan aturan aktif -> `rule_hits`, lalu skor 5 faktor dengan `risk_config` aktif -> `risk_assessments`. Item `tetap` mewarisi `rule_hits` dari padanannya dan memperoleh `risk_assessments` dengan F5 = 0 (boleh dihitung ulang penuh; yang wajib: hits sama dengan padanan, F5 = 0). R08 hanya dievaluasi di snapshot revisi (`params.onlyRevision`).
3. **Tracker (fase 5), hanya v >= 2:** untuk setiap catatan `menunggu_revisi` pada CHR eselon I itu (siklus yang sama): cari item padanan di snapshot baru (rantai `previous_item_id` dari item dasar catatan; bila tidak ada -> `item_tidak_ditemukan`), jalankan cek ekspektasi (2.6), simpan `follow_up_checks`, ubah status ke `perlu_verifikasi`. Catatan `perlu_verifikasi` mendapat baris cek baru. Catatan `dijustifikasi` tidak dicek.
4. Tulis `audit_logs`: `snapshot.imported` (aktor = pengimpor) dan, bila ada catatan dicek, satu `note.checked` per catatan (aktor sistem).
5. Hitung `import_duration_ms`.

Bila langkah 2 atau 3 gagal, seluruh impor dibatalkan (transaksi) dan job `gagal`. Hook ada di `IngestHooks.afterSnapshot` (sudah tersedia).

### 2.6 Hasil cek dan bukti per ekspektasi

Mengikuti mvp-scope.md bagian 4.2. `Evidence.fields[]` selalu membandingkan **item dasar** catatan (`before`, dari snapshot saat dikonfirmasi) dengan **item padanan** di snapshot yang dicek (`after`).

| Ekspektasi | `terpenuhi` bila | Field di bukti | Catatan |
|---|---|---|---|
| `ganti_akun → X` | padanan ada dan `account_code = X` | `account_code`, `total_amount`, `description` | `expected` = X |
| `hapus_item` | padanan tidak ada, atau `total = 0` | `total_amount`, `description` | `after = null` bila tidak ada; hasil `terpenuhi` |
| `turunkan_nilai` | `unit_price <= maxUnitPrice` dan/atau `total_amount <= maxTotal` | `unit_price`, `total_amount` (hanya yang punya batas), `quantity` | `expected` = batas |
| `rinci_item` | `quantity > 1` dan satuan bukan paket/LS, atau uraian berubah dan `VOL_KEG_*` terisi | `quantity`, `unit`, `description` | |
| `manual` | tidak pernah; hasil selalu `data_tidak_cukup` | `blokir_code` bila R08, selain itu kosong | `evidence.note` menjelaskan tidak bisa dicek otomatis |
| (semua) padanan tidak ditemukan dan ekspektasi bukan `hapus_item` | - | semua field `after = null` | hasil `item_tidak_ditemukan` |
| (semua) data kunci kosong | - | - | hasil `data_tidak_cukup` |

Hasil yang valid: `terpenuhi`, `belum_terpenuhi`, `data_tidak_cukup`, `item_tidak_ditemukan` (`CHECK_RESULTS`). Hasil hanya usulan.

### 2.7 Keputusan item (triage) dan pewarisan

`reviewer_decisions` unik per `rka_items.id`. Status keputusan item = keputusannya sendiri; bila tidak ada **dan** `change_type = tetap` **dan** padanannya (`previous_item_id`) punya keputusan, item mewarisinya (`decisionInherited = true`, read-only); selain itu `belum_ditinjau`. Item `berubah` selalu perlu ditinjau ulang. Konfirmasi membuat catatan yang menunjuk item (`chr_notes.rka_item_id`) dan Satker-nya. Satu item hanya boleh punya satu catatan dari konfirmasi.

### 2.8 Agregat publik

`public_metrics` diisi saat admin menandai DIPA terbit (`POST /api/cycles/:id/dipa-issued`) dalam transaksi yang sama, dari catatan terbit pada siklus itu (draf tidak dihitung), per (eselon I, kategori):

- `notes_total` = jumlah catatan terbit; `closed_before_deadline` = jumlah `closed` dengan `closed_at <= adk_deadline`; `median_days_to_close` = median hari (terbit -> closed) dari catatan closed di sel itu.
- Eselon I dengan total < k (`PUBLIC_MIN_NOTES`, default 5) digabung ke baris `Lainnya`; aturan tambahan di `contracts/publik.ts` agar baris `Lainnya` tidak bisa menunjuk satu unit.
- **Baris rekap siklus**: satu baris dengan `organization_unit_label = '__TOTAL__'` dan `category = '__ALL__'` berisi total siklus (`notes_total`, `closed_before_deadline`, dan median keseluruhan). Median keseluruhan tidak dapat diturunkan dari median per sel. Endpoint publik tidak pernah menampilkan baris ini sebagai baris tabel.
- Endpoint publik hanya membaca `public_metrics` (+ `review_cycles` untuk daftar siklus). Tidak ada query ke `rka_items`, `chr_notes`, atau `work_units`.

### 2.9 Aturan "Perlu tindakan" dan badge nav

Dihitung untuk siklus yang dipilih (default: siklus `aktif` terbaru) dan scope pengguna. Lihat `NeedsActionResponse` (auth.ts).

| Peran | Item (urut tampil) |
|---|---|
| reviewer, admin | (1) catatan `perlu_verifikasi` -> `/tracker?status=perlu_verifikasi`; (2) CHR `draft` yang punya >= 1 catatan -> `/chr` atau `/chr/:id`; (3) item kena aturan belum ditinjau -> `/triage?onlyFlagged=true&decision=belum_ditinjau` |
| uki | (1) catatan `menunggu_revisi` -> `/tracker?status=menunggu_revisi`; (2) catatan `perlu_verifikasi` dengan hasil cek terakhir bukan `terpenuhi` -> `/tracker?status=perlu_verifikasi`; (3) CHR terbit yang `unit_response` masih kosong -> `/chr/:id` |
| leader | kosong, `count = 0` |

`count` = jumlah `items[].count`; item dengan count 0 tidak dikirim. `GET /api/nav-counts` memberi angka kecil di sidebar: `triageUnreviewed` (item 3 di atas, untuk reviewer/admin) dan `trackerPending` (catatan `perlu_verifikasi`, untuk reviewer/uki/admin).

---

## 3. Endpoint fase 3 (impor, aturan dan skor, Risk Triage, admin aturan dan bobot)

Layar: S3, S4, S5, S12a, S12b, dan shell. Kolom **Peran** memakai R/U/L/A (lihat 1.2).

### 3.1 Auth, shell, dan referensi

#### `GET /api/auth/me` · EXISTS (diperluas) · fase 3
- **Peran:** semua (belum masuk -> `{ user: null, organizationUnits: [] }`, 200, seperti sekarang).
- **Respons:** `MeResponse` = `{ user: SessionUserDetail | null, organizationUnits }`. `user` menambah `username`, `unitLabel` (footer sidebar, mis. "Reviewer · Itjen"), `scopeOrganizationUnitIds` (`null` = semua).
- **Layar:** shell semua layar internal, S1.

#### `POST /api/auth/login` · EXISTS (perilaku diperluas) · fase 3
- Body `{ username, password }`, respons `AuthResponse` tetap. Perilaku baru: pengguna `active = false` ditolak **401** `Username atau password tidak valid.` (tidak membedakan) dan dicatat `auth.login_failed`. Layar: S1 (`k2eVzx`, galat `G32yLt`).

#### `GET /api/needs-action` · NEW · fase 3 (item CHR/tracker terisi bertahap di fase 4-5)
- **Peran:** R, U, L, A. **Query:** `cycleId?` (`needsActionQuerySchema`).
- **Respons:** `NeedsActionResponse` = `{ count: number; items: { label: string; href: string; count: number }[] }`. Aturan di 2.9.
- **Galat:** 401. Siklus tidak ada -> 404. Tanpa siklus aktif -> `{ count: 0, items: [] }`.
- **Layar:** header "Perlu tindakan" di semua layar internal. Polling disarankan tiap 60 detik dan setelah aksi.

#### `GET /api/nav-counts` · NEW · fase 3
- **Peran:** R, U, L, A. **Query:** `cycleId?`. **Respons:** `NavCountsResponse` = `{ triageUnreviewed, trackerPending }`.
- **Layar:** badge nav "Risk Triage" (83) dan "Smart Tracker" (3).

#### `GET /api/work-units` · NEW · fase 3
- **Peran:** R, U, L, A. **Query:** `organizationUnitId?` (`workUnitListQuerySchema`). **Scope:** eselon I dalam scope.
- **Respons:** `{ workUnits: WorkUnitDto[] }` urut kode. Maks. ±220 baris, tanpa halaman.
- **Layar:** filter Satker S4 dan S8; pilihan Satker di catatan manual S6.

#### `GET /api/references/dismiss-reasons` · NEW · fase 3
- **Peran:** semua. **Respons:** `{ reasons: DismissReasonDto[] }` (hanya `active = true`, urut kode seed). **Layar:** S5 (dropdown dismiss), S11 (label).

#### `GET /api/references/accounts` · NEW · fase 3
- **Peran:** semua. **Query:** `q?`, `limit?` (`accountListQuerySchema`). **Respons:** `{ accounts: AccountDto[] }`. **Layar:** editor ekspektasi `ganti_akun` (S5, S6), nama akun di S5.

### 3.2 Siklus dan impor (S3)

Endpoint siklus yang sudah ada tetap; body-nya kini punya skema bersama (`createCycleBodySchema`, `updateCycleBodySchema`).

#### `GET /api/cycles` · EXISTS · fase 3 (dipakai S3, pemilih siklus)
- Peran R/U/L/A. Respons `CycleListResponse` = `{ cycles: ReviewCycleDto[] }`. State "Belum ada siklus" (`TzMsS`) = `cycles: []`. `ReviewCycleDto` tidak berubah (`adkDeadline`, `dipaIssuedAt`, `status`). "Sisa N hari" dihitung UI dari `adkDeadline` (atau lihat `daysToAdkDeadline` di dashboard/satker).

#### `POST /api/cycles`, `PUT /api/cycles/:id`, `DELETE /api/cycles/:id` · EXISTS · fase 6 (S12d)
Lihat bagian 6.5. Tidak berubah selain: `PUT` dengan `dipaIssuedAt` non-null -> **400** `Gunakan "Tandai DIPA terbit" agar agregat publik ikut dibuat.`

#### `GET /api/cycles/:id/import-overview` · NEW · fase 3
- **Peran:** R, U, L, A (UKI/Pimpinan "lihat"). **Scope:** baris hanya untuk eselon I dalam scope.
- **Respons:** `ImportOverviewResponse` = `{ cycle, rows: ImportOverviewRow[], canImport }`. Tiap baris: `organizationUnit`, `satkerCount` ("6 Satker sampel"), `snapshots: SnapshotDto[]` (urut `versionNo`), `nextVersionNo`, `nextLabel`. `canImport = (R|A) && cycle.status = 'aktif'`.
- **Galat:** 404 siklus tidak ada. **Layar:** S3 tabel "Snapshot · TA 2026 Alokasi" (`hsNnG`), state belum ada snapshot (`ptHvP`; semua `snapshots: []`).

#### `GET /api/cycles/:id/snapshots` · EXISTS (diperluas) · fase 3
- Respons `SnapshotListResponse` = `{ snapshots: SnapshotDto[] }`. Bidang baru di tiap snapshot: `importedByUserId`, `importedByName`, `rowErrorCount`, `importDurationMs`. Urut kode eselon I lalu `versionNo` menurun (tidak berubah).

#### `GET /api/cycles/:id/snapshots/:snapshotId` · EXISTS (diperluas) · fase 3
- Respons `SnapshotResponse` = `{ snapshot: SnapshotDto }`. 404 bila snapshot bukan milik siklus; 403 di luar scope (sudah ada).

#### `GET /api/cycles/:id/snapshots/lookup?fileHash=` · NEW · fase 3
- **Pendaftaran rute:** daftarkan `/:id/snapshots/lookup` **sebelum** `/:id/snapshots/:snapshotId`, kalau tidak `lookup` terbaca sebagai `snapshotId`.
- **Peran:** R, A. **Query:** `fileHash` SHA-256 hex huruf kecil (`snapshotLookupQuerySchema`; UI menghitungnya dengan `crypto.subtle.digest` sebelum unggah).
- **Respons:** `SnapshotLookupResponse` = `{ snapshot: SnapshotDto | null }`. Snapshot di luar scope pengguna -> dianggap `null`. Hash milik siklus/eselon lain -> `null` (server tetap menolak saat unggah dengan 409).
- **Layar:** dialog impor, state "File sama sudah pernah diimpor" (`YBiRO`): tombol berubah menjadi "Lihat snapshot v2".

#### `POST /api/cycles/:id/snapshots` · EXISTS (diperluas) · fase 3
- **Peran:** R, A. **Scope:** eselon I hasil BAES1 harus dalam scope (403 sudah ada).
- **Request:** `multipart/form-data`: `file` (CSV, wajib) + field opsional `organizationUnitId`, `versionNo`, `async` (`snapshotUploadFieldsSchema`). Server menentukan eselon I/tahun dari isi CSV; bila `organizationUnitId` atau `versionNo` dikirim dan tidak cocok -> **400** `Berkas ini milik eselon I lain.` / `Nomor versi yang diharapkan (v2) tidak sama dengan versi berikutnya (v3).`
- **Respons sinkron:** **201** baru atau **200** `alreadyImported: true` -> `SnapshotUploadResponse` = `{ snapshot: SnapshotDto, alreadyImported }`. `snapshot` kini `SnapshotDto` penuh (superset bidang lama).
- **Respons `async=true`:** **202** `{ jobId }` (`SnapshotUploadAcceptedResponse`); hasil lewat `GET /api/jobs/:jobId` (`ImportJobDto`, `result` = `SnapshotUploadResponse`). Hash yang sudah ada -> tetap **200** sinkron dengan `alreadyImported: true` (tanpa job).
- **Galat:** 400 (CSV tidak valid, kolom wajib hilang, tahun beda dengan siklus), 403 scope, 404 siklus, 409 (siklus `selesai`; berkas sama sudah diimpor ke siklus/eselon I lain; job impor lain berjalan), 413.
- **Efek samping:** tabel `rka_documents`, `rka_items`, `work_units` (Satker baru), `rule_hits`, `risk_assessments`, dan (v >= 2) `follow_up_checks` + status `chr_notes`; audit `snapshot.imported` (+ `note.checked`). Lihat 2.5.
- **Layar:** S3 dialog impor (`JXlM5`), state berjalan (`a72TMw`).

#### `GET /api/jobs/:jobId` · NEW · fase 3
- **Peran:** pembuat job, atau A. **Respons:** `ImportJobDto` atau `RecalculateJobDto` (`JobDto<Kind, Result>`): `status` `berjalan|selesai|gagal`, `steps` (`baca_file`, `saring_header`, `simpan_item`, `aturan_dan_skor`), `rowsDone`, `rowsTotal`, `percent`, `error`, `result`.
- **Galat:** 404 job tidak ada/kedaluwarsa; 403 bukan pembuat. **Layar:** S3 impor berjalan (progres 62%, "1.925 dari 3.105 baris dibaca", langkah-langkah), S12b hitung ulang.

#### `GET /api/cycles/:id/snapshots/:snapshotId/result` · NEW · fase 3
- **Peran:** R, U, L, A; scope seperti snapshot.
- **Respons:** `ImportResultDto`: `snapshot`, `rowsRead`, `headerRowsSkipped`, `itemsSaved`, `rowErrorCount`, `rowErrors[]` (maks. 1000; `line`, `column`, `value`, `reason`, `message`), `diff` (`DiffSummary | null`), `itemsAssessed` (= baru + berubah), `ruleHits[]` (kode, nama, jumlah item), `recheckedNotes[]` (judul, Satker, ekspektasi, hasil, bukti), `notesMovedToVerification`.
- **Layar:** S3 hasil impor (`W7YQog`), hasil dengan baris galat (`ssBiO`; `rowErrors` terisi, `ruleHits: []` menampilkan "Tidak ada item yang kena aturan aktif"). Tombol "Buka Smart Tracker" muncul bila `notesMovedToVerification > 0`.

### 3.3 Risk Triage (S4, S5)

Item yang tampil = item di snapshot **terbaru** tiap eselon I dalam scope pada siklus yang dipilih. Urutan default: kena aturan dahulu (`ruleCodes` tidak kosong), lalu `score` menurun (null terakhir), lalu `totalAmount` menurun, lalu `id`.

#### `GET /api/triage/items` · NEW · fase 3
- **Peran:** R, U, L, A (UKI/Pimpinan "lihat"). **Scope:** otomatis.
- **Query (`triageListQuerySchema`):** `cycleId` (wajib), `organizationUnitId?`, `workUnitId?`, `ruleCategory?` (`EFISIENSI|SATUAN_BIAYA|AKUN|LAINNYA`, kategori aturan yang mengenai item), `ruleCode?`, `decision?` (`belum_ditinjau|confirm|dismiss`), `onlyFlagged?` (default false), `q?` (uraian mengandung, tidak peka huruf besar/kecil), `sort?` (`default|score|total|description`), `dir?`, `page?`, `pageSize?`.
- **Respons:** `TriageListResponse` = `Paginated<TriageItemRow>` + `snapshots: TriageSnapshotInfo[]` + `summary: { analyzedItems, flaggedItems, unreviewedFlaggedItems }`. `summary` dihitung untuk siklus + eselon I + Satker saja (filter `decision`, `q`, `onlyFlagged`, `ruleCategory` tidak mempengaruhi). Baris: `id`, Satker (kode+nama), `accountCode`, `description`, `totalAmount`, `ruleCodes[]`, `score`, `riskCategory`, `changeType`, `decision`, `decisionInherited`, `noteId`, `noteStatus`.
- **Galat:** 400 filter tidak valid; 403 eselon I di luar scope; 404 siklus tidak ada.
- **Kolom desain -> field:** Uraian (Satker · akun) -> `description`, `workUnitName`, `accountCode`; Total (rp) -> `totalAmount`; Aturan -> `ruleCodes`; Skor -> `score` + `riskCategory`; Perubahan -> `changeType`; Keputusan -> `decision` (+ `noteStatus = draf` -> chip "Draf di CHR").
- **Layar:** S4 (`oHui1`), state kosong (`r5ugKa`: `onlyFlagged=true` dan `flaggedItems = 0`; tombol "Tampilkan semua item" = tanpa `onlyFlagged`). Judul ringkasan "108 item kena aturan · 83 belum ditinjau". Footer "Menampilkan 1-11 dari 12.702 item" dan "Halaman 1 dari 1.155" dari `pagination`.

#### `GET /api/triage/items/:id` · NEW · fase 3
- **Peran:** R, U, L, A. **Scope:** eselon I item.
- **Query (`triageDetailQuerySchema`):** filter dan urutan yang sama dengan daftar (tanpa `page`) untuk menghitung `navigation` ("item 2 dari 11", Sebelumnya/Berikutnya). Tanpa filter -> `navigation: null`.
- **Respons:** `TriageItemDetailResponse`:
  - `item: TriageItemContext`: uraian, akun (`accountCode` + `accountName`), `quantity × unitPrice = totalAmount`, `volumeDetail` (VOL_KEG_1..4; `[]` -> "VOL_KEG_1 tidak terisi"), `blokirCode/blokirAmount`, `hierarchy[]` (program -> subkomponen; `name` null bila tidak ada), `changeType`, info snapshot.
  - `score: ScoreBreakdownDto | null`: `value`, `category`, `thresholds`, `factors[5]` (kode, `F1..F5`, label, `normalizedScore`, `weight`, `contribution`, `explanation`, `dataAvailable`), `configVersion`. Faktor yang tampil = yang tersimpan di `risk_assessments.factors`, tanpa dihitung ulang saat dibaca.
  - `ruleHits[]`: kartu aturan (`code`, `name`, `category`, `reason`, `matchedTerms`, `source`, `defaultExpectation`). Kosong = item tidak kena aturan.
  - `peer: PeerComparisonDto | null`: `median`, `satkerCount`, `ratio`, `min`, `max`, `unit`, `itemUnitPrice`. `null` bila kelompok < ambang Satker.
  - `satkerHistory`: lima tema (`penganggaran, perjalanan_dinas, klasifikasi_belanja, honorarium, paket_meeting`) dengan `countTotal`/`countOpen`; `hasProfile = false` bila Satker tidak punya profil.
  - `previousVersion: PreviousVersionDto | null` (diff field dengan padanan); `null` = item baru atau snapshot pertama.
  - `decision: TriageDecisionDto | null`, `confirmDefaults` (kategori, teks, ekspektasi dari aturan berkode terkecil yang mengenai item; tanpa aturan: `LAINNYA`, teks kosong, ekspektasi `null`), `chr` (CHR eselon I bila sudah ada), `canDecide`, `navigation`.
- **Galat:** 403, 404.
- **Layar:** S5 konfirmasi (`BftML`), dismiss (`l5Oo0`), setelah konfirmasi (`rs38h`: `decision.chrNote` + `chr` untuk tombol "Buka CHR ..." dan "Item berikutnya").

#### `POST /api/triage/items/:id/confirm` · NEW · fase 3
- **Peran:** R, A. **Scope:** eselon I item. **Body:** `ConfirmItemBody` = `{ category, text (5-2000), expectation }` (`confirmItemBodySchema`).
- **Respons:** **201** `ConfirmItemResponse` = `{ decision, note: ChrNoteDto, chr: ChrRefDto }`.
- **Galat:** 400 body; 403; 404; **409** item sudah diputuskan (`Item ini sudah ditinjau.`), **409** CHR eselon I sudah terbit (`CHR sudah terbit dan terkunci. Gunakan adendum untuk menambah catatan.`), **409** item bukan dari snapshot terbaru eselon I (`Item berasal dari snapshot lama.`).
- **Efek samping:** membuat `chr_documents` (draft) bila belum ada untuk (siklus, eselon I); insert `reviewer_decisions` (`confirm`), insert `chr_notes` (status `draf`, `rka_item_id`, `work_unit_id`, `rule_id` = aturan sumber nilai awal, `title` = uraian item); audit `item.confirmed` (entity `rka_item`) dan `chr.created` bila CHR baru. Semua dalam satu transaksi.

#### `POST /api/triage/items/:id/dismiss` · NEW · fase 3
- **Peran:** R, A. **Body:** `DismissItemBody` = `{ reasonCategory (kode alasan aktif, wajib), note? (maks. 1000) }`. **Respons:** **201** `DismissItemResponse` = `{ decision }`.
- **Galat:** 400 (`Pilih kategori alasan dismiss.`; kode tidak dikenal/tidak aktif), 403, 404, 409 sudah diputuskan.
- **Efek samping:** insert `reviewer_decisions` (`dismiss`, `reason_category`, `note`); audit `item.dismissed`. Tidak masuk CHR.

#### `DELETE /api/triage/items/:id/decision` · NEW · fase 3
- **Peran:** R, A. Mencabut keputusan yang salah: `dismiss` selalu bisa; `confirm` hanya bila catatannya masih `draf` (catatan ikut dihapus). Respons **204**.
- **Galat:** 404 tidak ada keputusan; **409** `Catatan sudah terbit; keputusan tidak bisa dicabut.`
- **Efek samping:** hapus `reviewer_decisions` (+ `chr_notes`); audit `item.decision_reverted` dengan `before`. Layar: S5 (aksi "Ubah keputusan", tidak ada di desain; disediakan agar salah klik tidak permanen).

### 3.4 Admin: katalog aturan (S12a) dan bobot skor (S12b)

Semua **A saja**. Layar "Akses ditolak" (`JD30D`) untuk peran lain (403).

#### `GET /api/admin/rules` · NEW · fase 3
- **Query:** `cycleId?` (`ruleListQuerySchema`). **Respons:** `RuleListResponse` = `{ cycle, rules: RuleAdminDto[], totalRules, activeRules }`. `hitCount` = item distinct yang kena aturan di snapshot terbaru semua eselon I pada siklus itu. `needsValidation` = `validationNote` terisi (kolom Validasi); `appliesToRevisionOnly` = `params.onlyRevision` (teks "Hanya snapshot revisi"). Urut kode.
- **Layar:** S12a (`bOLIA`).

#### `PUT /api/admin/rules/:id` · NEW · fase 3
- **Body:** `UpdateRuleBody` (`name?, category?, params?, reasonTemplate?, defaultExpectation?, active?, validationNote?`; minimal satu). `kind` dan `code` tidak bisa diubah. `params` divalidasi dengan `parseRuleParams(rule.kind, params)` (regex harus valid).
- **Respons:** `RuleResponse` = `{ rule }`. **Galat:** 400 (parameter tidak valid, mis. `Pola tidak valid (bukan ekspresi reguler yang benar).`), 404.
- **Efek samping:** update `rules` (`updated_at`); audit `rule.updated` dengan `before`/`after`. **Tidak** mengubah `rule_hits` yang sudah ada; berlaku untuk impor berikutnya dan "hitung ulang siklus" (3.4 `recalculate`). UI menampilkan catatan ini di panel.
- **Layar:** panel edit (`pFsNp`). Pola uraian di UI ditulis `a | b | c`, disimpan sebagai `a|b|c`.

#### `PUT /api/admin/rules/:id/active` · NEW · fase 3
- **Body:** `{ active: boolean }`. **Respons:** `RuleResponse`. Audit `rule.toggled`. Layar: sakelar di S12a.

#### `GET /api/admin/risk-config` · NEW · fase 3
- **Respons:** `RiskConfigResponse` = `{ active: RiskConfigDto, versions: RiskConfigDto[] (terbaru dahulu), factors: FactorMetaDto[] }`. Tiap versi: `version` ("1", "2"), `weights` (lima kunci `FACTOR_CODES`, jumlah 100), `thresholds { medium, high }`, `params`, `createdByName`, `createdAt`, `active`. `factors` = metadata F1..F5 (label + deskripsi satu baris) agar teks kolom Faktor dari server.
- **Layar:** S12b (`Yo9Xk`). "Versi 2 · Belum disimpan" hanya keadaan form di UI.

#### `POST /api/admin/risk-config` · NEW · fase 3
- **Body:** `CreateRiskConfigBody` = `{ weights, thresholds, params? }` (`createRiskConfigBodySchema`): bobot bulat, jumlah **tepat 100** (`Jumlah bobot faktor harus 100%.`), `0 <= medium < high <= 100`. `params` kosong = salin dari versi aktif.
- **Respons:** **201** `RiskConfigCreatedResponse` = `{ config }`. Versi = bilangan bulat berikutnya sebagai string. Hanya insert; versi lama tidak diubah (skor lama tetap tersimpan per versi).
- **Efek samping:** insert `risk_config`; audit `risk_config.created`. Tidak otomatis menghitung ulang.

#### `POST /api/admin/risk-config/recalculate` · NEW · fase 3
- **Body:** `{ cycleId }` (`recalculateBodySchema`). Menjalankan ulang aturan aktif dan skor (konfigurasi **aktif**) untuk semua item di snapshot terbaru tiap eselon I pada siklus; menulis `rule_hits` (ganti) dan `risk_assessments` baru per (item, config).
- **Respons:** **202** `RecalculateAcceptedResponse` = `{ jobId }`; hasil `RecalculateResult` lewat `GET /api/jobs/:jobId`.
- **Galat:** 404 siklus; **409** job hitung ulang lain berjalan di siklus itu.
- **Efek samping:** audit `risk_config.recalculated`. Tidak menyentuh keputusan reviewer, catatan CHR, atau cek tindak lanjut. Layar: tombol "Hitung ulang siklus" S12b.

---

## 4. Endpoint fase 4 (CHR per eselon I)

Layar: S6 (`AbBPt`, terkunci `gjkcp`, dialog `G0gXnD`), S7 (`Bko3K`). Peran: **R, A** menulis; **U** hanya menulis tanggapan; **L** baca. Semua endpoint dibatasi scope eselon I dokumen.

#### `GET /api/chr` · NEW · fase 4
- **Query:** `cycleId` (wajib), `organizationUnitId?`, `status?` (`chrListQuerySchema`). **Respons:** `ChrListResponse` = `{ items: ChrListItemDto[], organizationUnitsWithoutChr }`; `ChrListItemDto` memuat `status`, `documentNumber`, `notesByStatus`, `notesTotal`, `issuedAt`, `completedAt`. Layar: menu CHR (daftar bila pengguna punya > 1 eselon I; satu eselon I -> langsung ke dokumennya), tautan dari S5.

#### `POST /api/chr` · NEW · fase 4
- **Peran:** R, A. **Body:** `{ cycleId, organizationUnitId }` (`createChrBodySchema`). Idempoten: sudah ada -> **200** dokumen yang ada; baru -> **201**. **Respons:** `ChrDocumentResponse`. **Galat:** 403, 404, **409** siklus `selesai`. Audit `chr.created`.

#### `GET /api/chr/:id` · NEW · fase 4
- **Respons:** `ChrDetailResponse` = `{ document: ChrDocumentDto, groups: ChrNoteGroupDto[], notesByStatus, notesTotal, versions: ChrVersionSummaryDto[], permissions: ChrPermissionsDto }`.
  - `groups`: hanya kategori yang punya catatan, urut `NOTE_CATEGORIES` (`EFISIENSI`, `SATUAN_BIAYA`, `AKUN`, `LAINNYA`), huruf `A`, `B`, ... dibuat server (`groupLetter`); di dalamnya `ChrNoteDto` dengan `number` berurutan lintas kelompok (urut `created_at`).
  - `document`: `status`, `documentNumber` (null sampai terbit), `recommendation`, `unitResponse` + `unitResponseByName/At` ("Diisi PIC UKI, 5 Nov 2026"), `issuedAt`/`issuedByName`, `currentVersion`.
  - `permissions` dihitung server: `canEditNotes` (R/A dan `draft`), `canEditRecommendation` (sama), `canIssue` (R/A, `draft`, >= 1 catatan), `canAddAddendum` (R/A, `issued|completed`), `canRespond` (U/A, `issued|completed`).
- **Layar:** S6 draf, terkunci (banner "Terbit · terkunci", `permissions` semua `false` kecuali `canAddAddendum`/`canRespond`).

#### `POST /api/chr/:id/notes` · NEW · fase 4
- **Peran:** R, A. **Body:** `CreateNoteBody` (`category, text, expectation, title?, rkaItemId?, workUnitId?`; tanpa `rkaItemId` wajib `title` dan `workUnitId`). Hanya `draft` (untuk CHR terbit gunakan adendum). **Respons:** **201** `ChrNoteResponse`. **Galat:** 400, 404 item/Satker tidak ada, **409** CHR terkunci (`CHR sudah terbit dan terkunci. Gunakan adendum.`), 409 item/Satker bukan dari eselon I CHR ini, 409 item sudah punya catatan.
- **Efek samping:** insert `chr_notes` (`draf`); jika `rkaItemId` ada juga `reviewer_decisions` `confirm` bila belum ada; audit `chr.note_created`.

#### `PATCH /api/chr/:id/notes/:noteId` · NEW · fase 4
- **Peran:** R, A. **Body:** `UpdateNoteBody` (minimal satu dari `category, text, expectation, title`). Hanya CHR `draft` dan catatan `draf`. **Respons:** `ChrNoteResponse`. **Galat:** 400; 404; **409** terkunci. Audit `chr.note_updated` (`before`/`after`). Layar: ikon edit S6.

#### `DELETE /api/chr/:id/notes/:noteId` · NEW · fase 4
- **Peran:** R, A. Hanya `draft`. **Respons:** 204. Menghapus catatan **dan** keputusan `confirm`-nya (item kembali `belum_ditinjau`). Audit `chr.note_deleted`. Layar: ikon hapus S6 (tombol "Hapus catatan" memakai dialog konfirmasi).

#### `PUT /api/chr/:id/recommendation` · NEW · fase 4
- **Peran:** R, A. **Body:** `{ recommendation: string (maks. 5000, boleh kosong) }`. Hanya `draft`. **Respons:** `ChrDocumentResponse`. **Galat:** **409** terkunci. Audit `chr.recommendation_updated`. UI menyimpan otomatis dengan debounce ("Tersimpan otomatis sebagai draf"). Setelah terbit rekomendasi hanya berubah lewat adendum.

#### `POST /api/chr/:id/issue` · NEW · fase 4
- **Peran:** R, A. Tanpa body. Dialog "Terbitkan CHR dan kunci dokumen?" (`G0gXnD`) berisi jumlah catatan dari `notesByStatus.draf`.
- **Respons:** **200** `ChrIssueResponse` = `{ document, version, notesTransitioned }`.
- **Galat:** **409** sudah terbit; **409** `Tidak ada catatan Draf untuk diterbitkan.`; 403; 404.
- **Efek samping (satu transaksi):** isi `document_number` (2.3), `status = issued`, `issued_at`; insert `chr_versions` v1 (`reason = terbit`, `snapshot: ChrVersionSnapshot`); semua `chr_notes` `draf` -> `menunggu_revisi`; audit `chr.issued` (detail: nomor, eselon I, jumlah catatan).

#### `PUT /api/chr/:id/unit-response` · NEW · fase 4
- **Peran:** U (eselon I miliknya), A. **Body:** `{ unitResponse }` (`unitResponseBodySchema`, 1-5000). Hanya `issued|completed`; sebelum terbit **409** `Tanggapan baru bisa diisi setelah CHR terbit.`
- **Respons:** `ChrDocumentResponse` (mengisi `unitResponseByName/At`). Boleh diisi ulang (menimpa). Tanggapan **tidak** membuat versi baru; riwayatnya ada di audit `chr.unit_response_updated` (`before`/`after`). Layar: S6 kolom "Tanggapan eselon I".

#### `POST /api/chr/:id/addendum` · NEW · fase 4
- **Peran:** R, A. **Body:** `AddendumBody` = `{ reason (5-1000), recommendation?, notes: CreateNoteBody[] (maks. 100) }`; harus mengubah rekomendasi atau menambah catatan. Hanya `issued|completed`.
- **Respons:** `ChrAddendumResponse` = `{ document, version, notesAdded }`. **Galat:** 400; **409** `CHR masih draf; ubah langsung tanpa adendum.`
- **Efek samping:** insert `chr_versions` (n+1, `reason = adendum`, snapshot memuat `addendumReason`); catatan baru langsung `menunggu_revisi`; bila CHR `completed` dan ada catatan baru -> kembali `issued`; catatan lama tidak berubah; audit `chr.addendum_added`. Layar: tombol "Tambah adendum" S6 terkunci.

#### `GET /api/chr/:id/versions` · NEW · fase 4
- **Respons:** `ChrVersionListResponse` = `{ versions: ChrVersionSummaryDto[] }` (`versionNumber`, `reason`, `createdByName`, `createdAt`, `notesCount`, `addendumReason`). Layar: "Riwayat versi" (timeline "Versi 1 · terbit", "Adendum: belum ada").

#### `GET /api/chr/:id/versions/:versionNumber` · NEW · fase 4
- **Respons:** `ChrVersionDetailResponse` = `{ version, snapshot: ChrVersionSnapshot }` (isi dokumen dan catatan pada versi itu). 404 versi tidak ada. Layar: tombol "Riwayat versi".

#### `GET /api/chr/:id/print` · NEW · fase 4
- **Query:** `version?` (`chrPrintQuerySchema`); default terbaru, draf dicetak dari data saat ini. **Respons:** `ChrPrintResponse`: `letterhead` dan `signatory` dari konfigurasi server (`PRINT_ORGANIZATION_NAME`, `PRINT_UNIT_NAME`, `PRINT_ADDRESS`, `PRINT_SIGNATORY_CITY`, `PRINT_SIGNATORY_TITLE`, `PRINT_SIGNATORY_NAME?`, `PRINT_SIGNATORY_NIP?`), `documentNumber`, `organizationUnitName`, `fiscalYear`, `stage`, `issuedAt`, `versionNumber`, `groups[]` (huruf, baris: `number, workUnitName, itemDescription, accountCode, text, expectation`), `recommendation`, `unitResponse`, `generatedAt`. UI memformat ekspektasi dengan `expectationCode`. Layar: S7 (`Bko3K`), "Halaman N dari M" dihitung browser (CSS print A4).

---

## 5. Endpoint fase 5 (Smart Tracker dan progres Satker)

Layar: S8 (`X1vbk`, dialog `MYYQx`, kosong `oJHVy`), S9 (`dB0Ae`, `x8CopO`, `W4pDP9`), S10 (`OTPBi`). Hook impor (cek otomatis) dijelaskan di 2.5, bukan endpoint.

#### `GET /api/tracker/notes` · NEW · fase 5
- **Peran:** R, U, L, A. **Scope:** otomatis.
- **Query (`trackerListQuerySchema`):** `cycleId` (wajib), `status` (`menunggu_revisi|perlu_verifikasi|dijustifikasi|closed`, default `perlu_verifikasi`), `organizationUnitId?`, `workUnitId?`, `category?`, `checkResult?`, `sort?` (`age|satker|category|check`, default `age` menurun), `dir?`, `page?`, `pageSize?` (default 25).
- **Respons:** `TrackerListResponse` = `Paginated<TrackerNoteRow>` + `statusCounts` (empat tab, dihitung dengan filter eselon I/Satker/kategori yang sama, mengabaikan `status`/`checkResult`) + `chrDocuments[]` (CHR terbit eselon I tercakup: nomor, tanggal terbit). Baris: Satker, `title`, `accountCode`, `ruleCode`, `category`, `expectation`, `latestCheck { result, checkedAt, snapshotVersionNo, evidence }`, `chrIssuedAt`, `ageDays`, `bulkApprovable`.
- Catatan `draf` tidak pernah muncul. Umur: hari penuh sejak `chrIssuedAt` (sampai `closedAt` bila `closed`).
- **Layar:** S8; state kosong (`oJHVy`: semua `statusCounts = 0`). Ringkasan hasil cek di kolom "Hasil cek terakhir" dirender UI dari `latestCheck.evidence` (mis. "Akun masih 522191").

#### `POST /api/tracker/notes/bulk-approve` · NEW · fase 5
- **Peran:** R, A. **Body:** `{ noteIds: string[] (1-500), note? }` (`bulkApproveBodySchema`). Server hanya memproses catatan `perlu_verifikasi` dengan hasil cek terakhir `terpenuhi` dalam scope; sisanya dilaporkan di `skipped`, bukan galat.
- **Respons:** `BulkApproveResponse` = `{ approvedNoteIds, skipped: { noteId, reason }[], completedChrIds }`. `reason` ∈ `tidak_ditemukan|tidak_ada_akses|bukan_perlu_verifikasi|belum_terpenuhi`. Status 200 walau sebagian dilewati; 400 daftar kosong/terlalu panjang.
- **Efek samping:** satu transaksi; tiap catatan -> `closed` (`closed_by`, `closed_at`), `follow_up_checks` cek terbaru diisi `reviewer_action = setujui`, `reviewed_by/at`; CHR yang semua catatannya closed -> `completed`; audit `note.approved` per catatan (detail menyebut "massal") dan `chr.completed`. Bukan penutupan oleh sistem: dipicu eksplisit oleh pengguna R/A dengan daftar id.
- **Layar:** dialog "Setujui 2 catatan yang terpenuhi?" (`MYYQx`).

#### `GET /api/tracker/notes/:id` · NEW · fase 5
- **Peran:** R, U, L, A. **Respons:** `TrackerNoteDetailResponse`:
  - `note: ChrNoteDto` (teks, ekspektasi, `ruleCode`, `category`, `justification`, `createdByName`, `createdAt`), `chrDocumentNumber`, `chrIssuedAt`, `workUnitName`.
  - `latestEvidence: CheckEvidenceDto | null`: `result`, `snapshotVersionNo`, `snapshotLabel`, `rows[]` (`field`, `before`, `after`, `changed`, `expected`), `note`. `previousEvidence[]` untuk cek lama.
  - `timeline[]`: `dibuat`, `terbit`, `adendum`, `cek`, `dikembalikan`, `dijustifikasi`, `justifikasi_diterima`, `disetujui` (urut naik; tiap peristiwa `at`, `actorName` null = Sistem, `statusAfter`, detail terkait). `nextStep`: `keputusan_reviewer` | `snapshot_revisi` (+ nomor snapshot berikutnya) | `review_justifikasi` | `null` (closed) untuk titik "Menunggu ..." di ujung.
  - `permissions`: `canApprove`, `canReturn`, `canAcceptJustification`, `canJustify` (dihitung dari `canTransition` + peran + scope).
- **Galat:** 403, 404. **Layar:** S9 reviewer, UKI (form Justifikasi), hasil "data tidak cukup".

#### `POST /api/tracker/notes/:id/approve` · NEW · fase 5
- **Peran:** R, A. **Body:** `{ note? }`. Dari `perlu_verifikasi`. **Respons:** `NoteActionResponse` = `{ note, chrCompleted }`. **Galat:** 403, 404, **409** `Catatan berstatus Menunggu Revisi tidak dapat disetujui.` (pesan memuat status saat ini).
- **Efek samping:** status `closed`; cek terbaru `reviewer_action = setujui`; `chr.completed` bila terakhir; audit `note.approved` (+ `chr.completed`). Layar: "Setujui & tutup".

#### `POST /api/tracker/notes/:id/return` · NEW · fase 5
- **Peran:** R, A. **Body:** `{ reason (5-1000) }` (`returnNoteBodySchema`; `Alasan pengembalian minimal 5 karakter.`). Dari `perlu_verifikasi` atau `dijustifikasi`. **Respons:** `NoteActionResponse`. **Galat:** 400, 403, 404, 409.
- **Efek samping:** status `menunggu_revisi`; `follow_up_checks.reviewer_action = kembalikan` + `reviewer_note = reason` pada cek terbaru (bila ada); audit `note.returned` (`after.reason`). Alasan muncul di timeline ("Dikembalikan ke Satker"). Catatan dicek lagi pada snapshot revisi berikutnya.

#### `POST /api/tracker/notes/:id/justify` · NEW · fase 5
- **Peran:** U (eselon I miliknya), A. **Body:** `{ justification (10-2000) }` (`justifyNoteBodySchema`). Dari `menunggu_revisi` atau `perlu_verifikasi`. **Respons:** `NoteActionResponse`. **Galat:** 400, 403 (UKI eselon I lain; reviewer), 404, 409.
- **Efek samping:** `chr_notes.justification`, `justified_by`, status `dijustifikasi`; audit `note.justified`. Layar: S9 UKI "Kirim justifikasi". UKI tidak punya endpoint apa pun yang menutup catatan.

#### `POST /api/tracker/notes/:id/accept-justification` · NEW · fase 5
- **Peran:** R, A. **Body:** `{ note? }`. Dari `dijustifikasi`. **Respons:** `NoteActionResponse`. **Galat:** 403, 404, 409. **Efek samping:** `closed` (`closed_by/at`), `chr.completed` bila terakhir; audit `note.justification_accepted`. Layar: "Terima justifikasi" (nonaktif sampai UKI mengisi).

#### `GET /api/satker/progress` · NEW · fase 5
- **Peran:** R, U, L, A. **Query (`satkerProgressQuerySchema`):** `cycleId` (wajib), `organizationUnitId?` (wajib bila pengguna punya > 1 eselon I; UKI dengan satu eselon I otomatis), `sort?` (`last_moved|name|open_notes`).
- **Respons:** `SatkerProgressResponse` = `{ organizationUnit, cycleId, chr, summary, items }`.
  - `summary`: `satkerTotal`, `satkerWithNotes`, `satkerWithoutNotes`, `satkerReady`, `openNotes`, `openNotesPreview[]` (maks. 3), `adkDeadline`, `daysToAdkDeadline`.
  - `items[]`: `workUnitId/Code/Name`, `counts` (`menunggu_revisi`, `perlu_verifikasi`, `dijustifikasi`, `closed`), `notesTotal`, `lastMovedAt`, `readiness` (`siap_diajukan|belum_siap|tidak_ada_catatan`). Aturan di 2.4. Urutan default `last_moved`: yang paling lama tidak bergerak di atas (tertua dahulu), `tidak_ada_catatan` selalu terakhir.
- **Galat:** 400 `Pilih eselon I.` bila diperlukan tetapi kosong; 403; 404.
- **Layar:** S10 (`OTPBi`). Klik Satker -> `/tracker?workUnitId=...`.

---

## 6. Endpoint fase 6 (dashboard, laporan, publik, admin lanjutan)

### 6.1 Dashboard (S2)

#### `GET /api/dashboard` · NEW · fase 6
- **Peran:** R, U, L, A. **Query:** `cycleId` (wajib), `organizationUnitId?` (`dashboardQuerySchema`). Reviewer/UKI hanya eselon I miliknya (`scopeKind = own`); leader/admin semua (`all`, leader baca saja; layar menampilkan kartu "Cakupan tampilan").
- **Respons:** `DashboardResponse`: `cycle`, `scopeKind`, `dataAsOf`, `organizationUnitNames`, `snapshots[]`, `kpis` (`itemsAnalyzed`, `itemsFlagged`, `satkerReady/WithNotes/Total`, `adkDeadline`, `daysToAdkDeadline`), `notesByStatus` (termasuk `draf`), `notesByCategory`, `chrDocumentNumbers`, `actions[]` (`DashboardActionCard`: `kind`, `count`, `href`, `oldestNote`, `lastIssuedChr`), `organizations[]` (`DashboardOrganizationRow`: Satker sampel, snapshot `v2 · Revisi` atau null, `itemsFlagged`, `notesOpen`, `notesDraft`, `notesClosed`, `notesIssued`, `percentClosed`, `chrStatus`). Klik baris -> `/triage?organizationUnitId=...`.
- Persentase "0,9% dari item dianalisis" dihitung UI (`itemsFlagged / itemsAnalyzed`). "Belum diimpor" = `snapshot: null`, angka `itemsFlagged/notesOpen` null.
- **Layar:** S2 reviewer (`czg1z`), pimpinan (`AUOc8`).

### 6.2 Laporan (S11)

Semua R, U, L, A; angka dan ekspor mengikuti scope.

#### `GET /api/reports/summary` · NEW · fase 6
- **Query:** `cycleId`, `organizationUnitId?` (`reportQuerySchema`). **Respons:** `ReportSummaryResponse`: `notesIssued`, `notesClosed`, `percentClosed`, `medianDaysToClose`, `closedSampleSize`, `isFinal`, `chrDocuments[]`, `notesByCategory` (terbit saja, tanpa draf), `dismissReasons[]` (kode, label, jumlah), `dismissedItems`, `flaggedItems`.
- **Layar:** S11 bagian metrik (`L4cke`).

#### `GET /api/reports/engine-validation` · NEW · fase 6
- **Query:** `reportQuerySchema` (siklus dipakai hanya untuk membatasi eselon I yang punya snapshot). **Respons:** `EngineValidationResponse` = `{ synthetic, sets: EngineValidationSet[], note }`; tiap set: `code` (`L1|L2|L3`), `title`, `description`, `metric`, `totalItems`, `caught`, `value` (0-1), `n`, `ruleCodes`, `missedCount`. L1/L2 = recall aturan (item kunci kena >= 1 aturan); L3 = precision@N skor (label lemah; tampil bila ada datanya). Data kunci jawaban di tabel `answer_key_sets`/`answer_key_items` (bagian 8). `synthetic` dari `answer_key_sets.synthetic` (semua set sintetis -> true).
- **Layar:** S11 bagian "Validasi engine".

#### `GET /api/reports/export.csv` · NEW · fase 6
- **Query:** `ReportExportQuery` = `reportQuerySchema` + `dataset` (`catatan|ringkasan`, default `catatan`). **Respons:** `text/csv; charset=utf-8` dengan BOM, `Content-Disposition: attachment; filename="nirmala-<dataset>-<tahun>-<tahap>.csv"`. Kolom `catatan`: `REPORT_NOTES_CSV_COLUMNS`; `ringkasan`: `REPORT_SUMMARY_CSV_COLUMNS`. Hanya catatan terbit; selalu dibatasi scope (UI menampilkan "Ekspor CSV mengikuti akses Anda: hanya Ditjen Contoh A"). Sel yang diawali `= + - @` diberi awalan `'` (CSV injection).
- **Galat:** 403 eselon I di luar scope. Audit: tidak ditulis (baca saja).
- **Layar:** tombol "Ekspor CSV" S11.

### 6.3 Publik (P1, P2)

Tanpa sesi dan tanpa cookie (`loadUser` tetap berjalan tetapi hasilnya tidak dipakai), `Cache-Control: public, max-age=300`. Batas laju (mis. 60 permintaan/menit/IP) disarankan.

#### `GET /api/public/cycles` · NEW · fase 6
- **Respons:** `PublicCycleListResponse` = `{ cycles: PublicCycleDto[] }`: hanya siklus dengan `dipa_issued_at` terisi dan baris `public_metrics`, terbaru dahulu. Kosong -> UI menampilkan "Belum ada siklus yang dipublikasikan". Layar: P2 pemilih siklus ("DIPA terbit 12 Des 2025").

#### `GET /api/public/transparency` · NEW · fase 6 (menggantikan `/api/public/transparency/summary` dan `/trends`)
- **Query:** `cycleId?` (default siklus publik terbaru). **Respons:** `PublicTransparencyResponse` = `{ cycle, synthetic, generatedAt, minNotes, kpis, rows, totals }`; `kpis` = `notesTotal`, `closedBeforeDeadline`, `closedBeforeDeadlinePercent`, `medianDaysToClose`; `rows[]` = `{ kind: eselon|lainnya, label, byCategory, total }` dengan aturan gabung di 2.8; `totals`. P2 desktop (`rekTU`) dan mobile (`c1KqO`) memakai data yang sama; "Data pada demo ini sintetis" dari `synthetic`.
- **Galat:** **404** `Siklus tidak ditemukan.` bila id tidak ada **atau** DIPA belum terbit. Tidak ada sumber data selain `public_metrics`. P1 (`aszmF`, `M1k21R`) statis.
- Endpoint lama `/api/public/transparency/summary|trends` dihapus (konstanta sintetis `publicData.ts`).

### 6.4 Admin: pengguna dan akses eselon I (S12c)

Semua **A saja**. Memperluas `apps/api/src/routes/users.ts`.

| Endpoint | Status | Request | Respons / catatan |
|---|---|---|---|
| `GET /api/users` | EXISTS (diperluas) · fase 6 | - | `UserListResponse` = `{ users: UserAdminDto[] }`; tambah `active`, `unitLabel`, `organizationUnitIds`, `organizationUnits`, `allOrganizations` ("Semua eselon I" untuk leader/admin) |
| `POST /api/users` | EXISTS (diperluas) · fase 6 | `CreateUserBody` (`username, displayName, role, password (>=12), unitLabel?, organizationUnitIds`) | **201** `{ id }` (tetap). Reviewer/UKI wajib >= 1 eselon I (400 `Pilih minimal satu eselon I untuk peran ini.`); **409** username dipakai. Menulis `user_scopes`. Audit `user.created` |
| `PUT /api/users/:id` | EXISTS (diperluas) · fase 6 | `UpdateUserBody` (`displayName, password?, unitLabel?`) | `{ id, displayName }` (tetap). Audit `user.updated` |
| `PUT /api/users/:id/role` | EXISTS · fase 6 | `{ role }` | tidak berubah (409 turunkan peran sendiri). Peran baru reviewer/uki tanpa eselon I -> tetap diizinkan, pengguna melihat state kosong sampai diberi akses |
| `PUT /api/users/:id/scopes` | NEW · fase 6 | `SetUserScopesBody` = `{ organizationUnitIds }` | mengganti seluruh daftar; respons `UserResponse`. **400** id eselon I tidak ada. Audit `user.scopes_changed` (`before`/`after`). Pengguna leader/admin: disimpan tetapi tidak berpengaruh |
| `PUT /api/users/:id/active` | NEW · fase 6 | `SetUserActiveBody` = `{ active }` | `UserResponse`. **409** admin menonaktifkan dirinya sendiri. Nonaktif -> semua `sessions` pengguna dihapus. Audit `user.activated` / `user.deactivated` |
| `GET /api/organization-units` | EXISTS · fase 6 | - | tidak berubah; sumber kolom "Akses eselon I" dan dropdown |

Layar: S12c (`xbSLr`), panel Tambah/Ubah pengguna (komponen form; tidak ada frame terpisah di Pencil).

### 6.5 Admin: siklus (S12d)

| Endpoint | Status | Request | Respons / catatan |
|---|---|---|---|
| `GET /api/cycles` | EXISTS · fase 6 | - | `CycleListResponse` |
| `POST /api/cycles` | EXISTS · fase 6 | `CreateCycleBody` (`fiscalYear, stage, name?, adkDeadline?`) | **201** `CycleResponse`; **409** `Siklus TA 2027 tahap Alokasi sudah ada.` (sudah ada). Dialog "Buat siklus" (`e2AA59`) |
| `PUT /api/cycles/:id` | EXISTS · fase 6 | `UpdateCycleBody` (`name?, adkDeadline?, status?`) | `CycleResponse`; `dipaIssuedAt` non-null -> 400 (lihat atas). Tombol "Ubah" |
| `DELETE /api/cycles/:id` | EXISTS · fase 6 | - | 204; **409** bila sudah ada snapshot |
| `POST /api/cycles/:id/dipa-issued` | NEW · fase 6 | `MarkDipaIssuedBody` = `{ issuedAt? }` (default sekarang) | `MarkDipaIssuedResponse` = `{ cycle, publicMetricRows }`. **409** sudah ditandai (`DIPA siklus ini sudah ditandai terbit.`); 404. Efek: set `dipa_issued_at`, hitung ulang `public_metrics` siklus itu (2.8) dalam transaksi sama; audit `cycle.dipa_issued` dan `public_metrics.generated`. Dialog "Tandai DIPA terbit" (`l9cPH`) |
| `DELETE /api/cycles/:id/dipa-issued` | NEW · fase 6 | - | `CycleResponse`. Menarik kembali penandaan: `dipa_issued_at = null`, hapus `public_metrics` siklus itu; **409** bila belum ditandai. Audit `cycle.dipa_retracted`. Tidak ada di desain; disediakan untuk salah klik |

### 6.6 Admin: audit log (S12e)

#### `GET /api/audit-logs` · EXISTS (diperluas) · fase 6
- **Peran:** A. **Query:** `AuditLogQuery` = `page`, `pageSize` (default 25, maks. 100), `action?` (**cocok persis**; sebelumnya "mengandung"), `entityType?`, `actorUserId?`, `from?`, `to?`.
- **Respons:** `AuditLogListResponse` = `{ logs: AuditLogEntryDto[], pagination }`. Entri menambah `id` dan `actorUserId`; bidang lama (`action`, `entityType`, `entityId`, `detail`, `before`, `after`, `createdAt`, `actor`) tidak berubah. Urut `createdAt` menurun. "10 entri" = `pagination.total`.
- **Layar:** S12e (`aISAr`). UI memetakan kode `action`/`entityType` ke label tampilan ("setujui_catatan" di desain = `note.approved`).

#### `GET /api/audit-logs/facets` · NEW · fase 6
- **Peran:** A. **Respons:** `AuditLogFacetsResponse` = `{ actions, entityTypes, actors: {id, name}[] }` untuk dropdown Aksi / Entitas / Pengguna. Hanya nilai yang pernah muncul.

---

## 7. Peta layar -> endpoint -> DTO

`(+)` = bagian dari beberapa endpoint; shell = header dan sidebar (selalu memanggil `GET /api/auth/me`, `GET /api/needs-action`, `GET /api/nav-counts`, `GET /api/cycles`).

| Node | Layar | Endpoint | DTO utama |
|---|---|---|---|
| `E7nvf` `qRTuO` `cVL6Z` `UApCm` `SksK5` `jEe5V` `tp72L` `LQbMc` | Fondasi dan komponen | shell saja | `MeResponse`, `NeedsActionResponse`, `NavCountsResponse`, `ReviewCycleDto` |
| `k2eVzx` | S1 Login | `POST /api/auth/login` | `AuthResponse` |
| `G32yLt` | S1 Login (galat) | `POST /api/auth/login` -> 401 | `ApiError` |
| `czg1z` | S2 Dashboard (reviewer) | `GET /api/dashboard` | `DashboardResponse` (`scopeKind = own`) |
| `AUOc8` | S2 Dashboard (pimpinan) | `GET /api/dashboard` | `DashboardResponse` (`scopeKind = all`, kartu "Cakupan" statis, `organizations` termasuk eselon I tanpa snapshot) |
| `hsNnG` | S3 Siklus & Impor | `GET /api/cycles`, `GET /api/cycles/:id/import-overview` | `CycleListResponse`, `ImportOverviewResponse` |
| `JXlM5` | S3 Impor CSV (dialog) | `GET .../snapshots/lookup`, `POST .../snapshots` | `SnapshotLookupResponse`, `snapshotUploadFieldsSchema`, `SnapshotUploadResponse` |
| `W7YQog` | S3 Hasil impor | `GET .../snapshots/:snapshotId/result` | `ImportResultDto` |
| `a72TMw` | State: impor berjalan | `POST .../snapshots` (`async=true`) -> 202, `GET /api/jobs/:jobId` | `SnapshotUploadAcceptedResponse`, `ImportJobDto` |
| `YBiRO` | State: file sama | `GET .../snapshots/lookup` (atau `alreadyImported: true`) | `SnapshotLookupResponse`, `SnapshotUploadResponse` |
| `ssBiO` | State: hasil dengan baris galat | `GET .../snapshots/:snapshotId/result` | `ImportResultDto.rowErrors`, `ImportRowError` |
| `TzMsS` | State: belum ada siklus | `GET /api/cycles` -> `[]` | `CycleListResponse` |
| `ptHvP` | State: belum ada snapshot | `GET .../import-overview` (`snapshots: []`) | `ImportOverviewResponse` |
| `oHui1` | S4 Risk Triage | `GET /api/triage/items`, `GET /api/work-units` | `TriageListResponse`, `TriageItemRow`, `WorkUnitDto` |
| `r5ugKa` | State: belum ada item kena aturan | `GET /api/triage/items?onlyFlagged=true` | `TriageListResponse.summary.flaggedItems = 0` |
| `BftML` | S5 Detail (konfirmasi) | `GET /api/triage/items/:id`, `POST .../confirm`, `GET /api/references/accounts` | `TriageItemDetailResponse`, `ConfirmItemBody`, `ConfirmItemResponse` |
| `l5Oo0` | S5 Detail (dismiss) | `GET /api/references/dismiss-reasons`, `POST .../dismiss` | `DismissReasonDto`, `DismissItemBody`, `DismissItemResponse` |
| `rs38h` | S5 Detail (setelah konfirmasi) | `GET /api/triage/items/:id` (`decision.chrNote`, `chr`) | `TriageDecisionDto`, `ChrRefDto` |
| `AbBPt` | S6 CHR Editor (draf) | `GET /api/chr/:id`, `POST/PATCH/DELETE .../notes`, `PUT .../recommendation`, `GET .../versions` | `ChrDetailResponse`, `CreateNoteBody`, `UpdateNoteBody`, `RecommendationBody`, `ChrVersionListResponse` |
| `gjkcp` | S6 CHR Editor (terkunci) | `GET /api/chr/:id`, `PUT .../unit-response`, `POST .../addendum`, `GET .../versions/:n` | `ChrDetailResponse` (`permissions`), `UnitResponseBody`, `AddendumBody`, `ChrVersionDetailResponse` |
| `G0gXnD` | S6 Terbitkan CHR (dialog) | `POST /api/chr/:id/issue` | `ChrIssueResponse` |
| `Bko3K` | S7 Cetak CHR | `GET /api/chr/:id/print` | `ChrPrintResponse` |
| `X1vbk` | S8 Smart Tracker | `GET /api/tracker/notes`, `GET /api/work-units` | `TrackerListResponse`, `TrackerNoteRow` |
| `MYYQx` | S8 Setujui massal (dialog) | `POST /api/tracker/notes/bulk-approve` | `BulkApproveBody`, `BulkApproveResponse` |
| `oJHVy` | State: tracker kosong | `GET /api/tracker/notes` (semua `statusCounts = 0`) | `TrackerListResponse` |
| `dB0Ae` | S9 Detail catatan (reviewer) | `GET /api/tracker/notes/:id`, `POST .../approve`, `.../return`, `.../accept-justification` | `TrackerNoteDetailResponse`, `ReturnNoteBody`, `NoteActionResponse` |
| `x8CopO` | S9 Detail catatan (PIC UKI) | `GET /api/tracker/notes/:id`, `POST .../justify` | `JustifyNoteBody`, `NoteActionPermissionsDto.canJustify` |
| `W4pDP9` | S9 hasil cek "data tidak cukup" | `GET /api/tracker/notes/:id` | `CheckEvidenceDto` (`result = data_tidak_cukup`, `rows` berisi `blokir_code`, `note`) |
| `OTPBi` | S10 Progres per Satker | `GET /api/satker/progress` | `SatkerProgressResponse` |
| `L4cke` | S11 Laporan | `GET /api/reports/summary`, `.../engine-validation`, `.../export.csv`, `GET /api/organization-units` | `ReportSummaryResponse`, `EngineValidationResponse` |
| `bOLIA` | S12a Katalog aturan | `GET /api/admin/rules`, `PUT .../:id/active` | `RuleListResponse`, `RuleAdminDto` |
| `pFsNp` | S12a Edit aturan (panel) | `PUT /api/admin/rules/:id`, `GET /api/references/accounts` | `UpdateRuleBody`, `RuleParamsByKind`, `RuleResponse` |
| `Yo9Xk` | S12b Bobot skor | `GET/POST /api/admin/risk-config`, `POST .../recalculate`, `GET /api/jobs/:jobId` | `RiskConfigResponse`, `CreateRiskConfigBody`, `RecalculateAcceptedResponse`, `RecalculateJobDto` |
| `xbSLr` | S12c Pengguna | `GET/POST /api/users`, `PUT /api/users/:id`, `.../role`, `.../scopes`, `.../active`, `GET /api/organization-units` | `UserListResponse`, `CreateUserBody`, `SetUserScopesBody`, `SetUserActiveBody` |
| `Fa6ZU` | S12d Siklus | `GET /api/cycles`, `PUT /api/cycles/:id` | `CycleListResponse`, `UpdateCycleBody` |
| `l9cPH` | S12d Tandai DIPA terbit (dialog) | `POST /api/cycles/:id/dipa-issued` | `MarkDipaIssuedBody`, `MarkDipaIssuedResponse` |
| `e2AA59` | S12d Buat siklus (dialog) | `POST /api/cycles` | `CreateCycleBody`, `CycleResponse` |
| `aISAr` | S12e Audit log | `GET /api/audit-logs`, `GET /api/audit-logs/facets` | `AuditLogListResponse`, `AuditLogFacetsResponse` |
| `aszmF` `M1k21R` | P1 Beranda | tidak ada (statis) | - |
| `rekTU` `c1KqO` | P2 Transparansi | `GET /api/public/cycles`, `GET /api/public/transparency` | `PublicCycleListResponse`, `PublicTransparencyResponse` |
| `JD30D` | State: akses ditolak | respons 403 dari endpoint mana pun | `ApiError` |

Pemeriksaan silang layar -> DTO yang sudah dilakukan (ringkas): kolom S4 (uraian/Satker/akun, total, aturan, skor+kategori, perubahan, keputusan, ringkasan "N kena aturan · M belum ditinjau", filter eselon I/Satker/kategori/keputusan/hanya flag/cari, pagination); S5 (konteks, hierarki, volume, blokir, versi sebelumnya, kartu aturan dengan "Uraian cocok", "Sumber", "Ekspektasi bawaan", 5 faktor dengan nilai × bobot = kontribusi dan "Data tidak tersedia", perbandingan harga peer dengan median/jumlah Satker/posisi, riwayat BPK 5 tema, prefill konfirmasi, alasan dismiss, tautan CHR, item berikutnya); S6 (kelompok A/B, nomor, Satker·akun, teks, ekspektasi, status per catatan, hitungan per status, rekomendasi, tanggapan + tanggal, riwayat versi, banner terkunci); S7 (semua kolom cetak, kop, penandatangan); S8 (empat tab + hitungan, filter, kolom, umur, hasil cek, setujui massal); S9 (catatan, bukti sebelum -> sesudah dengan changed/expected, timeline, "Menunggu ..."); S10; S11; S12a-e; P2.

---

## 8. Perubahan skema yang dibutuhkan

Kontrak dapat diimplementasikan dari data-model.md dengan perubahan kecil berikut (satu migrasi Drizzle per fase yang membutuhkannya). Kolom `NOT NULL` diberi default agar baris seed lama tetap valid.

| # | Tabel | Perubahan | Alasan / layar | Fase |
|---|---|---|---|---|
| D1 | `users` | `active integer (boolean) NOT NULL DEFAULT 1`; `unit_label text NULL` | Sakelar Aktif di S12c; footer sidebar "Reviewer · Itjen" | 3 (`unit_label`, login menolak nonaktif), 6 (UI) |
| D2 | `rka_documents` | `import_duration_ms integer NULL`; `row_error_count integer NOT NULL DEFAULT 0`; `row_errors text (json) NULL` (array `ImportRowError`, maks. 1000) | "Impor selesai dalam 38 detik"; tabel Baris galat (`ssBiO`). Parser berhenti mengabort pada baris tidak valid (lihat 2.5) | 3 |
| D3 | `rule_hits` | `matched_terms text (json) NULL` (`string[]`) | "Uraian cocok: kaos + hut" di kartu aturan S5 | 3 |
| D4 | `rka_items` | `hierarchy_names text (json) NULL`: `{ program?, activity?, output?, suboutput?, component? }` (nama dari baris `HEADER1/HEADER2` di CSV) | "099.01.WA · Dukungan Manajemen" di S5. **Opsional**: tanpa ini `HierarchyLevelDto.name = null` dan UI menampilkan kode | 3 |
| D5 | `chr_notes` | `title text NULL` (diisi uraian item saat konfirmasi) | Judul catatan; catatan manual tanpa item | 3 |
| D6 | `chr_documents` | `unit_response_by text NULL REFERENCES users(id)`; `unit_response_at integer NULL`; indeks unik `document_number` (nullable) | "Diisi PIC UKI, 5 Nov 2026"; nomor unik | 4 |
| D7 | `answer_key_sets` (baru) | `code text PK` (`L1`/`L2`/`L3`), `title text`, `description text`, `metric text` (`recall`/`precision_at_n`), `n integer NULL`, `note text NULL`, `synthetic integer NOT NULL DEFAULT 1` | Validasi engine S11 | 6 |
| D8 | `answer_key_items` (baru) | `id text PK`, `set_code text FK`, `rka_item_id text NULL FK`, `item_key text NOT NULL`, `organization_unit_id text FK`, `snapshot_label text` (`Awal`/`Revisi`) | Item kunci jawaban (data asli diisi lewat skrip impor lokal, sintetis lewat seed); dicocokkan ke `rule_hits` pada snapshot berlabel itu | 6 |
| D9 | `risk_assessments.peer_stats` (bentuk JSON) | Perluas ke `{ median, satkerCount, ratio, min, max, unit }` (tanpa migrasi; ubah tipe TS) | Sumbu grafik "Harga satuan vs Satker lain" | 3 |
| D10 | `public_metrics` | Tanpa kolom baru. Konvensi baris rekap `organization_unit_label = '__TOTAL__'`, `category = '__ALL__'` (2.8) | KPI median keseluruhan | 6 |
| D11 | `audit_logs` | Indeks `(entity_type, entity_id)`, `(actor_user_id, created_at)`, `(action, created_at)` | Timeline catatan (S9) dan filter S12e. Trigger append-only tetap | 5-6 |
| D12 | `chr_notes` | Indeks unik parsial `(rka_item_id) WHERE rka_item_id IS NOT NULL` | Satu catatan per item (2.7) | 3 |

Tidak perlu tabel baru untuk job (disimpan di memori, 1.7).

---

## 9. Pertanyaan terbuka dan asumsi

Default di bawah dipakai sampai ada jawaban; tidak ada yang memblokir.

| # | Hal yang ambigu | Default yang dipilih |
|---|---|---|
| A1 | Nomor CHR di desain (`014/CHR/2026`) berbeda dengan K6 (`CHR/<BAES1>/<TA>/<tahap>/<urut>`) | Memakai K6. `urut` = urutan terbit dalam siklus (3 digit). Label UI cukup menampilkan `documentNumber` apa adanya |
| A2 | Arti "urut" pada nomor CHR | Lihat A1; bila ingin per eselon I per tahun, ubah `MAX(urut)` menjadi per `organization_unit_id`. Nomor tetap unik karena memuat BAES1 |
| A3 | Label eselon I di UI ("Ditjen Contoh A") | `organizationUnitName` / `shortName` (`short_name`). Seed sintetis sebaiknya memberi `short_name` = "Ditjen Contoh A" |
| A4 | Badge "Perlu tindakan" di desain hanya menampilkan angka kecil (1-5), bukan jumlah item belum ditinjau (83) | Mengikuti perintah kontrak: `count` = jumlah semua antrean termasuk item belum ditinjau. UI boleh memperlihatkan `99+`. Bila ingin badge hanya "perlu verifikasi + CHR draf", cukup hilangkan item (3) dari reviewer di 2.9 |
| A5 | Pewarisan keputusan triage ke snapshot berikutnya | Diwarisi hanya untuk item `tetap` (2.7); item `berubah` perlu ditinjau lagi |
| A6 | Justifikasi saat status `perlu_verifikasi` (S9 UKI menampilkan formulir pada catatan yang sudah `perlu_verifikasi` dan belum terpenuhi) | Diizinkan dari `menunggu_revisi` dan `perlu_verifikasi` |
| A7 | `kembalikan` dari `dijustifikasi` (reviewer menolak justifikasi) | Diizinkan, kembali ke `menunggu_revisi`; teks justifikasi lama tetap di riwayat (audit), kolom `justification` ditimpa saat ada justifikasi baru |
| A8 | "Setujui" saat hasil cek `belum_terpenuhi`/`data_tidak_cukup` | Diizinkan untuk satu catatan (S9 menampilkan tombolnya); setujui **massal** hanya untuk hasil `terpenuhi` |
| A9 | Isi adendum | Adendum menambah catatan (langsung `menunggu_revisi`) dan/atau mengganti rekomendasi; catatan lama tidak bisa diubah. Mengedit/menghapus catatan terbit tidak didukung di MVP |
| A10 | Tanggapan UKI | Boleh diisi ulang selama `issued|completed`; tidak membuat versi baru, riwayat di audit |
| A11 | Kop dan penandatangan cetak | Dari konfigurasi lingkungan (`PRINT_*`), bukan tabel; nama/NIP penandatangan boleh kosong (placeholder) |
| A12 | Satu CHR per (siklus, eselon I) sudah dijamin unik, tetapi "tahap" ada di siklus | Tidak ada kolom tahap di CHR; tahap diturunkan dari `review_cycles.stage` |
| A13 | Item yang kena aturan tetapi aturan kemudian dinonaktifkan | `rule_hits` lama tetap tampil di item sampai "hitung ulang"; nonaktif hanya mencegah hit baru |
| A14 | Siklus berstatus `selesai` | Impor dan konfirmasi ditolak (409); tracker aksi catatan tetap diizinkan (penutupan lanjutan) |
| A15 | Sinkron vs asinkron impor | Sinkron bila `async` tidak dikirim; UI selalu mengirim `async=true` untuk berkas > 5 MB |
| A16 | Ambang peer default | 5 Satker (`risk_config.params.peerMinSatker`); ditampilkan di `PeerComparisonDto.minSatker` |
| A17 | Tarik kembali DIPA terbit | Disediakan `DELETE .../dipa-issued` (agregat publik dihapus). Tidak ada regenerasi agregat setelah DIPA terbit; bila catatan terus berubah, admin menarik kembali lalu menandai ulang |
| A18 | Urutan kelompok di CHR | Urut `NOTE_CATEGORIES`; kelompok kosong disembunyikan; huruf mengikuti kelompok yang tampil (A, B, ...) |
| A19 | Batas `rowErrors` di hasil impor | 1000 baris pertama; jumlah sebenarnya di `rowErrorCount` |
| A20 | Dashboard menghitung catatan `draf` | Ya, sesuai desain pimpinan ("Catatan draf ikut dihitung"); laporan dan publik tidak |
| A21 | Hasil cek untuk `manual` | Selalu `data_tidak_cukup`; tampil sebagai "tidak bisa dicek otomatis" di S9 |
| A22 | Label "Satker sampel" | = jumlah baris `work_units` eselon I itu (`satkerCount`); Satker muncul dari impor CSV |
| A23 | Kolom "status" di S12c selain "Aktif/Nonaktif" | Tidak ada; `active` boolean |
| A24 | Rumus skor bila ada faktor tanpa data | Skor = Σ(nilai faktor × bobot) / Σ(bobot faktor yang datanya tersedia), dibulatkan. Faktor tanpa data tidak punya kontribusi dan tidak ikut penyebut (tidak menaikkan maupun menurunkan skor; perilaku `riskScoring.ts` lama dipertahankan). Akibatnya jumlah `contribution` yang tampil bisa lebih kecil dari `value`; `ScoreBreakdownDto.activeWeight` (opsional, ditambahkan) memberi penyebutnya |
| A25 | Nilai faktor yang belum dirinci kontrak | F2: akun tidak ada di daftar rawan = 0 (data tersedia). F3: nilai = rekomendasi bertema `penganggaran` + yang belum selesai (BS/BT dihitung dua kali), maks. 100; Satker tanpa baris `satker_finding_stats` = tidak tersedia. F4: 50 poin per kondisi yang terpenuhi (maks. 100); "VOL_KEG_1 tidak terisi" = `VOL_KEG_1` kosong atau 0. F5: baru 60, naik > 20% 80, berubah lainnya 30, tetap 0, snapshot pertama tidak tersedia |
| A26 | Pembanding harga (F1) bergantung waktu impor | Median dihitung dari snapshot terbaru semua eselon I pada siklus **saat sebuah snapshot diimpor**; item eselon I yang diimpor lebih dulu tidak dihitung ulang otomatis ketika eselon I lain masuk. "Hitung ulang siklus" menyamakan semuanya |
| A27 | Item `tetap` saat impor | Skor dihitung penuh untuk semua item (F5 = 0 untuk `tetap`). `rule_hits` hanya dievaluasi untuk `baru`/`berubah`; item `tetap` menyalin hit padanannya, **kecuali** aturan `blokir_history` yang selalu dievaluasi ulang (R08 bergantung pada jenis snapshot, jadi salinan dari snapshot awal akan salah). Hitung ulang mengevaluasi semua item penuh |
| A28 | Pewarisan keputusan | Satu tingkat: item `tetap` mewarisi keputusan **milik** padanannya langsung. Keputusan yang diwarisi bersifat read-only (`canDecide = false`; `DELETE .../decision` -> 404 karena tidak ada keputusan sendiri). Chain v1 -> v2 -> v3 tidak diteruskan otomatis di v3 (reviewer menilai ulang) |
| A29 | Skor yang ditampilkan setelah versi bobot baru | Daftar memakai versi `risk_config` terbaru yang sudah punya penilaian pada snapshot terbaru; sebelum "hitung ulang" tampilan tetap memakai skor versi sebelumnya. Detail memakai penilaian tersimpan terbaru item itu (`configVersion` menunjukkan versinya) |
| A30 | Baris galat impor (D2) | Satu galat (kolom pertama yang gagal) per baris yang dilewati; baris dilewati **tidak** disimpan dan tidak membatalkan impor. Impor tetap dibatalkan (400, seluruh transaksi di-rollback) bila: kolom wajib hilang, BAES1/TAHUN tidak konsisten di dalam berkas, tidak ada baris item yang valid, atau hook deteksi gagal. Nilai negatif pada `VOLKEG`, `HARGASAT`, `TOTAL` = galat `bernilai_negatif`. `rowsRead` = `rowCount + headerRowsSkipped + rowErrorCount`. `rowErrors` disimpan maks. 1000 |
| A31 | Nama hierarki (D4) | Baris judul (HEADER1/HEADER2) menamai tingkat terdalam yang kodenya terisi; hanya program..komponen yang disimpan di `hierarchy_names` (subkomponen sudah punya kolom sendiri). Fixture sintetis tidak punya baris judul tingkat itu, jadi di demo nama program..komponen `null` |
| A32 | Konfirmasi/dismiss item dari snapshot lama atau siklus `selesai` | Konfirmasi dan dismiss ditolak 409 (`Item berasal dari snapshot lama.` / `Siklus sudah selesai; keputusan baru tidak diterima.`). Pencabutan (`DELETE .../decision`) tidak dibatasi selain aturan catatan `draf` |
| A33 | Indeks unik catatan per item (D12) | `chr_notes.rka_item_id` indeks unik parsial (`WHERE rka_item_id IS NOT NULL`); catatan manual tanpa item tidak dibatasi |
| A34 | Job impor | Validasi (siklus, scope, tahun, hash, nomor versi, format header) berjalan sinkron sebelum job dibuat, jadi galat 4xx dijawab langsung (bukan lewat job). Hanya galat di tengah proses yang menjadikan job `gagal`. Kunci satu job per (siklus, eselon I) juga berlaku untuk impor sinkron. Selama transaksi impor/hitung ulang berjalan, query baca dari request lain tetap dilayani (koneksi baca kedua, hanya untuk database berkas; `:memory:` untuk test menunggu) |
| A35 | `notesMovedToVerification` di hasil impor | Fase 3 mengisinya sebagai jumlah catatan yang dicek oleh snapshot itu dan kini berstatus `perlu_verifikasi`; Fase 5 boleh mendefinisikan ulang dengan data audit `note.checked` |
| A36 | Versi `risk_config` | Seed memakai versi `"1"`; versi baru = bilangan bulat terbesar + 1 (versi non-numerik lama seperti `rules-v1` dihitung 0). `created_at` versi baru dijamin lebih besar dari versi terbaru agar "terbaru = aktif" tidak ambigu |
| A37 | Perubahan katalog aturan R06 | Pengecualian R06 ditambah `jasa`, `pengemudi`, `sopir` (baris "Jasa pengemudi kendaraan dinas" adalah kasus R02 dan sebelumnya ikut terkena R06). Berlaku untuk seed baru; database lama perlu mengubahnya lewat `PUT /api/admin/rules/:id` |
| A38 | R08 di seed demo | Seed hanya mengimpor snapshot Awal, dan R08 hanya berlaku di revisi, jadi 13 dari 15 kasus manifest ter-flag setelah `db:seed`; dua kasus R08 muncul setelah `revisi/*.csv` diimpor |
| A39 | D6 menambah kolom penerbit | Migrasi 0008 menambah `chr_documents.unit_response_by`, `unit_response_at`, indeks unik parsial `document_number`, **dan** `issued_by text NULL REFERENCES users(id)` (tidak tercantum di D6; dibutuhkan `ChrDocumentDto.issuedByName`). D5 dan D12 sudah dikerjakan di migrasi 0006 (Fase 3) |
| A40 | Catatan baru dari item lewat editor/adendum | Aturan sama dengan konfirmasi triage: item harus dari snapshot **terbaru** eselon I CHR itu dan siklus CHR itu (409 `Item berasal dari snapshot lama.` / `Item bukan bagian dari eselon I CHR ini.`); item yang sudah punya keputusan apa pun (confirm, dismiss, atau diwarisi) atau catatan -> 409 `Item ini sudah ditinjau.`. Keputusan `confirm` dibuat bersama catatan (juga di adendum) dan dihapus bersama catatan `draf` yang dihapus. `rule_id` = aturan berkode terkecil yang mengenai item |
| A41 | Data cetak per versi | Tanpa `version`: draf dicetak dari data saat ini (`versionNumber = 0`); selain itu versi terbaru memakai catatan dari snapshot versi itu tetapi `status`, `rekomendasi`, `tanggapan` terkini (tanggapan tidak membuat versi). `?version=n` untuk versi lama memakai isi snapshot apa adanya. Versi yang tidak ada (termasuk `version=1` pada draf) -> 404. Cetak boleh dibaca semua peran dalam scope |
| A42 | Daftar CHR | `GET /api/chr` terbuka untuk semua peran; `organizationUnitsWithoutChr` = eselon I dalam scope (dan sesuai `organizationUnitId` bila ada) tanpa CHR pada siklus itu, tidak dipengaruhi filter `status`. Siklus `selesai` hanya menolak **membuat** CHR baru (409); penyuntingan draf yang sudah ada tidak dibatasi status siklus |
| A43 | Penyelesaian CHR (`completed`) | Fungsi transaksional `syncChrCompletion(db, chrId, actorId)` di `repositories/chr.ts`: `issued` + semua catatan (>= 1) `closed` -> `completed` (+ audit `chr.completed`); `completed` + ada catatan belum `closed` -> `issued`; `draft` tak pernah berubah; hanya membaca status catatan, tidak pernah menutup catatan. Adendum memanggilnya; **Fase 5 wajib memanggilnya** di transaksi setujui, terima justifikasi, dan setujui massal |
| A44 | Kop dan penandatangan cetak | `PRINT_*` dibaca saat `createApp` (opsi `print` menimpa untuk test). Default: `Kementerian Pekerjaan Umum` / `Inspektorat Jenderal` / alamat kosong / `Jakarta` / `Inspektur Jenderal` / nama dan NIP kosong. Tercantum di `.env.example` |
| A45 | Tanggapan UKI | `PUT .../unit-response` memakai peran `uki` dan `admin`; scope eselon I menjaga UKI hanya pada miliknya (403 di luar). Reviewer dan pimpinan 403. Boleh juga pada CHR `completed` |
| A46 | Ekspektasi `manual` dengan padanan hilang (2.6 menyebut dua aturan yang bertabrakan) | Padanan hilang didahulukan: hasil `item_tidak_ditemukan`. `manual` dengan padanan, atau catatan manual tanpa item, selalu `data_tidak_cukup`. `blokir_code` hanya ada di bukti bila `chr_notes.rule_id` = R08. Catatan non-manual tanpa item (`rka_item_id` kosong) -> `data_tidak_cukup` |
| A47 | Bentuk bukti dan `notesMovedToVerification` | `Evidence.fields[].expected` ditambahkan (opsional; akun tujuan atau batas harga/total) dan disimpan di `follow_up_checks.evidence`; `EvidenceRowDto.expected` membacanya (null bila tidak ada). `turunkan_nilai` dengan dua batas: keduanya harus terpenuhi; hanya field yang punya batas yang ditampilkan (plus `quantity`). `rinci_item`: satuan `paket`/`LS`/`lump sum` (tak peka huruf besar) dianggap bukan rincian; `quantity > 1` dengan satuan kosong dan tanpa rincian uraian -> `data_tidak_cukup`. `notesMovedToVerification` (A35) kini dihitung dari audit `note.checked` (`before.status = menunggu_revisi` dan `after.documentId` = snapshot itu), jadi tidak berubah setelah reviewer memutuskan |
| A48 | Penelusuran padanan catatan lintas versi | Titik awal = padanan cek terakhir catatan (atau item dasar bila belum pernah dicek); rantai `previous_item_id` ditelusuri naik versi demi versi sampai snapshot yang dicek, jadi versi yang dilewati (catatan `dijustifikasi` saat v3 diimpor) tetap terhubung. Cek terakhir tanpa padanan memutus rantai: cek berikutnya tetap `item_tidak_ditemukan`. Migrasi 0009 menambah indeks unik `follow_up_checks (note_id, document_id)` dan indeks `document_id`; hook juga melewati catatan yang sudah punya cek untuk snapshot itu. Hook standar = `importHooks()` (deteksi lalu tracker); `trackerHooks()` terpisah untuk test |
| A49 | Catatan `draf` dan CHR draf di tracker | Tidak pernah tampil: detail dan semua aksi tracker -> **404** `Catatan tidak ditemukan.`; setujui massal melaporkan `tidak_ditemukan`. Status tidak cocok untuk aksi -> **409** `Catatan berstatus <Label> tidak dapat <aksi>.` (label: Menunggu Revisi, Perlu Verifikasi, Dijustifikasi, Closed). Terima justifikasi dengan `justification` kosong -> 409 `Justifikasi belum diisi.` |
| A50 | Setujui massal | `item_tidak_ditemukan` / `data_tidak_cukup` / `belum_terpenuhi` semuanya dilaporkan `belum_terpenuhi` (enum `BULK_SKIP_REASONS` tidak punya nilai lain); catatan tanpa cek -> `belum_terpenuhi`. Urutan pemeriksaan: tidak ada/draf -> `tidak_ditemukan`; di luar scope -> `tidak_ada_akses`; bukan `perlu_verifikasi` -> `bukan_perlu_verifikasi`; hasil cek bukan `terpenuhi` -> `belum_terpenuhi`. Id ganda diproses sekali. Catatan massal (`note`) disimpan di `follow_up_checks.reviewer_note`; audit `note.approved` per catatan memuat kata "massal" |
| A51 | Aksi catatan dan cek | `setujui` mengisi `reviewer_action/reviewer_note/reviewed_*` pada cek terbaru; `kembalikan` mengisi alasan di `reviewer_note` cek terbaru (menimpa isian sebelumnya); `terima_justifikasi` dan `justifikasi` tidak menyentuh `follow_up_checks`. `kembalikan` tidak menghapus `chr_notes.justification` (ditimpa saat ada justifikasi baru). Penutupan hanya lewat `closeNote` di `services/trackerService.ts`; test memeriksa tidak ada kode lain yang menetapkan `status: "closed"` |
| A52 | Progres Satker | Tanpa `organizationUnitId`: pengguna dengan tepat satu eselon I dalam scope (atau hanya ada satu eselon I) otomatis; lebih dari satu -> 400 `Pilih eselon I.`; scope kosong -> 403. Daftar `items` memuat semua Satker eselon I (juga yang tanpa catatan), `tidak_ada_catatan` selalu terakhir pada semua urutan. `lastMovedAt` = maks. dari `chr_notes.updated_at`/`closed_at`, `follow_up_checks.checked_at`, dan `imported_at` snapshot eselon I yang memuat item Satker itu (hanya Satker dengan catatan terbit). `daysToAdkDeadline` = `floor((tenggat - sekarang) / 1 hari)`. `openNotesPreview` = tiga catatan terbuka tertua menurut tanggal terbit CHR. `GET /api/tracker/notes` menyaring di SQL tetapi mengurutkan/memberi halaman di memori (jumlah catatan terbit per siklus kecil); umur = hari penuh sejak terbit CHR |
| A53 | Fixture Revisi dan hasil cek | Dengan aturan 2.6, hasil di fixture sintetis: `ganti_akun` yang diperbaiki (R02 "Honor satpam", R04 "Cetak kop surat", R06 "Pengadaan laptop") `terpenuhi`; yang tidak diperbaiki (R02 "Jasa kebersihan", R03 "Langganan internet") `belum_terpenuhi`; R01 "Pengadaan kaos" (`hapus_item`, dihapus di revisi) `terpenuhi`; item filler yang dihapus dengan `ganti_akun` -> `item_tidak_ditemukan`; R07 "Biaya koordinasi lain-lain" (volume 0 -> 1 `paket`, uraian tetap) `belum_terpenuhi` karena satuan paket tidak dihitung rincian |
| A54 | Demo loop | `npm run db:seed:demo -w @nirmala/api` (`db/seedDemoLoop.ts`, `seedDemoFollowUpLoop`): setelah `db:seed`, mengonfirmasi semua item ter-flag di snapshot Awal tiap eselon I fiktif (ekspektasi bawaan aturan), menerbitkan CHR atas nama admin demo, lalu mengimpor `fixtures/synthetic/revisi/*.csv`. Tidak menutup catatan; idempoten; tidak dijalankan oleh `db:seed` |
| A55 | Definisi angka proses (dashboard, laporan, ekspor, publik) | "Catatan terbit" = catatan bukan `draf` pada CHR bukan `draft`. Waktu terbit catatan = `chr_documents.issued_at` (sama dengan umur di tracker). Hari ke closed = `daysBetween(terbit, closed_at)` (bulat); median = median hari bulat itu dengan satu angka desimal (genap = rata-rata dua tengah). `closed_before_deadline` = closed dengan `closed_at <= adk_deadline` (tenggat kosong -> 0). `percentClosed` dibulatkan (`Math.round`). `dataAsOf` = waktu terbaru dari impor snapshot terbaru dan `created/updated/closed` catatan dalam cakupan. Migrasi 0010 menambah D7 (`answer_key_sets`) dan D8 (`answer_key_items`); D10 tanpa migrasi |
| A56 | Dashboard | `scopeKind = all` bila `orgScope` null (leader/admin), selain itu `own`; `organizationUnitId` di luar scope 403, tidak ada 404, scope kosong -> cakupan kosong (bukan galat). `itemsAnalyzed`/`itemsFlagged` = `summary` Risk Triage untuk snapshot terbaru dalam cakupan (angka sama dengan S4). `satkerTotal` = jumlah Satker eselon I dalam cakupan. Kartu: reviewer/admin `perlu_verifikasi` (bila > 0) + `chr_draf` (selalu, `count` = CHR draf yang punya catatan); UKI `menunggu_revisi`, `belum_terpenuhi` (perlu_verifikasi dengan cek terakhir bukan terpenuhi), `tanggapan_belum_diisi` (bila > 0); pimpinan tanpa kartu (`actions: []`). `oldestNote.waitingDays` dihitung dari waktu cek terbaru (perlu_verifikasi) atau `chr_notes.updated_at`; `menunggu_revisi` dari tanggal terbit CHR |
| A57 | Ringkasan laporan | `dismissedItems` dan `dismissReasons` menghitung keputusan dismiss **milik item sendiri** pada snapshot terbaru dalam cakupan (keputusan yang diwarisi tidak dihitung ganda); `flaggedItems` = item snapshot terbaru dengan >= 1 `rule_hits`. `isFinal` = DIPA terbit atau tenggat ADK lewat. Eselon I tak dikenal 404, di luar scope 403 (sama dengan dashboard) |
| A58 | Validasi engine | Item kunci jawaban dicocokkan lewat `item_key` pada snapshot berlabel (`Awal`/`Revisi`) milik eselon I itu di siklus yang dipilih; hanya (eselon I, label) yang punya snapshot di siklus itu yang dievaluasi (`totalItems`); item yang tidak ada di snapshot dihitung tidak tertangkap. Recall = item punya >= 1 `rule_hits` (aturan nonaktif yang hit-nya masih tersimpan tetap dihitung, A13). L3 = precision@N atas item snapshot-snapshot kunci jawaban, urut skor versi `risk_config` terbaru yang sudah dinilai, lalu total menurun, lalu id (urutan sama dengan S4 `sort=score`); `value = caught / n` (n default 10 bila kosong); L3 tidak tampil bila belum ada snapshot berlabel. `synthetic` = semua set yang tampil sintetis (false bila tidak ada set); `note` = catatan set yang tampil digabung spasi. Seed sintetis (`seedSyntheticAnswerKey`, dipanggil `db:seed`): L1 = kasus akun R02-R06 dari `manifest.json` (9) + 2 item filler tanpa hit (11 item, 9 tertangkap), L2 = R01 dan R07 (4), L3 = dua kasus R08 label Revisi dengan N = 5 (tampil setelah Revisi diimpor). Kunci jawaban asli: JSON buatan lokal diimpor dengan `npm run import:answer-key` (set diganti seluruhnya; lihat deploy.md); tidak ada skrip yang membaca `data/private` |
| A59 | Ekspor CSV | UTF-8 BOM, pemisah koma, baris CRLF, kutip RFC 4180. Tanggal `diterbitkan`/`ditutup` = `YYYY-MM-DD` (UTC); `umur_hari` = hari sampai ditutup (atau sekarang); `uraian_item` = uraian item, atau judul untuk catatan manual; `ekspektasi` = `expectationCode`; `hasil_cek_terakhir` kosong bila belum dicek. Sel teks berawalan `= + - @` (juga tab/CR) diberi `'`. `ringkasan`: dimensi `kategori` (4 baris, nol tetap ditulis), `status` (4 status bukan draf), `alasan_dismiss` (hanya > 0). Tidak ada audit |
| A60 | Agregat publik | `publicMetricRows` menghitung baris rekap `__TOTAL__`; hanya sel (label, kategori) dengan catatan > 0 disimpan, kunci kategori dilengkapi nol saat dibaca. `organization_unit_label` = `shortName` eselon I atau `Lainnya`. Satu eselon I saja (besar atau kecil) = satu baris `Lainnya`; satu kecil + hanya satu besar = semuanya `Lainnya`. Baris diurut total menurun (nama), `Lainnya` terakhir. `minNotes` diambil dari konfigurasi saat dibaca (`PUBLIC_MIN_NOTES`, default 5), tidak disimpan per siklus; `synthetic` dari `PUBLIC_DATA_SYNTHETIC=true`. Siklus publik = `dipa_issued_at` terisi **dan** ada baris `__TOTAL__`; tanpa `cycleId` dan tanpa siklus publik -> 404. Batas laju 60 permintaan/menit/IP (kunci `CF-Connecting-IP`, lalu `X-Forwarded-For`) -> 429; `Cache-Control: public, max-age=300` hanya pada 200. Penjagaan siklus: `PUT` dengan `dipaIssuedAt` null saat sudah ditandai -> 400; `DELETE /api/cycles/:id` saat DIPA ditandai -> 409 (tarik kembali dulu); `POST /api/cycles` dengan `dipaIssuedAt` (impor data lama) tidak membuat agregat sehingga tidak tampil publik |
| A61 | Pengguna | `PUT .../scopes` membuang id ganda, id tidak ada -> 400 `Eselon I tidak ditemukan.`, daftar kosong diizinkan (pengguna melihat state kosong). `PUT .../active` idempoten: tanpa perubahan tidak menulis audit; admin boleh mengaktifkan dirinya sendiri, menonaktifkan -> 409. `PUT /api/users/:id` hanya mengubah `unitLabel` bila dikirim (`null` menghapus). Audit `user.created` memuat `role` dan `organizationUnitIds`; `user.updated` hanya `passwordChanged` (tanpa nilai kata sandi). Semua mutasi pengguna dan siklus kini dalam `database.transaction` bersama audit-nya |
| A62 | Audit log | Query kosong dianggap tidak ada; `from`/`to` boleh epoch ms (string angka >= 9 digit) atau tanggal; `to` yang tepat tengah malam UTC (mis. `2026-11-10`) berarti sampai akhir hari itu. Urut `createdAt` menurun lalu `id` menurun. `facets.actors` hanya pengguna yang punya baris audit (aksi Sistem tidak masuk) |
| A63 | Deploy satu proses | Produksi: `NODE_ENV=production` (`npm start` memakai `tsx src/server.ts`; keluaran `tsc` tidak dipakai karena path migrasi relatif ke `src`), API menyajikan `apps/web/dist` (override `WEB_DIST_DIR`), `API_HOST` default 127.0.0.1, HSTS + CSP + `Permissions-Policy` + COOP. Rute `/api/*` tidak dikenal -> JSON 404 `Endpoint tidak ditemukan.` (tidak ada lagi 501; `/api/risk-items` dan `/api/public/transparency/summary|trends` -> 404). Respons `/api/*` `Cache-Control: no-store` kecuali publik. `seedMasterData(db, { demo: false })` (`bootstrap:production`) tidak membuat akun demo/eselon I fiktif; `create-admin` dan `import:private --production --actor` melengkapi. Cadangan `VACUUM INTO` (koneksi baca-saja) dengan retensi hari |
| A64 | Sisa hari ke tenggat ADK | `daysToAdkDeadline` (dashboard dan progres Satker) = selisih hari **kalender UTC** (`calendarDaysUntil`, `lib/calendar.ts`), bukan `floor` selisih milidetik (A52/A56 sebelumnya). Tenggat disimpan sebagai tanggal (00:00 UTC), jadi 21 jam sebelum tenggat berarti sisa 1 hari, sama dengan penghitung di sidebar web; hari tenggat = 0 ("Hari ini"), setelahnya negatif |
| A65 | Ekspor CSV di web | UI mengambil `export.csv` lewat `fetch` (agar galat 403/500 tampil sebagai pesan) lalu menyimpannya sebagai `Blob` apa adanya. Memakai `response.text()` membuang BOM UTF-8 saat dekode, sehingga Excel salah membaca huruf beraksen; BOM wajib tetap ada di berkas (A59) |
