import { LayoutDashboard, Lock } from "lucide-react";
import { ROLE_LABEL, type Role } from "../lib/roles";
import { ButtonLink, EmptyState } from "../ui";

function joinRoles(roles: Role[]): string {
  const labels = roles.map((role) => ROLE_LABEL[role]);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} atau ${labels[labels.length - 1]}`;
}

export interface AccessDeniedProps {
  /** Screen name, e.g. "Pengguna". */
  screen: string;
  allowed: Role[];
  current: Role;
}

/** State · Akses ditolak (design JD30D). Shown inside the app shell. */
export function AccessDenied({ screen, allowed, current }: AccessDeniedProps) {
  return (
    <EmptyState
      variant="page"
      icon={Lock}
      title="Akses ditolak"
      description={`Halaman ${screen} hanya bisa dibuka oleh peran ${joinRoles(allowed)}. Peran Anda saat ini ${ROLE_LABEL[current]}. Kalau perlu akses, hubungi Admin.`}
      action={
        <ButtonLink to="/dashboard" variant="utama" icon={LayoutDashboard}>
          Kembali ke Dashboard
        </ButtonLink>
      }
    />
  );
}
