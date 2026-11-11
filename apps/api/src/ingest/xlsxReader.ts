import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { createInflateRaw } from "node:zlib";
import type { Readable } from "node:stream";

/**
 * Pembaca xlsx minimal tanpa dependensi (zip via node:zlib, XML via regex).
 * Cukup untuk berkas ekspor tabel biasa. Tidak mendukung zip64, rumus, atau gaya sel.
 * Sheet dibaca streaming per baris, jadi berkas puluhan MB tidak dimuat sekaligus.
 */

interface ZipEntry { method: number; compressedSize: number; localHeaderOffset: number }

const EOCD = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

async function readZipEntries(path: string): Promise<Map<string, ZipEntry>> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const tailLength = Math.min(size, 65_557);
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, size - tailLength);
    const eocd = tail.lastIndexOf(EOCD);
    if (eocd < 0) throw new Error("Bukan berkas xlsx/zip yang valid.");
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    if (centralOffset === 0xffffffff) throw new Error("Zip64 tidak didukung.");
    const central = Buffer.alloc(centralSize);
    await handle.read(central, 0, centralSize, centralOffset);

    const entries = new Map<string, ZipEntry>();
    for (let position = 0; position + 46 <= central.length && central.readUInt32LE(position) === 0x02014b50;) {
      const nameLength = central.readUInt16LE(position + 28);
      const extraLength = central.readUInt16LE(position + 30);
      const commentLength = central.readUInt16LE(position + 32);
      entries.set(central.toString("utf8", position + 46, position + 46 + nameLength), {
        method: central.readUInt16LE(position + 10),
        compressedSize: central.readUInt32LE(position + 20),
        localHeaderOffset: central.readUInt32LE(position + 42)
      });
      position += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally { await handle.close(); }
}

async function openEntry(path: string, entry: ZipEntry): Promise<Readable> {
  const handle = await open(path, "r");
  let dataStart: number;
  try {
    const header = Buffer.alloc(30);
    await handle.read(header, 0, 30, entry.localHeaderOffset);
    dataStart = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  } finally { await handle.close(); }
  if (entry.compressedSize === 0) return createReadStream(path, { start: dataStart, end: dataStart - 1 });
  const raw = createReadStream(path, { start: dataStart, end: dataStart + entry.compressedSize - 1 });
  if (entry.method === 0) return raw;
  if (entry.method !== 8) throw new Error(`Metode kompresi zip ${entry.method} tidak didukung.`);
  return raw.pipe(createInflateRaw());
}

async function* textChunks(stream: Readable): AsyncGenerator<string> {
  stream.setEncoding("utf8");
  for await (const chunk of stream) yield chunk as string;
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (value: string) => value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (match, name: string) => {
  if (name[0] === "#") return String.fromCodePoint(name[1] === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
  return entities[name] ?? match;
});

async function readText(path: string, entries: Map<string, ZipEntry>, name: string): Promise<string> {
  const entry = entries.get(name);
  if (!entry) throw new Error(`Berkas ${name} tidak ada di dalam xlsx.`);
  let out = "";
  for await (const chunk of textChunks(await openEntry(path, entry))) out += chunk;
  return out;
}

const stringsOf = (xml: string) => [...xml.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)].map((match) => decode(match[1] ?? "")).join("");

async function readSharedStrings(path: string, entries: Map<string, ZipEntry>): Promise<string[]> {
  if (!entries.has("xl/sharedStrings.xml")) return [];
  const xml = await readText(path, entries, "xl/sharedStrings.xml");
  return [...xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((match) => stringsOf((match[1] ?? "").replace(/<rPh\b[\s\S]*?<\/rPh>/g, "")));
}

async function resolveSheetPath(path: string, entries: Map<string, ZipEntry>, sheetName: string | undefined): Promise<string> {
  const workbook = await readText(path, entries, "xl/workbook.xml");
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*?)\/>/g)].map((match) => ({
    name: decode(/\bname="([^"]*)"/.exec(match[1])?.[1] ?? ""),
    id: /\br:id="([^"]*)"/.exec(match[1])?.[1] ?? ""
  }));
  const sheet = sheetName === undefined ? sheets[0] : sheets.find((candidate) => candidate.name === sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" tidak ditemukan. Yang ada: ${sheets.map((candidate) => candidate.name).join(", ")}.`);
  const rels = await readText(path, entries, "xl/_rels/workbook.xml.rels");
  for (const match of rels.matchAll(/<Relationship\b([^>]*?)\/>/g)) {
    if (/\bId="([^"]*)"/.exec(match[1])?.[1] !== sheet.id) continue;
    const target = /\bTarget="([^"]*)"/.exec(match[1])?.[1] ?? "";
    return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  }
  throw new Error(`Relasi sheet "${sheet.name}" tidak ditemukan.`);
}

export interface SheetRow { row: number; cells: Record<string, string> }

/** Membaca satu sheet (nama sheet, atau sheet pertama) sebagai baris demi baris. Kunci `cells` = huruf kolom (A, B, ..., AA). */
export async function* readSheetRows(path: string, sheetName?: string): AsyncGenerator<SheetRow> {
  const entries = await readZipEntries(path);
  const sharedStrings = await readSharedStrings(path, entries);
  const sheetPath = await resolveSheetPath(path, entries, sheetName);
  const entry = entries.get(sheetPath);
  if (!entry) throw new Error(`Berkas ${sheetPath} tidak ada di dalam xlsx.`);

  const rowPattern = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let buffer = "";
  for await (const chunk of textChunks(await openEntry(path, entry))) {
    buffer += chunk;
    let consumed = 0;
    rowPattern.lastIndex = 0;
    for (let match = rowPattern.exec(buffer); match; match = rowPattern.exec(buffer)) {
      consumed = rowPattern.lastIndex;
      const rowNumber = Number(/\br="(\d+)"/.exec(match[1])?.[1]);
      if (!rowNumber) continue;
      const cells: Record<string, string> = {};
      for (const cell of (match[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const column = /\br="([A-Z]+)\d+"/.exec(cell[1])?.[1];
        if (!column || cell[2] === undefined) continue;
        const type = /\bt="([^"]*)"/.exec(cell[1])?.[1];
        let value: string | undefined;
        if (type === "inlineStr") value = stringsOf(cell[2]);
        else {
          const raw = /<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1];
          if (raw !== undefined) value = type === "s" ? sharedStrings[Number(raw)] : decode(raw);
        }
        if (value !== undefined && value !== "") cells[column] = value;
      }
      yield { row: rowNumber, cells };
    }
    buffer = buffer.slice(consumed);
  }
}
