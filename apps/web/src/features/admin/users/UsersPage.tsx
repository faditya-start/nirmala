import type { OrganizationUnitDto, UserAdminDto, UserListResponse, UserResponse } from "@nirmala/shared";
import { SquarePen, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../../app/auth";
import { api, errorMessage } from "../../../lib/api";
import { formatNumber } from "../../../lib/format";
import { Button, EmptyState, IconButton, Loading, PageHeader, Switch, Table, TableFrame, TagChip, TBody, Td, Th, THead, Tr } from "../../../ui";
import { Alert } from "../components/Alert";
import { InfoNote } from "../components/InfoNote";
import { useResource } from "../useResource";
import { scopeText } from "./userForm";
import { UserDialog } from "./UserDialog";
import styles from "./UsersPage.module.css";

const ROLE_CHIP = { reviewer: "Reviewer", uki: "UKI", leader: "Pimpinan", admin: "Admin" } as const;

/** S12c · Pengguna (xbSLr). Route: /admin/pengguna. */
export function UsersPage() {
  const { user: me } = useAuth();
  const resource = useResource(() => api.get<UserListResponse>("/users"), "users");
  const unitsResource = useResource(() => api.get<{ organizationUnits: OrganizationUnitDto[] }>("/organization-units"), "units");
  const [overrides, setOverrides] = useState<Record<string, UserAdminDto>>({});
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ user: UserAdminDto | null; open: boolean; nonce: number } | null>(null);

  const users = (resource.data?.users ?? []).map((user) => overrides[user.id] ?? user);

  async function toggleActive(user: UserAdminDto, active: boolean) {
    if (toggling) return;
    setToggling(user.id);
    setError(null);
    try {
      const result = await api.put<UserResponse>(`/users/${user.id}/active`, { active });
      setOverrides((current) => ({ ...current, [user.id]: result.user }));
    } catch (failure) {
      setError(`Status ${user.username} belum bisa diubah. ${errorMessage(failure)}`);
    } finally {
      setToggling(null);
    }
  }

  const openDialog = (user: UserAdminDto | null) => setDialog((current) => ({ user, open: true, nonce: (current?.nonce ?? 0) + 1 }));

  return (
    <div className={styles.page}>
      <PageHeader
        title="Pengguna"
        subtitle={`${formatNumber(users.length)} pengguna · peran menentukan layar yang bisa dibuka`}
        actions={
          <Button variant="utama" icon={UserPlus} onClick={() => openDialog(null)} disabled={!unitsResource.data}>
            Tambah pengguna
          </Button>
        }
      />

      {resource.error && !resource.data ? (
        <EmptyState icon={Users} title="Daftar pengguna belum bisa dimuat" description={errorMessage(resource.error)} action={<Button onClick={resource.reload}>Coba lagi</Button>} />
      ) : !resource.data ? (
        <Loading label="Memuat pengguna…" block />
      ) : (
        <>
          {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}
          {users.length === 0 ? (
            <EmptyState icon={Users} title="Belum ada pengguna" description="Tambahkan pengguna pertama dengan tombol Tambah pengguna." />
          ) : (
            <TableFrame>
              <Table aria-label="Daftar pengguna">
                <THead>
                  <tr>
                    <Th width={200}>Username</Th>
                    <Th>Nama</Th>
                    <Th width={150}>Peran</Th>
                    <Th width={240}>Akses eselon I</Th>
                    <Th width={170}>Status</Th>
                    <Th width={56}>
                      <span className="sr-only">Ubah</span>
                    </Th>
                  </tr>
                </THead>
                <TBody>
                  {users.map((user) => (
                    <Tr key={user.id}>
                      <Td>
                        <span className="mono" title={user.username}>
                          {user.username}
                        </span>
                      </Td>
                      <Td>
                        <span className={styles.name} title={user.displayName}>
                          {user.displayName}
                        </span>
                      </Td>
                      <Td>
                        <TagChip>{ROLE_CHIP[user.role]}</TagChip>
                      </Td>
                      <Td>
                        <span className={user.allOrganizations || user.organizationUnits.length > 0 ? undefined : styles.muted}>{scopeText(user)}</span>
                      </Td>
                      <Td>
                        <Switch
                          checked={user.active}
                          disabled={toggling !== null}
                          aria-label={`Akun ${user.username}`}
                          label={user.active ? "Aktif" : "Nonaktif"}
                          onCheckedChange={(checked) => void toggleActive(user, checked)}
                        />
                      </Td>
                      <Td align="right">
                        <IconButton icon={SquarePen} label={`Ubah ${user.username}`} onClick={() => openDialog(user)} />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableFrame>
          )}
          <InfoNote>Reviewer dan PIC UKI hanya melihat eselon I yang diberikan di sini. Pimpinan dan Admin melihat semua eselon I.</InfoNote>
        </>
      )}

      {dialog && unitsResource.data && (
        <UserDialog
          key={`${dialog.user?.id ?? "baru"}:${dialog.nonce}`}
          user={dialog.user}
          units={unitsResource.data.organizationUnits}
          open={dialog.open}
          selfId={me?.id ?? null}
          onClose={() => setDialog((current) => (current ? { ...current, open: false } : current))}
          onSaved={(close) => {
            setOverrides({});
            resource.reload();
            if (close) setDialog((current) => (current ? { ...current, open: false } : current));
          }}
        />
      )}
    </div>
  );
}
