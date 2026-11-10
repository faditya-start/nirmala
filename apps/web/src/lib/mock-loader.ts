/**
 * Loads default mocks and every `features/<fitur>/mock.ts`. Imported dynamically from main.tsx
 * only when VITE_MOCK === "1", so none of this ships in a normal build's entry chunk.
 */
import { registerDefaultMocks } from "./mock-defaults";

export async function loadMocks(): Promise<void> {
  registerDefaultMocks();
  const modules = import.meta.glob("../features/*/mock.ts");
  await Promise.all(Object.values(modules).map((load) => load()));
  console.info(`[mock] mode simulasi aktif, ${Object.keys(modules).length} modul fitur dimuat`);
}
