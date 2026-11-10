import { ROLES, type OrganizationUnitDto, type UserAdminDto } from "@nirmala/shared";
import { Check, UserPlus, UserRoundPen, X } from "lucide-react";
import { useState } from "react";
import { api } from "../../../lib/api";
import { failureMessage } from "../errors";
import { ROLE_LABEL } from "../../../lib/roles";
import { Button, Checkbox, Dialog, Input, Select } from "../../../ui";
import { Alert } from "../components/Alert";
import styles from "./UserDialog.module.css";
import { isGlobalRole, sameIds, validateUserForm, type UserForm } from "./userForm";

export interface UserDialogProps {
  /** null = Tambah pengguna. */
  user: UserAdminDto | null;
  units: OrganizationUnitDto[];
  open: boolean;
  /** The signed-in admin: their own role cannot be lowered. */
  selfId: string | null;
  onClose: () => void;
  /** Called after a change reached the server. `close` is false after a partial save, so the error stays visible. */
  onSaved: (close: boolean) => void;
}

/**
 * Tambah / Ubah pengguna. No Pencil frame exists for this form: it follows the Buat siklus dialog (e2AA59):
 * title, one-line description, stacked fields, Batal + primary action in the footer.
 * Mounted with a fresh key per opening so the fields start from the saved user.
 */
export function UserDialog({ user, units, open, selfId, onClose, onSaved }: UserDialogProps) {
  const mode = user ? "edit" : "create";
  const [form, setForm] = useState<UserForm>(() => ({
    username: user?.username ?? "",
    displayName: user?.displayName ?? "",
    role: user?.role ?? "reviewer",
    password: "",
    unitLabel: user?.unitLabel ?? "",
    organizationUnitIds: user?.organizationUnitIds ?? []
  }));
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = attempted ? validateUserForm(form, mode) : {};
  const global = isGlobalRole(form.role);
  const isSelf = user !== null && user.id === selfId;
  const set = <K extends keyof UserForm>(key: K, value: UserForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  function toggleUnit(id: string, checked: boolean) {
    set("organizationUnitIds", checked ? [...form.organizationUnitIds, id] : form.organizationUnitIds.filter((item) => item !== id));
  }

  async function submit() {
    setAttempted(true);
    setError(null);
    if (Object.keys(validateUserForm(form, mode)).length > 0 || busy) return;
    setBusy(true);
    const unitLabel = form.unitLabel.trim() || null;
    const scopeIds = global ? [] : form.organizationUnitIds;
    let reached = false;
    try {
      if (!user) {
        await api.post("/users", { username: form.username.trim(), displayName: form.displayName.trim(), role: form.role, password: form.password, unitLabel, organizationUnitIds: scopeIds });
        reached = true;
      } else {
        await api.put(`/users/${user.id}`, { displayName: form.displayName.trim(), unitLabel, ...(form.password ? { password: form.password } : {}) });
        reached = true;
        if (form.role !== user.role) await api.put(`/users/${user.id}/role`, { role: form.role });
        if (!global && !sameIds(scopeIds, user.organizationUnitIds)) await api.put(`/users/${user.id}/scopes`, { organizationUnitIds: scopeIds });
      }
      onSaved(true);
    } catch (failure) {
      setError(reached && user ? `Sebagian perubahan sudah tersimpan, tetapi ada yang gagal. ${failureMessage(failure)}` : failureMessage(failure));
      if (reached) onSaved(false);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={user ? `Ubah ${user.username}` : "Tambah pengguna"}
      dismissible={!busy}
      actions={
        <>
          <Button variant="sekunder" icon={X} onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" form="user-form" variant="utama" icon={user ? Check : UserPlus} loading={busy}>
            {user ? "Simpan perubahan" : "Simpan pengguna"}
          </Button>
        </>
      }
    >
      <form
        id="user-form"
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className={styles.description}>
          {user ? <UserRoundPen size={14} aria-hidden="true" /> : null}
          Isi data akun, peran, dan eselon I yang boleh dilihat.
        </p>
        {error && <Alert>{error}</Alert>}
        <Input label="Username" value={form.username} onChange={(event) => set("username", event.target.value)} error={errors.username} disabled={mode === "edit"} hint={mode === "edit" ? "Username tidak dapat diubah." : undefined} autoComplete="off" required />
        <Input label="Nama" value={form.displayName} onChange={(event) => set("displayName", event.target.value)} error={errors.displayName} required />
        <Select
          label="Peran"
          value={form.role}
          onChange={(event) => set("role", event.target.value as UserForm["role"])}
          options={ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }))}
          disabled={isSelf}
          hint={isSelf ? "Peran akun sendiri tidak dapat diubah." : undefined}
        />
        <Input
          label={mode === "create" ? "Kata sandi" : "Kata sandi baru"}
          type="password"
          value={form.password}
          onChange={(event) => set("password", event.target.value)}
          error={errors.password}
          hint={errors.password ? undefined : mode === "edit" ? "Kosongkan bila tidak diubah. Minimal 12 karakter." : "Minimal 12 karakter."}
          autoComplete="new-password"
          required={mode === "create"}
        />
        <Input label="Unit (opsional)" value={form.unitLabel} onChange={(event) => set("unitLabel", event.target.value)} error={errors.unitLabel} hint={errors.unitLabel ? undefined : "Tampil di bawah nama pada menu samping, misalnya Itjen."} />
        <fieldset className={styles.units} aria-describedby="units-help" disabled={global}>
          <legend className={styles.legend}>Akses eselon I</legend>
          {units.map((unit) => (
            <Checkbox key={unit.id} label={unit.shortName} checked={global ? false : form.organizationUnitIds.includes(unit.id)} onChange={(event) => toggleUnit(unit.id, event.target.checked)} />
          ))}
          <p id="units-help" className={errors.organizationUnitIds ? styles.unitsError : styles.unitsHelp}>
            {global ? "Pimpinan dan Admin melihat semua eselon I." : errors.organizationUnitIds ?? "Reviewer dan PIC UKI hanya melihat eselon I yang dipilih."}
          </p>
        </fieldset>
      </form>
    </Dialog>
  );
}
