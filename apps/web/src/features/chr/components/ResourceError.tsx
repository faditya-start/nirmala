import { AlertTriangle, Lock, RefreshCw, SearchX, Wrench } from "lucide-react";
import { ApiError } from "../../../lib/api-error";
import { Button, ButtonLink, EmptyState } from "../../../ui";

export interface ResourceErrorProps {
  error: unknown;
  /** Name of the thing that failed to load, e.g. "dokumen CHR". */
  what: string;
  onRetry?: () => void;
  /** Where "Kembali" leads. */
  backTo?: string;
  backLabel?: string;
}

/** Full-screen answer to a failed load: 403 (akses ditolak), 404, 501 (belum tersedia), network and server errors. */
export function ResourceError({ error, what, onRetry, backTo = "/chr", backLabel = "Kembali ke daftar CHR" }: ResourceErrorProps) {
  const status = error instanceof ApiError ? error.status : 0;
  const message = error instanceof ApiError && error.message ? error.message : null;
  const back = <ButtonLink to={backTo}>{backLabel}</ButtonLink>;

  if (status === 403) {
    return <EmptyState variant="page" icon={Lock} title="Akses ditolak" description={message ?? `Anda tidak memiliki akses ke ${what} ini.`} action={back} />;
  }
  if (status === 404) {
    return <EmptyState variant="page" icon={SearchX} title={`Data tidak ditemukan`} description={message ?? `Alamat ${what} ini tidak ada atau sudah dipindahkan.`} action={back} />;
  }
  if (status === 501) {
    return (
      <EmptyState
        variant="page"
        icon={Wrench}
        title="Belum tersedia"
        description="Bagian ini belum tersedia di server. Hubungi Admin bila Anda memerlukannya segera."
        action={back}
      />
    );
  }
  return (
    <EmptyState
      variant="page"
      icon={AlertTriangle}
      title={`Gagal memuat ${what}`}
      description={message ?? "Terjadi kesalahan saat mengambil data. Coba lagi sebentar lagi."}
      action={
        onRetry ? (
          <Button icon={RefreshCw} onClick={onRetry}>
            Coba lagi
          </Button>
        ) : (
          back
        )
      }
    />
  );
}
