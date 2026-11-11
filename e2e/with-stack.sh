#!/usr/bin/env bash
# Menyalakan stack NYATA (API + web dev, tanpa mock) dengan DB SQLite baru, menjalankan satu perintah, lalu mematikan stack.
# Pakai: e2e/with-stack.sh node e2e/core-loop.mjs
# Env: E2E_API_PORT (default 8811), E2E_WEB_PORT (default 5211), E2E_DIR (default direktori temp baru).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PORT="${E2E_API_PORT:-8811}"
WEB_PORT="${E2E_WEB_PORT:-5211}"
DIR="${E2E_DIR:-$(mktemp -d)}"
mkdir -p "$DIR"
export DATABASE_PATH="$DIR/e2e.sqlite"
cd "$ROOT" || exit 2
rm -f "${DATABASE_PATH:?}" "${DATABASE_PATH:?}-wal" "${DATABASE_PATH:?}-shm"
npm run build -w @nirmala/shared >/dev/null 2>&1
npm run db:migrate -w @nirmala/api >"$DIR/migrate.log" 2>&1 && npm run db:seed:e2e -w @nirmala/api >"$DIR/seed.log" 2>&1 || { echo "Migrasi/seed gagal, lihat $DIR"; cat "$DIR/seed.log"; exit 2; }
API_PORT="$API_PORT" setsid npm run dev -w @nirmala/api >"$DIR/api.log" 2>&1 &
API_PID=$!
API_PORT="$API_PORT" setsid npm run dev -w @nirmala/web -- --port "$WEB_PORT" --strictPort >"$DIR/web.log" 2>&1 &
WEB_PID=$!
# setsid: tiap proses memimpin grup sendiri, jadi kill -PID menghentikan npm beserta turunannya (tsx, vite).
cleanup() { kill -- "-$API_PID" "-$WEB_PID" 2>/dev/null; }
trap cleanup EXIT
for _ in $(seq 1 60); do
  curl -fs "http://localhost:$WEB_PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fs "http://localhost:$WEB_PORT/api/health" >/dev/null 2>&1 || { echo "Stack tidak naik, lihat $DIR/api.log dan $DIR/web.log"; exit 2; }
BASE_URL="http://localhost:$WEB_PORT" "$@"
STATUS=$?
echo "Log stack: $DIR"
exit $STATUS
