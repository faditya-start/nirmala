import type { Expectation } from "@nirmala/shared";

/**
 * One reading of a structured expectation for screens: "Ganti akun ke 521111", "Hapus item".
 * The machine codes (ganti_akun, hapus_item) stay in the data and in the printed CHR; screens use plain Indonesian.
 */
export function expectationSentence(expectation: Expectation, formatNumber: (value: number) => string): string {
  switch (expectation.type) {
    case "ganti_akun":
      return `Ganti akun ke ${expectation.to}`;
    case "hapus_item":
      return "Hapus item";
    case "turunkan_nilai": {
      const limits: string[] = [];
      if (expectation.maxUnitPrice !== undefined) limits.push(`harga ≤ ${formatNumber(expectation.maxUnitPrice)}`);
      if (expectation.maxTotal !== undefined) limits.push(`total ≤ ${formatNumber(expectation.maxTotal)}`);
      return `Turunkan nilai: ${limits.join(", ")}`;
    }
    case "rinci_item":
      return "Rinci item";
    case "manual":
      return "Periksa manual";
  }
}
