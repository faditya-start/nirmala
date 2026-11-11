# Deploy NIRMALA (server sendiri + Cloudflare Tunnel)

Status: Fase 6 · terkait: [plan.md](plan.md) (Fase 6) · [mvp-scope.md](mvp-scope.md) §7 · [api-contract.md](api-contract.md)

Satu proses Node menjalankan API dan menyajikan web hasil build (`apps/web/dist`). Database satu berkas SQLite. Akses publik lewat Cloudflare Tunnel (`cloudflared`), jadi server tidak membuka port ke internet. Contoh berkas ada di [`deploy/`](../deploy) (contoh saja, tidak dijalankan oleh repo).

```
Browser ──HTTPS──> Cloudflare ──tunnel──> cloudflared ──> 127.0.0.1:8787  (Hono: /api/* + berkas web + fallback SPA)
                                                              └─ SQLite (DATABASE_PATH), cadangan harian
```

## 1. Prasyarat

- Linux dengan systemd, Node.js 22 atau lebih baru (API memakai `node:sqlite`), npm 10+, git.
- Domain di Cloudflare dan akun untuk `cloudflared`.
- Pengguna sistem tanpa login: `sudo useradd --system --home /opt/nirmala --shell /usr/sbin/nologin nirmala`.
- Folder: `/opt/nirmala` (kode), `/var/lib/nirmala` (database), `/var/backups/nirmala` (cadangan), semuanya milik `nirmala`; `/etc/nirmala` (env) milik `root:nirmala` dengan izin 0750.

## 2. Build dan jalankan

```bash
cd /opt/nirmala
git clone <repo> .            # atau git pull untuk pembaruan
npm ci
npm run build                 # shared + web (apps/web/dist) + api
```

Konfigurasi: salin [`deploy/nirmala.env.example`](../deploy/nirmala.env.example) ke `/etc/nirmala/nirmala.env` (pemilik `root:nirmala`, izin `0640`) dan isi. Perintah skrip di bawah dijalankan sebagai pengguna `nirmala` dengan env itu; definisikan sekali:

```bash
nirmala-run() { sudo -u nirmala bash -c 'set -a; . /etc/nirmala/nirmala.env; set +a; cd /opt/nirmala && "$@"' -- "$@"; }
```

Variabel yang wajib:

| Variabel | Keterangan |
|---|---|
| `NODE_ENV=production` | Cookie sesi `Secure`, HSTS, dan API menyajikan `apps/web/dist` |
| `SESSION_SECRET` | **Wajib**; server menolak start tanpa ini di produksi. `openssl rand -base64 48` |
| `DATABASE_PATH` | Mis. `/var/lib/nirmala/nirmala.sqlite` (folder harus bisa ditulis `nirmala`) |
| `WEB_ORIGIN` | Origin publik (`https://nirmala.contoh.go.id`) |
| `API_PORT` / `API_HOST` | Default 8787 dan (produksi) `127.0.0.1` |
| `WEB_DIST_DIR` | Opsional; default `apps/web/dist` |
| `PUBLIC_MIN_NOTES` / `PUBLIC_DATA_SYNTHETIC` | Ambang k halaman publik (default 5) dan penanda data demo sintetis |
| `PRINT_*` | Kop dan penandatangan cetak CHR |
| `BACKUP_DIR` / `BACKUP_KEEP_DAYS` | Cadangan harian (bagian 5) |

Server memigrasi database saat start. Jalankan manual untuk uji: `NODE_ENV=production SESSION_SECRET=... npm start` (dari root; skrip `start` di `apps/api` mengisi `NODE_ENV=production`).

### Persiapan database produksi (tanpa akun demo)

`npm run db:seed` membuat akun demo yang kata sandinya **publik di repo**. Di produksi jangan dipakai. Gunakan:

```bash
cd /opt/nirmala
nirmala-run npm run bootstrap:production -w @nirmala/api     # migrasi + master data nyata (aturan, bobot, akun BAS, alasan dismiss)
nirmala-run env ADMIN_PASSWORD='kata-sandi-panjang-min-12' npm run create-admin -w @nirmala/api -- admin.itjen "Nama Admin"
```

`create-admin` bisa dijalankan lagi untuk mereset kata sandi admin (akun juga diaktifkan kembali). Kata sandi lewat variabel lingkungan supaya tidak tersimpan di riwayat shell. Setelah itu admin membuat pengguna lain di S12c (akses eselon I per pengguna).

