import type { ImportJobDto, SnapshotUploadResponse } from "@nirmala/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, errorMessage } from "../../lib/api";
import { fetchJob, uploadSnapshot, type UploadInput } from "./api";

export interface RunContext {
  cycleId: string;
  fileName: string;
  fileSize: number;
  organizationName: string;
  versionNo: number;
  versionLabel: string;
}

export type RunnerState =
  | { phase: "idle" }
  | { phase: "uploading"; context: RunContext; loaded: number; total: number }
  | { phase: "running"; context: RunContext; jobId: string; job: ImportJobDto | null; pollFailures: number }
  | { phase: "done"; context: RunContext; response: SnapshotUploadResponse }
  | { phase: "error"; context: RunContext; message: string; /** The server no longer knows the job: list must be reloaded. */ lost: boolean; jobId: string | null };

const POLL_INTERVAL_MS = 1000;
/** After this many failed polls in a row the person decides whether to keep waiting. */
const MAX_POLL_FAILURES = 5;

/**
 * Upload + job polling for one import at a time. Lives in the page (not the dialog) so closing the dialog
 * does not stop the poll. Polling is sequential (next request only after the previous answered).
 */
export function useImportRunner(onSettled?: () => void) {
  const [state, setState] = useState<RunnerState>({ phase: "idle" });
  const aliveRef = useRef(true);
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearTimer();
      abortRef.current?.abort();
    };
  }, [clearTimer]);

  const poll = useCallback(
    (context: RunContext, jobId: string, failures: number) => {
      clearTimer();
      timerRef.current = window.setTimeout(async () => {
        if (!aliveRef.current) return;
        abortRef.current = new AbortController();
        try {
          const job = await fetchJob(jobId, abortRef.current.signal);
          if (!aliveRef.current) return;
          if (job.status === "selesai" && job.result) {
            setState({ phase: "done", context, response: job.result });
            settledRef.current?.();
            return;
          }
          if (job.status === "gagal") {
            setState({ phase: "error", context, message: job.error ?? "Impor gagal diproses.", lost: false, jobId });
            settledRef.current?.();
            return;
          }
          setState({ phase: "running", context, jobId, job, pollFailures: 0 });
          poll(context, jobId, 0);
        } catch (error) {
          if (!aliveRef.current || (error instanceof DOMException && error.name === "AbortError")) return;
          if (error instanceof ApiError && error.status === 404) {
            setState({
              phase: "error",
              context,
              message: "Proses impor tidak ditemukan di server, kemungkinan server dimulai ulang. Muat ulang daftar snapshot untuk melihat apakah impor sempat selesai.",
              lost: true,
              jobId
            });
            settledRef.current?.();
            return;
          }
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            setState({ phase: "error", context, message: error.message, lost: false, jobId });
            return;
          }
          const next = failures + 1;
          if (next >= MAX_POLL_FAILURES) {
            setState({
              phase: "error",
              context,
              message: `Status impor tidak dapat dibaca: ${errorMessage(error)} Prosesnya mungkin masih berjalan di server.`,
              lost: false,
              jobId
            });
            return;
          }
          setState((previous) => (previous.phase === "running" ? { ...previous, pollFailures: next } : previous));
          poll(context, jobId, next);
        }
      }, POLL_INTERVAL_MS);
    },
    [clearTimer]
  );

  const start = useCallback(
    async (context: RunContext, input: UploadInput) => {
      if (state.phase === "uploading" || state.phase === "running") return;
      clearTimer();
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setState({ phase: "uploading", context, loaded: 0, total: input.file.size });
      try {
        const outcome = await uploadSnapshot(context.cycleId, input, {
          signal: abortRef.current.signal,
          onProgress: (loaded, total) => {
            if (!aliveRef.current) return;
            setState((previous) => (previous.phase === "uploading" ? { ...previous, loaded, total } : previous));
          }
        });
        if (!aliveRef.current) return;
        if (outcome.kind === "done") {
          setState({ phase: "done", context, response: outcome.response });
          settledRef.current?.();
          return;
        }
        setState({ phase: "running", context, jobId: outcome.jobId, job: null, pollFailures: 0 });
        poll(context, outcome.jobId, 0);
      } catch (error) {
        if (!aliveRef.current || (error instanceof DOMException && error.name === "AbortError")) return;
        setState({ phase: "error", context, message: errorMessage(error, "Berkas tidak dapat diunggah. Coba lagi."), lost: false, jobId: null });
      }
    },
    [clearTimer, poll, state.phase]
  );

  /** Keep waiting after the poll gave up. */
  const resume = useCallback(() => {
    if (state.phase !== "error" || !state.jobId || state.lost) return;
    const { context, jobId } = state;
    setState({ phase: "running", context, jobId, job: null, pollFailures: 0 });
    poll(context, jobId, 0);
  }, [poll, state]);

  const reset = useCallback(() => {
    clearTimer();
    abortRef.current?.abort();
    setState({ phase: "idle" });
  }, [clearTimer]);

  const busy = state.phase === "uploading" || state.phase === "running";
  return { state, busy, start, resume, reset };
}
