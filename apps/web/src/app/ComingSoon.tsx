import { Hammer } from "lucide-react";
import { EmptyState, PageHeader } from "../ui";

/**
 * Placeholder for a planned route. The feature owner replaces the component exported from
 * `features/<fitur>/index.tsx`; this file is only used until then.
 */
export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
      <PageHeader title={title} />
      <EmptyState
        icon={Hammer}
        title="Belum dibangun"
        description={description ?? "Layar ini sudah terdaftar di tabel rute dan akan diisi pada tahap pengembangan fiturnya."}
      />
    </div>
  );
}