Bila database sudah terlanjur dibuat dengan `db:seed`: masuk sebagai admin, buat admin sebenarnya, lalu nonaktifkan semua akun `*.demo` (S12c, atau `PUT /api/users/:id/active`) **sebelum** tunnel dihidupkan.

### systemd

```bash
sudo cp deploy/nirmala.service deploy/nirmala-backup.service deploy/nirmala-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nirmala.service nirmala-backup.timer
journalctl -u nirmala -f
```

Periksa: `curl -s http://127.0.0.1:8787/api/health` dan `curl -sI http://127.0.0.1:8787/` (HTML dengan `Content-Security-Policy`).

Perilaku penyajian web: berkas di `/assets/*` (nama berhash) di-cache setahun (`immutable`); `index.html` dan berkas lain `no-cache` dengan ETag; rute SPA (`/triage`, `/chr/...`, `/transparansi`) menjawab `index.html`; berkas beraksen yang tidak ada menjawab 404; `/api/*` tidak pernah jatuh ke `index.html` (rute tidak dikenal = JSON 404). Respons API `Cache-Control: no-store`, kecuali `/api/public/*` (`public, max-age=300`, batas 60 permintaan/menit/IP).

## 3. Cloudflare Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create nirmala
cloudflared tunnel route dns nirmala nirmala.contoh.go.id
sudo mkdir -p /etc/cloudflared && sudo cp deploy/cloudflared-config.yml /etc/cloudflared/config.yml   # isi UUID dan hostname
sudo cloudflared service install && sudo systemctl enable --now cloudflared
```

`ingress` mengarah ke `http://127.0.0.1:8787` (API dan web satu proses). Pastikan `WEB_ORIGIN` sama dengan hostname publik. Aplikasi dapat dibuka lewat domain tunnel setelah `curl https://nirmala.contoh.go.id/api/health` menjawab `ok`. Untuk batas laju publik, aplikasi membaca `CF-Connecting-IP`; di belakang proxy lain pastikan header itu atau `X-Forwarded-For` diteruskan.

## 4. Data asli (lokal di server, tidak masuk git)

Data asli (`data/private/`, di `.gitignore`) tidak pernah di-commit atau diunggah. Letakkan CSV SIPEKA (`es1_<BAES1>_<tahun>.csv`) di server, mis. `/srv/nirmala-data/`, di luar repo.

Dua jalur:

1. **Lewat aplikasi** (disarankan): Reviewer/Admin mengunggah di S3 Siklus & Impor.
2. **Lewat skrip** (impor besar, ±168 ribu baris, tanpa batas waktu browser):

```bash
nirmala-run npm run import:private -w @nirmala/api -- /srv/nirmala-data --cycle 2026:alokasi --production --actor admin.itjen
```

`--production` memakai database produksi tanpa seed demo dan mencatat impor atas nama admin `--actor`. Eselon I yang belum terdaftar dibuat dari kode BAES1 (nama sementara `Eselon I <kode>`; ganti namanya lewat basis data bila perlu). Keluaran skrip hanya agregat. Impor idempoten lewat hash berkas.

### Kunci jawaban validasi engine (data asli)

Seed hanya memuat kunci jawaban **sintetis** (`db:seed`; ditandai sintetis di S11). Kunci jawaban asli dibuat tim secara lokal sebagai berkas JSON (tidak di-commit, format di `apps/api/src/services/answerKeyImport.ts`: set `L1`/`L2`/`L3`, tiap item berisi kode eselon I, label snapshot `Awal`/`Revisi`, dan `itemKey` atau `satkerCode` + `description`), lalu diimpor:

```bash
nirmala-run npm run import:answer-key -w @nirmala/api -- /srv/nirmala-data/kunci-jawaban.json --cycle 2026:alokasi
```

Set yang ada di berkas diganti seluruhnya; keluaran hanya jumlah. Skrip tidak membaca `data/private` sendiri.

### Menerbitkan halaman publik

Setelah DIPA terbit, admin memakai S12d "Tandai DIPA terbit" (`POST /api/cycles/:id/dipa-issued`). Agregat dibuat saat itu saja (eselon I dengan catatan terbit < `PUBLIC_MIN_NOTES` digabung ke "Lainnya"; lihat [api-contract.md](api-contract.md) §2.8). Salah klik: `DELETE /api/cycles/:id/dipa-issued` menghapus agregat. Halaman publik tidak pernah memuat item, nama Satker, atau rupiah per item.

## 5. Cadangan dan pemulihan

Cadangan memakai SQLite online backup (`VACUUM INTO` lewat koneksi baca-saja): aman saat aplikasi berjalan, hasilnya satu berkas konsisten tanpa `-wal`/`-shm`.

