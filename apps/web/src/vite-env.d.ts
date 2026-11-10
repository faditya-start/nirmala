/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" answers every /api request from registered mocks (lib/mock.ts). */
  readonly VITE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
