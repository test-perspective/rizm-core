import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { apiJson, ApiError } from '../auth/api';
import type { Role } from '../auth/types';

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function isValidEmail(s: string): boolean {
  const e = normalizeEmail(s);
  return e.length > 0 && e.includes('@');
}

type UserRow = {
  id: string;
  email: string;
  role: Role;
  isDisabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number | null;
};

type CreateUserResponse = {
  user: UserRow;
  tempPassword?: string | null;
};

export function AdminUserCreatePage() {
  const nav = useNavigate();
  const roles: Role[] = useMemo(() => ['admin', 'editor', 'viewer'], []);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [initialPassword, setInitialPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [existingEmails, setExistingEmails] = useState<Set<string>>(new Set());
  const [existingEmailsLoaded, setExistingEmailsLoaded] = useState(false);
  const [duplicateCheckActive, setDuplicateCheckActive] = useState(true);

  // Set page title
  useEffect(() => {
    document.title = 'Rizm - Add User';
  }, []);

  // Load existing user emails
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await apiJson<UserRow[]>('/api/admin/users');
        if (!cancelled) {
          const emails = new Set(rows.map((u) => normalizeEmail(u.email)));
          setExistingEmails(emails);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setExistingEmailsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const emailExists = useMemo(
    () => isValidEmail(email) && existingEmails.has(normalizedEmail),
    [email, normalizedEmail, existingEmails]
  );
  const effectiveEmailExists = duplicateCheckActive && emailExists;
  const canSubmit = !creating && duplicateCheckActive && !effectiveEmailExists && existingEmailsLoaded;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccessMessage(null);
    setTempPassword(null);
    try {
      const body: Record<string, unknown> = { email, role };
      if (initialPassword.trim().length > 0) body.initialPassword = initialPassword;
      const res = await apiJson<CreateUserResponse>('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setTempPassword(res.tempPassword ?? null);
      setSuccessMessage('User created successfully.');
      setInitialPassword('');
      setExistingEmails((prev) => new Set(prev).add(normalizeEmail(res.user.email)));
      setDuplicateCheckActive(false);
    } catch (e) {
      console.error(e);
      if (e instanceof ApiError && e.message) {
        setError(e.message);
      } else {
        setError('Failed to create user.');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-full box-border bg-zinc-950 text-white p-6 sm:p-8 md:p-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors" to="/me">
              <ArrowLeft className="w-4 h-4" />
              Back to Settings
            </Link>
            <h1 className="text-2xl font-bold">Add User</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link className="text-sm text-zinc-300 hover:text-white" to="/admin/users">
              Back to List
            </Link>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <form onSubmit={create} className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-300">Email</label>
              <input
                data-testid="admin-create-email-input"
                className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-white outline-none focus:border-violet-500"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setDuplicateCheckActive(true);
                  setSuccessMessage(null);
                  setTempPassword(null);
                }}
                required
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-300">Role</label>
              <select
                data-testid="admin-create-role-select"
                className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-white outline-none focus:border-violet-500"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-zinc-300">Initial Password (optional)</label>
              <input
                className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-white outline-none focus:border-violet-500"
                type="password"
                value={initialPassword}
                onChange={(e) => setInitialPassword(e.target.value)}
                placeholder="Leave empty to generate temporary password"
              />
              <div className="text-xs text-zinc-400 mt-1">Recommended: at least 12 characters for both new and temporary passwords.</div>
            </div>

            {effectiveEmailExists && (
              <div data-testid="admin-create-email-exists" className="text-sm text-amber-200 bg-amber-950/40 border border-amber-900 rounded-md p-3">
                This user already exists.
              </div>
            )}

            {error && <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md p-3">{error}</div>}

            {successMessage && (
              <div data-testid="admin-create-success" className="text-sm text-emerald-200 bg-emerald-950/40 border border-emerald-900 rounded-md p-3">
                {successMessage}
              </div>
            )}

            {tempPassword && (
              <div className="text-sm text-amber-200 bg-amber-950/40 border border-amber-900 rounded-md p-3">
                Temp PW: <span className="font-mono">{tempPassword}</span> (please save it now)
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                data-testid="admin-create-submit"
                disabled={!canSubmit}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 rounded-md text-sm font-medium transition-colors"
                type="submit"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md text-sm"
                onClick={() => nav('/admin/users')}
              >
                Back to List
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

