import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema.js";

type Statement = {
  run(...values: unknown[]): unknown;
  all(...values: unknown[]): unknown[];
  setReturnArrays(enabled: boolean): void;
};
type Sqlite = { exec(sql: string): void; prepare(sql: string): Statement; close(): void };

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => Sqlite };

export type Db = SqliteRemoteDatabase<typeof schema>;

export interface Database {
  /** Query builder Drizzle (async). Gunakan lewat repository. */
  db: Db;
  /**
   * Jalankan `fn` dalam satu transaksi (BEGIN IMMEDIATE ... COMMIT; ROLLBACK jika melempar).
   * Transaksi diserialkan. Query tulis dari konteks async lain menunggu sampai transaksi selesai,
   * jadi tidak pernah ikut ter-commit / ter-rollback secara tidak sengaja. Query baca dari konteks lain
   * (database berkas, bukan `:memory:`) tetap berjalan lewat koneksi baca kedua dan melihat data yang sudah
   * ter-commit, sehingga impor besar tidak membekukan API (mis. polling `GET /api/jobs/:id`).
   * Pemanggilan bersarang bergabung ke transaksi yang sedang berjalan.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  /** Hanya untuk migrasi dan test infrastruktur; jangan dipakai di kode aplikasi. */
  sqlite: Sqlite;
  close(): void;
}

/**
 * Koneksi `node:sqlite` + WAL + foreign keys, dibungkus Drizzle `sqlite-proxy`.
 * Path `:memory:` didukung untuk test.
 */
export function createDatabase(path: string): Database {
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

  // Koneksi baca kedua (WAL: pembaca tidak memblokir penulis). Tidak tersedia untuk `:memory:`.
  const reader = path === ":memory:" ? null : new DatabaseSync(path, { readOnly: true });
  reader?.exec("PRAGMA busy_timeout = 5000;");
  const insideTransaction = new AsyncLocalStorage<true>();
  let lock: Promise<void> = Promise.resolve();
  let active: Promise<void> | null = null;

  const execute = async (sql: string, params: unknown[], method: "run" | "all" | "values" | "get") => {
    const outside = !insideTransaction.getStore();
    const readOnlyQuery = method !== "run" && /^\s*(select|with)\b/i.test(sql);
    const connection = reader && active && outside && readOnlyQuery ? reader : sqlite;
    if (connection === sqlite) while (active && outside) await active;
    const statement = connection.prepare(sql);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    statement.setReturnArrays(true);
    const rows = statement.all(...params) as unknown[][];
    return { rows: method === "get" ? (rows[0] ?? []) : rows };
  };

  const db = drizzle(execute as never, undefined, { schema });

  async function transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (insideTransaction.getStore()) return fn();
    const previous = lock;
    let release!: () => void;
    const mine = new Promise<void>((resolve) => { release = resolve; });
    lock = mine;
    await previous;
    active = mine;
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = await insideTransaction.run(true, fn);
      sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    } finally {
      active = null;
      release();
    }
  }

  return { db, transaction, sqlite, close: () => { reader?.close(); sqlite.close(); } };
}

let shared: Database | undefined;

/** Koneksi proses (dari `DATABASE_PATH`). Test memakai `createDatabase` sendiri. */
export function getDatabase(): Database {
  shared ??= createDatabase(process.env.DATABASE_PATH ?? "./nirmala.sqlite");
  return shared;
}
