import type { IngestHooks } from "../ingest/ingestService.js";
import { runFollowUpChecks } from "../tracker/followUp.js";
import { detectionHooks } from "./detectionPipeline.js";

/** Hook tracker (Fase 5): cek tindak lanjut otomatis untuk snapshot revisi (v >= 2). */
export function trackerHooks(): IngestHooks {
  return {
    afterSnapshot: async ({ db, snapshot }) => {
      await runFollowUpChecks(db, snapshot);
    }
  };
}

/**
 * Hook impor standar, urutan wajib (docs/api-contract.md §2.5): (2) deteksi aturan + skor, lalu (3) cek tindak lanjut.
 * Semuanya berjalan di dalam transaksi impor; galat di salah satunya membatalkan seluruh impor.
 */
export function importHooks(): IngestHooks {
  const detection = detectionHooks();
  const tracker = trackerHooks();
  return {
    afterSnapshot: async (context) => {
      await detection.afterSnapshot?.(context);
      await tracker.afterSnapshot?.(context);
    }
  };
}
