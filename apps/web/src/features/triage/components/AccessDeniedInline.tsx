import { Lock } from "lucide-react";
import { EmptyState } from "../../../ui";

/** 403 dari API (eselon I di luar akses). Pesan server dipakai apa adanya. */
export function AccessDeniedInline({ message }: { message: string }) {
  return <EmptyState icon={Lock} title="Akses ditolak" description={message || "Anda tidak punya akses ke data ini."} />;
}
