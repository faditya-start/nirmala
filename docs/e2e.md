# Uji end-to-end loop inti (stack nyata)

`e2e/core-loop.mjs` menjalankan loop inti NIRMALA di browser sungguhan terhadap API dan web **tanpa mock** (`VITE_MOCK` tidak diisi). Skrip ini juga menangkap setiap `console.error`, `pageerror`, respons HTTP 4xx/5xx, dan request gagal; yang tidak terduga membuat langkah itu FAIL.

Cakupan (±40 langkah, 4 peran): login (galat, redirect, kembali ke halaman semula) -> impor Awal lewat dialog (job async, file sama, hasil impor) -> Risk Triage (filter, status di URL, halaman, Sebelumnya/Berikutnya) -> konfirmasi (ekspektasi bawaan dan ubahan lewat pemilih akun) dan dismiss -> CHR (rekomendasi autosimpan, catatan manual, ubah, hapus, terbitkan, terkunci, cetak, tanggapan UKI, adendum, riwayat versi) -> impor Revisi (cek otomatis) -> Smart Tracker (tab, setujui massal, setujui, kembalikan, justifikasi UKI, terima justifikasi) -> Progres Satker -> CHR Selesai -> penjagaan peran (pimpinan dan UKI baca saja, 403 dari API) dan scope eselon I (reviewer/UKI hanya 90001, admin/pimpinan melihat 90002) -> sesi kedaluwarsa dan keluar. Badge shell ("Perlu tindakan" dan badge sidebar) diperiksa setelah impor, konfirmasi, terbit, impor Revisi, setujui massal, dan penutupan CHR.

## Prasyarat

- `npm install` (memasang `playwright-core`) dan Chromium. Skrip mencari `CHROMIUM_PATH`, lalu `~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, `/usr/bin/chromium`, `/usr/bin/chromium-browser`, `/usr/bin/google-chrome`.
- Data sintetis dari `apps/api/fixtures/synthetic/` (tidak ada data nyata).
- **DB harus baru.** Skrip mengunggah snapshot Awal dan Revisi lewat UI, jadi DB yang sudah memuat snapshot membuat langkah impor gagal. Pakai seed khusus e2e (`db:seed:e2e`): master data, akun demo, dan satu siklus TA 2026 Alokasi **tanpa snapshot**.

## Menjalankan

Cara paling mudah, satu perintah. Skrip menyiapkan DB sementara, menyalakan API dan web dev, menjalankan uji, lalu mematikan semuanya:

```bash
npm run e2e:core:fresh
# opsional: CHROMIUM_PATH=/path/ke/chrome E2E_API_PORT=8811 E2E_WEB_PORT=5211 E2E_DIR=/tmp/e2e-run npm run e2e:core:fresh
```

Manual (mis. untuk menguji build produksi satu proses):

```bash
export DATABASE_PATH=/tmp/e2e/e2e.sqlite
npm run build -w @nirmala/shared
npm run db:migrate -w @nirmala/api && npm run db:seed:e2e -w @nirmala/api

# Pengembangan: API + Vite (proxy /api ke API_PORT)
API_PORT=8811 npm run dev -w @nirmala/api &
API_PORT=8811 npm run dev -w @nirmala/web -- --port 5211 &
BASE_URL=http://localhost:5211 npm run e2e:core

# Produksi (satu proses, API menyajikan apps/web/dist):
npm run build -w @nirmala/web
SESSION_SECRET=$(openssl rand -base64 48) API_PORT=8815 npm start &
BASE_URL=http://localhost:8815 npm run e2e:core
```

Lingkungan: `BASE_URL` (default `http://localhost:5211`), `CHROMIUM_PATH`, `FIXTURE_DIR` (default fixtures sintetis), `ARTIFACT_DIR` (screenshot kegagalan, default `./e2e-artifacts`, di-gitignore), `HEADED=1` (jendela terlihat), `E2E_DEBUG=1` (cetak teks halaman saat gagal).

## Membaca hasil

```
PASS  S5 detail: konfirmasi item R01 dengan ekspektasi bawaan, badge shell turun (2810 ms)
FAIL  S6 CHR draf: rekomendasi tersimpan otomatis ...
      <pesan; "Galat konsol/jaringan tak terduga" memuat daftar request/galat>
38/40 langkah PASS, 2 FAIL
```

- Kode keluar 0 = semua PASS, 1 = ada FAIL, 2 = prasyarat tidak ada.
- Langkah saling bergantung (keadaan DB berlanjut), jadi satu FAIL awal dapat menggagalkan langkah setelahnya. Perbaiki yang pertama dulu.
- Galat yang memang diharapkan (401 saat sandi salah, 401 saat sesi dibuang) didaftarkan per langkah lewat `expectIssue`. `ERR_ABORTED` (request dibatalkan saat pindah halaman atau efek React) diabaikan.
- Screenshot setiap sesi (reviewer/uki/leader/admin) disimpan di `ARTIFACT_DIR` saat langkah gagal.
- Jalankan ulang dengan DB baru setiap kali; memakai ulang DB lama membuat langkah impor gagal.

## Akun demo

`reviewer.demo / Review123!`, `uki.demo / Uki12345!`, `pimpinan.demo / Pimpin123!`, `admin.demo / Admin123!` (seed sintetis; jangan dipakai di produksi, lihat `docs/deploy.md`).
