/**
 * Calls for S3 (docs/api-contract.md section 3.2). Paths are relative to /api.
 * Only the multipart upload bypasses `api`: the shared client sends JSON, and a CSV of ~170k rows needs
 * upload progress, so it goes through XMLHttpRequest (mock mode still goes through the mock layer).
 */
import type {
  ImportJobDto,
  ImportOverviewResponse,
  ImportResultDto,
  SnapshotLookupResponse,
  SnapshotUploadAcceptedResponse,
  SnapshotUploadResponse
} from "@nirmala/shared";
import { API_BASE, ApiError, IS_MOCK, api, request } from "../../lib/api";
import { toHex } from "./logic";

const cycleBase = (cycleId: string) => `/cycles/${encodeURIComponent(cycleId)}`;

export function fetchImportOverview(cycleId: string, signal?: AbortSignal): Promise<ImportOverviewResponse> {
  return api.get<ImportOverviewResponse>(`${cycleBase(cycleId)}/import-overview`, { signal });
}

export function fetchImportResult(cycleId: string, snapshotId: string, signal?: AbortSignal): Promise<ImportResultDto> {
  return api.get<ImportResultDto>(`${cycleBase(cycleId)}/snapshots/${encodeURIComponent(snapshotId)}/result`, { signal });
}

export function lookupSnapshot(cycleId: string, fileHash: string, signal?: AbortSignal): Promise<SnapshotLookupResponse> {
  return api.get<SnapshotLookupResponse>(`${cycleBase(cycleId)}/snapshots/lookup`, { query: { fileHash }, signal });
}

export function fetchJob(jobId: string, signal?: AbortSignal): Promise<ImportJobDto> {
  return api.get<ImportJobDto>(`/jobs/${encodeURIComponent(jobId)}`, { signal });
}

/** SHA-256 of the file as lowercase hex, or null when the browser has no SubtleCrypto (non-secure context). */
export async function hashFile(file: File): Promise<string | null> {
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-256", await file.arrayBuffer());
  return toHex(digest);
}

export interface UploadInput {
  file: File;
  organizationUnitId: string;
  versionNo: number;
}

export interface UploadHandlers {
  /** Bytes sent so far and in total. Not called in mock mode. */
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

/** 202 with a job to poll, or a finished (sync) answer, e.g. 200 with `alreadyImported`. */
export type UploadOutcome = { kind: "job"; jobId: string } | { kind: "done"; response: SnapshotUploadResponse };

function isAccepted(data: unknown): data is SnapshotUploadAcceptedResponse {
  return typeof data === "object" && data !== null && "jobId" in data && typeof (data as { jobId: unknown }).jobId === "string";
}

function buildForm(input: UploadInput): FormData {
  // Field names follow snapshotUploadFieldsSchema; `async=true` keeps the request short for big files.
  const form = new FormData();
  form.append("organizationUnitId", input.organizationUnitId);
  form.append("versionNo", String(input.versionNo));
  form.append("async", "true");
  form.append("file", input.file, input.file.name);
  return form;
}

function toOutcome(status: number, data: unknown): UploadOutcome {
  if (isAccepted(data)) return { kind: "job", jobId: data.jobId };
  if (status === 202) throw new ApiError(502, "Server menerima berkas tetapi tidak mengirim nomor proses. Muat ulang daftar snapshot lalu coba lagi.");
  return { kind: "done", response: data as SnapshotUploadResponse };
}

export async function uploadSnapshot(cycleId: string, input: UploadInput, handlers: UploadHandlers = {}): Promise<UploadOutcome> {
  const path = `${cycleBase(cycleId)}/snapshots`;
  const form = buildForm(input);

  if (IS_MOCK) {
    const data = await request<unknown>("POST", path, form);
    return toOutcome(200, data);
  }

  return new Promise<UploadOutcome>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("accept", "application/json");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) handlers.onProgress?.(event.loaded, event.total);
    };
    xhr.onerror = () => reject(new ApiError(0, "Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi."));
    xhr.ontimeout = () => reject(new ApiError(0, "Unggahan terlalu lama. Periksa koneksi lalu coba lagi."));
    xhr.onabort = () => reject(new DOMException("Unggahan dibatalkan", "AbortError"));
    handlers.signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.onload = () => {
      let data: unknown;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        data = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(toOutcome(xhr.status, data));
        } catch (error) {
          reject(error);
        }
        return;
      }
      const serverMessage =
        data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error
          : null;
      if (xhr.status === 401) void api.get("/cycles").catch(() => undefined); // lets the shared client end the session
      reject(new ApiError(xhr.status, serverMessage ?? uploadFallbackMessage(xhr.status), data));
    };

    xhr.send(form);
  });
}

function uploadFallbackMessage(status: number): string {
  if (status === 413) return "Berkas terlalu besar untuk diunggah.";
  if (status === 501) return "Impor belum tersedia di server ini.";
  if (status === 403) return "Anda tidak punya akses untuk mengimpor ke eselon I ini.";
  if (status >= 500) return "Server sedang bermasalah. Coba lagi sebentar lagi.";
  return "Berkas tidak dapat diproses.";
}
