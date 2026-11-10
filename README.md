# NIRMALA

Platform pendukung reviu RKA untuk APIP dan unit perencanaan K/L pada fase Pra-DIPA. NIRMALA memprioritaskan item RKA berisiko dengan aturan dan skor yang bisa dijelaskan, lalu mengawal setiap catatan CHR sampai perbaikan Satker terbukti di versi anggaran berikutnya. Reviewer yang menutup catatan, bukan sistem.

Skor hanya membantu memprioritaskan peninjauan. Sistem tidak menetapkan pelanggaran secara otomatis.

## Dokumen acuan

Baca berurutan sebelum mengembangkan:

1. [docs/concept-brief.md](docs/concept-brief.md): acuan produk
2. [docs/mvp-scope.md](docs/mvp-scope.md): scope MVP, user flow, daftar layar
3. [docs/data-analysis.md](docs/data-analysis.md): data yang tersedia
4. [docs/rule-catalog.md](docs/rule-catalog.md): aturan dan faktor skor
5. [docs/data-model.md](docs/data-model.md): skema
6. [docs/plan.md](docs/plan.md): fase pengembangan dan backlog

Konteks produk untuk alat desain ada di [PRODUCT.md](PRODUCT.md). Desain UI ada di `design/nirmala.pen` (dibuka lewat Pencil).

## Arsitektur

- **Frontend:** React + Vite + TypeScript (`apps/web`).
- **API:** Hono di Node.js (`apps/api`), database **SQLite** (`node:sqlite`) dengan Drizzle (D-01).
- **Kontrak bersama:** `packages/shared`, validasi dengan zod.
- **Hosting:** server sendiri dengan Cloudflare Tunnel; target Cloudflare Workers / D1 sudah dibuang (D-02).
- **Data masuk:** impor CSV berformat SIPEKA. Tidak ada integrasi SAKTI (D-03).
- **Data:** demo dan seed memakai data sintetis. Data asli hanya di server sendiri (`data/private/`, tidak masuk git) (D-07).

Status pengembangan mengikuti fase di [docs/plan.md](docs/plan.md). Aplikasi masih dalam proses rombak dari prototipe awal ke MVP; beberapa layar dan endpoint lama bertahan sementara sampai fase penggantinya selesai.

## Prasyarat

- Node.js 22 atau lebih baru (API memakai `node:sqlite`)
- npm 10 atau lebih baru

## Menjalankan lokal

```bash
cp .env.example .env
npm install
npm run db:seed
npm run dev
```

Frontend di `http://localhost:5173`, API di `http://localhost:8787`. Jalankan hanya satu instance `npm run dev`. Jika muncul `EADDRINUSE`, hentikan proses lama di port `5173` atau `8787`. Vite memakai `strictPort` supaya proxy tidak diam-diam menunjuk ke port yang salah. Port API bisa diganti dengan `API_PORT`.

Akun demo (sintetis, hanya untuk lokal):

| Peran | Username | Password |
|---|---|---|
| Reviewer | `reviewer.demo` | `Review123!` |
| Pimpinan | `pimpinan.demo` | `Pimpin123!` |
| Admin | `admin.demo` | `Admin123!` |

Ganti `SESSION_SECRET` di `.env` sebelum penggunaan selain demo lokal.

Pemeriksaan API: `curl http://localhost:8787/api/health`

## Perintah

```bash
npm run typecheck   # semua workspace
npm test            # semua workspace
npm run build
npm run db:seed
```

`db:generate` dan `db:migrate` akan dipakai penuh setelah skema Drizzle baru (Fase 1).
