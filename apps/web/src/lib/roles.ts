import { ROLES, type Role } from "@nirmala/shared";

/** Roles (mvp-scope.md section 3) come from @nirmala/shared, the single source shared with the API. */
export { ROLES };
export type { Role };

export const ROLE_LABEL: Record<Role, string> = {
  reviewer: "Reviewer",
  uki: "PIC UKI",
  leader: "Pimpinan",
  admin: "Admin"
};

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  /** Optional unit shown in the sidebar footer, e.g. "Itjen" or "Ditjen Contoh A". */
  unit?: string | null;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Two-letter initials for the avatar: "Reviewer 01" -> "R1", "PIC UKI 01" -> "U1", "Siti Aminah" -> "SA". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const last = words[words.length - 1];
  if (/^\d/.test(last)) {
    const number = last.replace(/^0+(?=\d)/, "")[0];
    return (words[words.length - 2][0] + number).toUpperCase();
  }
  return (words[0][0] + last[0]).toUpperCase();
}
