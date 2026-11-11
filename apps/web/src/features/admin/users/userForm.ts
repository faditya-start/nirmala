/** Pure validation for the add/edit user dialog. No app imports, so `node --test` can run userForm.test.ts. */

export type UserRole = "reviewer" | "uki" | "leader" | "admin";

export interface UserForm {
  username: string;
  displayName: string;
  role: UserRole;
  password: string;
  unitLabel: string;
  organizationUnitIds: string[];
}

export type UserFormErrors = Partial<Record<"username" | "displayName" | "password" | "unitLabel" | "organizationUnitIds", string>>;

/** Pimpinan and Admin see every eselon I; their scope list is not used. */
export const isGlobalRole = (role: UserRole): boolean => role === "leader" || role === "admin";

export function validateUserForm(form: UserForm, mode: "create" | "edit"): UserFormErrors {
  const errors: UserFormErrors = {};
  const username = form.username.trim();
  if (mode === "create") {
    if (username.length < 3) errors.username = "Username minimal 3 karakter.";
    else if (username.length > 100) errors.username = "Username maksimal 100 karakter.";
    else if (!/^[A-Za-z0-9._-]+$/.test(username)) errors.username = "Username hanya boleh huruf, angka, titik, garis bawah, dan tanda hubung.";
  }
  const name = form.displayName.trim();
  if (name.length < 2) errors.displayName = "Nama minimal 2 karakter.";
  else if (name.length > 150) errors.displayName = "Nama maksimal 150 karakter.";
  if (mode === "create" || form.password !== "") {
    if (form.password.length < 12) errors.password = "Kata sandi minimal 12 karakter.";
    else if (form.password.length > 200) errors.password = "Kata sandi maksimal 200 karakter.";
  }
  if (form.unitLabel.trim().length > 100) errors.unitLabel = "Unit maksimal 100 karakter.";
  if (!isGlobalRole(form.role) && form.organizationUnitIds.length === 0) errors.organizationUnitIds = "Pilih minimal satu eselon I untuk peran ini.";
  return errors;
}

/** "Semua eselon I", the unit names, or a prompt when a scoped role has none yet. */
export function scopeText(user: { allOrganizations: boolean; organizationUnits: { shortName: string }[] }): string {
  if (user.allOrganizations) return "Semua eselon I";
  return user.organizationUnits.length === 0 ? "Belum ada akses" : user.organizationUnits.map((unit) => unit.shortName).join(", ");
}

export function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().every((id, index) => id === [...b].sort()[index]);
}
