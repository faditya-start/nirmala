# NIRMALA

**Budget Review & Follow-up Intelligence**

NIRMALA adalah fondasi aplikasi pendukung reviu RKA, prioritisasi pemeriksaan berbasis risiko yang dapat dijelaskan, pengelolaan CHR, dan pemantauan tindak lanjut.

## Status saat ini

Repository ini baru berada pada fase **foundation** sesuai keputusan implementasi awal:

- React + Vite frontend dengan identitas visual NIRMALA.
- Hono API yang berjalan pada Node.js untuk development lokal.
- Shared TypeScript contracts.
- Drizzle schema awal untuk users dan sessions.
- Konfigurasi awal yang dapat dilanjutkan ke Cloudflare D1.
- Endpoint `GET /api/health`.
- Struktur cookie-session sudah ditetapkan, tetapi login penuh belum aktif.

Fitur bisnis seperti risk triage, risk scoring, CHR, Smart Tracker, dan dashboard belum dianggap selesai pada fase ini.

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

## Arah arsitektur

Frontend memakai React/Vite dan akan berkomunikasi dengan Hono melalui REST API. API saat ini menggunakan adapter Node.js agar mudah diuji secara lokal, dengan batasan platform dijaga agar service dapat dipindahkan ke Cloudflare Workers. SQLite digunakan sebagai target development Drizzle; migrasi berikutnya akan menyesuaikan schema untuk D1.

Tidak ada secret atau kredensial demo pada repository. Gunakan `.env.example` sebagai referensi konfigurasi lokal.

## Prinsip produk

Risk score hanya membantu memprioritaskan pemeriksaan. Sistem tidak menetapkan fraud atau pelanggaran secara otomatis. Data demo yang akan ditambahkan pada tahap berikutnya harus sintetis dan tidak merepresentasikan data pemerintah resmi.
