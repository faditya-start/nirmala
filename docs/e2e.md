# Uji end to end (stack sungguhan, tanpa mock)

Skrip memakai `playwright-core` (devDependency di root) dan Chromium yang sudah ada di mesin (`CHROMIUM_PATH`, default `~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`). Setiap langkah mencatat galat konsol, pelanggaran CSP, dan respons jaringan gagal/4xx/5xx; yang tidak diharapkan membuat langkah itu FAIL.

## Rest (dashboard, laporan, admin, publik, production)

Cakupan: dashboard 4 peran, laporan (filter, ekspor CSV: BOM, nama berkas, jumlah baris sama dengan "Catatan terbit"), admin (aturan: sakelar, panel edit tiap jenis aturan, regex salah; bobot: versi baru dan job hitung ulang dengan polling; pengguna: buat, akses eselon I, nonaktif, login ditolak, pengguna tanpa akses, penjagaan nonaktif diri sendiri; siklus: buat, duplikat 409, ubah, tandai dan tarik DIPA; audit log: facet, filter, halaman), halaman publik (kosong sebelum DIPA, hanya agregat sesudahnya, 390/768/1440 tanpa gulir horizontal, tidak ada nama Satker atau item), layar 403 dan 401, dan mode produksi satu proses (header CSP, fallback SPA, 404 JSON, cache, font self-hosted, tanpa host luar).

Persiapan (dari root repo; skrip `db:*` membaca `DATABASE_PATH`):

```bash
npm install
npm run build -w @nirmala/shared
export DATABASE_PATH=/tmp/nirmala-e2e.sqlite
npm run db:migrate -w @nirmala/api && npm run db:seed -w @nirmala/api && npm run db:seed:demo -w @nirmala/api

# dev: API 8821 + web 5221 (tanpa VITE_MOCK)
API_PORT=8821 npm run dev -w @nirmala/api &
API_PORT=8821 npm run dev -w @nirmala/web -- --port 5221 &

# produksi satu proses: web hasil build disajikan API (port 8822, DB salinan)
npm run build -w @nirmala/web
cp $DATABASE_PATH /tmp/nirmala-e2e-prod.sqlite
NODE_ENV=production SESSION_SECRET=$(openssl rand -base64 48) DATABASE_PATH=/tmp/nirmala-e2e-prod.sqlite \
  API_PORT=8822 WEB_ORIGIN=http://127.0.0.1:8822 PUBLIC_MIN_NOTES=9 PUBLIC_DATA_SYNTHETIC=true npm start &
```

Jalankan:

```bash
BASE_URL=http://127.0.0.1:5221 PROD_URL=http://127.0.0.1:8822 npm run e2e:rest
ONLY=laporan,admin-users npm run e2e:rest          # bagian tertentu
```

Bagian: `dashboard`, `laporan`, `admin-rules`, `admin-weights`, `admin-users`, `cycles-public`, `admin-audit`, `states`, `production` (hanya bila `PROD_URL` diisi). Keluaran `PASS`/`FAIL` per cek, kode keluar 1 bila ada yang gagal. Variabel: `BASE_URL`, `PROD_URL`, `CHROMIUM_PATH`, `SHOTS` (folder tangkapan layar opsional).

Catatan:

- Jalankan pada database yang baru dibuat. Skrip membuat pengguna `qa.<kode>` (dinonaktifkan di akhir), siklus uji tahun 2090-an (status Selesai), mengubah dan mengembalikan teks aturan, menambah satu versi bobot (jumlah tetap 100), serta menandai lalu menarik DIPA siklus aktif. Semuanya aman diulang.
- Penggabungan "Lainnya" hanya terjadi bila ada eselon I dengan catatan < `PUBLIC_MIN_NOTES`. Dengan data demo (8 dan 5 catatan), jalankan API dengan `PUBLIC_MIN_NOTES=9` supaya terlihat; skrip menandai apakah penggabungan teruji.
- `/api/public/*` di-cache browser 5 menit, jadi skrip memakai konteks browser baru untuk tiap kunjungan publik.
