/**
 * Membangkitkan fixtures sintetis ke apps/api/fixtures/synthetic/.
 * Skrip ini TIDAK membaca data/private. Jalankan: npm run generate:synthetic -w @nirmala/api
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixtureFiles } from "./syntheticData.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/synthetic");
for (const [name, content] of Object.entries(buildFixtureFiles())) {
  const target = join(root, name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
  console.log(`ditulis ${name}`);
}
