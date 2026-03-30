import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { isBackendEnabled } from '../utils/storage';
import { apiFetch, apiJson, ApiError } from '../auth/api';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const backend = isBackendEnabled();
  const nav = useNavigate();
  const loc = useLocation();
  const { refresh } = useAuth();

  const from = useMemo(() => {
    const s = (loc.state as any)?.from;
    return typeof s === 'string' ? s : '/';
  }, [loc.state]);

  // Set page title
  useEffect(() => {
    document.title = 'Rizm - Login';
  }, []);

  // Check if dev-admin-login is enabled
  useEffect(() => {
    if (!backend) {
      setDevAdminLoginEnabled(false);
      return;
    }
    setCheckingDevAdmin(true);
    apiJson<{ enabled: boolean }>('/api/auth/dev-admin-login', { method: 'GET' })
      .then((res) => {
        setDevAdminLoginEnabled(res.enabled);
      })
      .catch((e) => {
        // 404 means disabled, which is fine
        if (e instanceof ApiError && e.status === 404) {
          setDevAdminLoginEnabled(false);
        } else {
          console.error('[auth] failed to check dev-admin-login status', e);
          setDevAdminLoginEnabled(false);
        }
      })
      .finally(() => {
        setCheckingDevAdmin(false);
      });
  }, [backend]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [devAdminLoginEnabled, setDevAdminLoginEnabled] = useState(false);
  const [checkingDevAdmin, setCheckingDevAdmin] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backend) {
      setError('Backend is not configured (VITE_KEEL_BACKEND_URL).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ApiError(res.status, text || `HTTP ${res.status}`);
      }
      await refresh();
      nav(from, { replace: true });
    } catch (e) {
      console.error('[auth] login failed', e);
      setError('Login failed. Please check your email and password.');
    } finally {
      setSubmitting(false);
    }
  };

  const onDevAdminLogin = async () => {
    if (!backend) {
      setError('Backend is not configured (VITE_KEEL_BACKEND_URL).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/dev-admin-login', {
        method: 'POST',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ApiError(res.status, text || `HTTP ${res.status}`);
      }
      await refresh();
      nav(from, { replace: true });
    } catch (e) {
      console.error('[auth] dev-admin-login failed', e);
      setError('Admin login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h1 className="text-xl font-semibold text-white">Login</h1>
        <p className="text-sm text-zinc-400 mt-1">Sign in with your email and password.</p>

        {!backend && (
          <div className="mt-4 text-sm text-amber-200 bg-amber-950/40 border border-amber-900 rounded-md p-3">
            Backend is disabled. To use login, please set <code className="text-amber-100">VITE_KEEL_BACKEND_URL</code>.
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm text-zinc-300">Email</label>
            <input
              className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-white outline-none focus:border-violet-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              type="email"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-300">Password</label>
            <input
              className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-white outline-none focus:border-violet-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              type="password"
              required
            />
          </div>

          {error && <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-md p-3">{error}</div>}

          <button
            disabled={submitting || !backend}
            className="w-full px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md text-sm font-medium transition-colors"
            type="submit"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {devAdminLoginEnabled && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <button
              disabled={submitting || !backend || checkingDevAdmin}
              onClick={onDevAdminLogin}
              className="w-full px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md text-sm font-medium transition-colors"
              type="button"
            >
              {submitting ? 'Signing in...' : 'Sign in as Admin'}
            </button>
            <p className="mt-2 text-xs text-zinc-500 text-center">
              For development/demo: Sign in as admin without password
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