- Harian lewat `nirmala-backup.timer` (02:30) → `${BACKUP_DIR}/nirmala-YYYYMMDD-HHMMSS.sqlite` (UTC). Berkas `nirmala-*.sqlite` yang lebih tua dari `BACKUP_KEEP_DAYS` (default 14) dihapus; berkas lain di folder itu tidak disentuh.
- Manual: `npm run backup -w @nirmala/api -- --dir /var/backups/nirmala --keep 30` (dengan `DATABASE_PATH` terisi).
- Salin cadangan ke luar mesin (mis. `rsync`/`rclone`) karena folder yang sama ikut hilang bila disk rusak. Berkas berisi data penting: izin `0600`, enkripsi saat disimpan di luar server.

**Pulihkan:**

```bash
sudo systemctl stop nirmala
sudo mv /var/lib/nirmala/nirmala.sqlite /var/lib/nirmala/nirmala.sqlite.rusak     # simpan dulu
sudo rm -f /var/lib/nirmala/nirmala.sqlite-wal /var/lib/nirmala/nirmala.sqlite-shm
sudo cp /var/backups/nirmala/nirmala-20261111-023000.sqlite /var/lib/nirmala/nirmala.sqlite
sudo chown nirmala:nirmala /var/lib/nirmala/nirmala.sqlite
sudo systemctl start nirmala && curl -s http://127.0.0.1:8787/api/health
```

Migrasi yang belum diterapkan pada cadangan lama berjalan otomatis saat start. Job impor yang sedang berjalan hilang saat restart (transaksi dibatalkan); ulangi impor.

## 6. Rotasi rahasia dan pembaruan

- **`SESSION_SECRET`**: ubah di `/etc/nirmala/nirmala.env`, `systemctl restart nirmala`. Semua sesi tidak berlaku lagi, pengguna masuk ulang. Lakukan bila rahasia bocor atau berkala.
- **Kata sandi**: admin mengubah lewat S12c; akun admin yang terkunci direset dengan `create-admin`. Menonaktifkan pengguna menghapus semua sesinya.
- **Kredensial tunnel**: `cloudflared tunnel token nirmala` / buat tunnel baru, ganti `credentials-file`, `systemctl restart cloudflared`, hapus tunnel lama di dasbor Cloudflare.
- **Pembaruan aplikasi**: `git pull && npm ci && npm run build && sudo systemctl restart nirmala`. Cadangan manual dulu bila ada migrasi baru (`drizzle/`).

## 7. Daftar periksa setelah deploy

1. `curl -s https://<domain>/api/health` → `ok`; `https://<domain>/` memuat aplikasi; `/transparansi` (rute SPA) memuat halaman, bukan 404.
2. Masuk sebagai admin; tidak ada akun `*.demo` yang aktif.
3. `curl -s https://<domain>/api/public/cycles` → `{"cycles":[]}` sebelum DIPA ditandai terbit.
4. `systemctl list-timers nirmala-backup.timer` dan satu cadangan percobaan (`npm run backup`), buka dengan `sqlite3 ... "PRAGMA integrity_check"` bila tersedia.
5. Lakukan skenario [mvp-scope.md](mvp-scope.md) §7 butir 2 (impor v1 → triage → CHR → impor v2 → tracker) pada data uji.

## Kapasitas yang sudah diukur

Diukur secara lokal pada berkas CSV eselon I terbesar dari data asli (±168 ribu baris, 143.545 item detail; hanya angka agregat yang dicatat), jalur impor yang sama dengan API (impor + deteksi aturan + skor + cek tindak lanjut dalam satu transaksi), SQLite berkas, satu proses Node.js:

| Langkah | Waktu | Memori puncak |
|---|---|---|
| Snapshot pertama (awal): impor, deteksi R01–R08, skor semua item | ±78 dtk | ±490 MB |
| Snapshot revisi berukuran penuh: diff, pewarisan hasil deteksi, skor ulang, cek tindak lanjut | ±88 dtk | ±780 MB |

Tidak ada baris galat. Rencanakan memori ≥ 1 GB untuk proses API saat mengimpor eselon I terbesar, dan jalankan impor besar lewat mode asinkron (`async=true`) supaya UI memantau progres lewat `GET /api/jobs/:id`. Impor berjalan dalam satu transaksi di satu event loop: permintaan lain tetap dilayani lewat koneksi baca terpisah, tetapi progres bergerak berkala (bukan mulus).
