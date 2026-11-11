const DAY_MS = 86_400_000;

/**
 * Selisih hari kalender (UTC) dari `now` ke `target`; negatif bila lewat. Tenggat disimpan sebagai tanggal (tengah malam UTC),
 * jadi "sisa N hari" dihitung per tanggal, bukan per 24 jam: 21 jam sebelum tenggat berarti sisa 1 hari, tidak 0 (selaras
 * dengan penghitung sisa hari di web).
 */
export function calendarDaysUntil(target: number, now: number = Date.now()): number {
  return Math.floor(target / DAY_MS) - Math.floor(now / DAY_MS);
}
