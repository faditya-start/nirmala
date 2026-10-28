# NIRMALA

**Budget Review & Follow-up Intelligence**

NIRMALA adalah fondasi aplikasi pendukung reviu RKA, prioritisasi pemeriksaan berbasis risiko yang dapat dijelaskan, pengelolaan CHR, dan pemantauan tindak lanjut.

## Status saat ini

Repository kini mencakup fondasi domain, autentikasi demo lokal, dan RBAC dasar:

- React + Vite frontend dengan identitas visual NIRMALA.
- Hono API yang berjalan pada Node.js untuk development lokal.
- Shared TypeScript contracts.
- Schema Drizzle untuk users, sessions, struktur organisasi, RKA, referensi harga, risk assessment, dan audit log.
- Konfigurasi awal yang dapat dilanjutkan ke Cloudflare D1.
- Endpoint `GET /api/health`.
- Login cookie-session dengan password di-hash menggunakan scrypt.
- Data demo sintetis yang dapat di-seed ulang.

Risk triage, keputusan reviewer, CHR, Smart Tracker, laporan, dan dashboard lengkap belum dianggap selesai.

## Prasyarat

- Node.js 20 atau lebih baru
- npm 10 atau lebih baru

## Menjalankan lokal

```powershell
npm install
npm run dev
```

Frontend tersedia di `http://localhost:5173`, sedangkan API tersedia di `http://localhost:8787`.

Pemeriksaan API:

```powershell
Invoke-WebRequest http://localhost:8787/api/health
```

## Perintah

```powershell
npm run typecheck
npm run build
npm run db:generate
npm run db:migrate
npm run db:seed
```

## Akun demo lokal

- Reviewer: `reviewer.demo` / `Review123!`
- Pimpinan: `pimpinan.demo` / `Pimpin123!`
- Admin: `admin.demo` / `Admin123!`

Ganti `SESSION_SECRET` pada `.env` lokal sebelum penggunaan selain demo. Akun dan data di atas seluruhnya sintetis.

## Arah arsitektur

Frontend memakai React/Vite dan akan berkomunikasi dengan Hono melalui REST API. API saat ini menggunakan adapter Node.js agar mudah diuji secara lokal, dengan batasan platform dijaga agar service dapat dipindahkan ke Cloudflare Workers. SQLite digunakan sebagai target development Drizzle; migrasi berikutnya akan menyesuaikan schema untuk D1.

Tidak ada secret atau kredensial demo pada repository. Gunakan `.env.example` sebagai referensi konfigurasi lokal.

## Prinsip produk

Risk score hanya membantu memprioritaskan pemeriksaan. Sistem tidak menetapkan fraud atau pelanggaran secara otomatis. Data demo yang akan ditambahkan pada tahap berikutnya harus sintetis dan tidak merepresentasikan data pemerintah resmi.
