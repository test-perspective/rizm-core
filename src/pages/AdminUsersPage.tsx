import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { apiFetch, apiJson } from '../auth/api';
import type { Role } from '../auth/types';
import { UserAvatar } from '../components/UserAvatar';
import { useAppDialog } from '../components/dialogs';

type UserRow = {
  id: string;
  email: string;
  role: Role;
  isDisabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number | null;
};

export function AdminUsersPage() {
  const dialog = useAppDialog();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const roles: Role[] = useMemo(() => ['admin', 'editor', 'viewer'], []);

  // Set page title
  useEffect(() => {
    document.title = 'Rizm - User Management';
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await apiJson<UserRow[]>('/api/admin/users');
      setUsers(rows);
    } catch (e) {
      console.error(e);
      setError('Failed to fetch user list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const patchUser = async (id: string, patch: Partial<Pick<UserRow, 'role' | 'isDisabled'>>) => {
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      console.error(e);
      setError('Failed to update user.');
    }
  };

  const resetPasswordTemp = async (id: string) => {
    setError(null);
    try {
      const r = await apiJson<{ tempPassword?: string | null }>(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generateTemp: true }),
      });
      const pw = r.tempPassword ?? null;
      if (pw) {
        await dialog.prompt({
          title: 'Temporary Password',
          message: 'Please save this temporary password now:',
          defaultValue: pw,
          readOnly: true,
          confirmText: 'Close',
        });
      }
      await load();
    } catch (e) {
      console.error(e);
      setError('Failed to reset password.');
    }
  };

  const resetPasswordSet = async (id: string) => {
    const pw = await dialog.prompt({
      title: 'Set New Password',
      message: 'New password (at least 12 characters):',
      inputType: 'password',
      placeholder: 'Enter new password',
      confirmText: 'Set Password',
      validate: (value) => (value.length >= 12 ? null : 'Password must be at least 12 characters'),
    });
    if (!pw) return;
    setError(null);
    try {
      await apiJson(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: pw }),
      });
      await load();
    } catch (e) {
      console.error(e);
      setError('Failed to set new password.');
    }
  };

  const deleteUser = async (user: UserRow) => {
    const ok = await dialog.confirm({
      title: 'Delete User',
      message: `Delete user ${user.email}?\nThis action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return;

    setError(null);
    try {
      const res = await apiFetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error && e.message ? e.message : 'Failed to delete user.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-full bg-zinc-950 flex items-center justify-center">
        <div className="text-white">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full box-border bg-zinc-950 text-white p-6 sm:p-8 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors" to="/me">
              <ArrowLeft className="w-4 h-4" />
              Back to Settings
            </Link>
            <h1 className="text-2xl font-bold">User Management</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              className="px-3 py-2 bg-violet-600 hover:bg-violet-500 rounded-md text-sm font-medium transition-colors"
              to="/admin/users/new"
            >
              Add User
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md text-sm"
            type="button"
            onClick={load}
          >
            Reload
          </button>
        </div>

        {error && <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md p-3">{error}</div>}

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-lg font-semibold">User List</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-950/40 text-zinc-300">
                <tr>
                  <th className="text-left px-5 py-3">Email</th>
                  <th className="text-left px-5 py-3">Role</th>
                  <th className="text-left px-5 py-3">Disabled</th>
                  <th className="text-left px-5 py-3">Last login</th>
                  <th className="text-left px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-zinc-800">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <UserAvatar email={u.email} size="sm" />
                        <span className="font-mono">{u.email}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        className="bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-white"
                        value={u.role}
                        onChange={(e) => patchUser(u.id, { role: e.target.value as Role })}
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <input
                        type="checkbox"
                        checked={u.isDisabled}
                        onChange={(e) => patchUser(u.id, { isDisabled: e.target.checked })}
                      />
                    </td>
                    <td className="px-5 py-3 text-zinc-300">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-md hover:bg-zinc-800"
                          onClick={() => resetPasswordTemp(u.id)}
                        >
                          Temp PW
                        </button>
                        <button
                          className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-md hover:bg-zinc-800"
                          onClick={() => resetPasswordSet(u.id)}
                        >
                          Set PW
                        </button>
                        <button
                          className="px-3 py-1.5 bg-red-950/40 border border-red-800/60 text-red-300 rounded-md hover:bg-red-900/40"
                          onClick={() => deleteUser(u)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td className="px-5 py-6 text-zinc-400" colSpan={5}>
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

