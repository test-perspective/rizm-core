import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { apiFetch, apiJson, ApiError, postHeartbeat, setAuthRefresh } from './api';
import type { Me } from './types';
import { isBackendEnabled } from '../utils/storage';
import { ensureActivityTracking, getLastActivityAt, shouldSendHeartbeat } from './activity';

const AUTH_POLL_INTERVAL_MS = 5 * 60 * 1000;

type AuthContextValue = {
  loading: boolean;
  user: Me | null;
  isAnonymous: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

let autoLoginInFlight: Promise<boolean> | null = null;

async function tryDevAdminLogin(): Promise<boolean> {
  if (autoLoginInFlight) return autoLoginInFlight;
  autoLoginInFlight = (async () => {
    try {
      const res = await apiFetch('/api/auth/dev-admin-login', { method: 'POST' }, true);
      return res.ok;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        autoLoginInFlight = null;
      }, 0);
    }
  })();
  return autoLoginInFlight;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Me | null>(null);
  // Read from timers without re-creating them on every auth state change.
  const userRef = useRef<Me | null>(null);
  userRef.current = user;
  const lastHeartbeatAtRef = useRef(Date.now());

  const refresh = useCallback(async () => {
    if (!isBackendEnabled()) {
      setUser({ userId: 'local', email: 'local', role: 'admin', lastLoginAt: null });
      return;
    }
    try {
      // Skip auth refresh for /api/auth/me to avoid infinite recursion
      const me = await apiJson<Me>('/api/auth/me', undefined, true);
      setUser(me);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        const ok = await tryDevAdminLogin();
        if (ok) {
          try {
            const me = await apiJson<Me>('/api/auth/me', undefined, true);
            setUser(me);
            return;
          } catch {
            // fall through to anonymous
          }
        }
        setUser(null);
        return;
      }
      console.error('[auth] failed to fetch /api/auth/me', e);
      setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    if (!isBackendEnabled()) {
      setUser({ userId: 'local', email: 'local', role: 'admin', lastLoginAt: null });
      return;
    }
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Register refresh function with api.ts to handle 401 errors globally
  useEffect(() => {
    setAuthRefresh(refresh);
  }, [refresh]);

  // Periodic authentication check + idle-window heartbeat (every 5 minutes).
  // The heartbeat only goes out when the user actually did something since the
  // last one, so a tab left open and untouched still expires (REQ-320).
  useEffect(() => {
    if (!isBackendEnabled()) return;
    ensureActivityTracking();

    const interval = setInterval(() => {
      void (async () => {
        const now = Date.now();
        if (
          userRef.current &&
          shouldSendHeartbeat({
            lastActivityAt: getLastActivityAt(),
            lastHeartbeatAt: lastHeartbeatAtRef.current,
            now,
            minIntervalMs: AUTH_POLL_INTERVAL_MS,
          })
        ) {
          try {
            const res = await postHeartbeat();
            if (res.ok) lastHeartbeatAtRef.current = now;
          } catch (e) {
            console.error('[auth] heartbeat failed', e);
          }
        }
        try {
          await refresh();
        } catch (e) {
          console.error('[auth] periodic refresh failed', e);
        }
      })();
    }, AUTH_POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [refresh]);

  // A session that expired while the tab was hidden should be noticed as soon
  // as the user comes back, not up to one poll interval later.
  useEffect(() => {
    if (!isBackendEnabled()) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!userRef.current) return;
      refresh().catch((e) => {
        console.error('[auth] visibility refresh failed', e);
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const isAnonymous = !user;
  const value = useMemo<AuthContextValue>(() => ({ loading, user, isAnonymous, refresh, logout }), [loading, user, isAnonymous, refresh, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

