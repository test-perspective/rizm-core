import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { apiFetch, apiJson, ApiError, setAuthRefresh } from './api';
import type { Me } from './types';
import { isBackendEnabled } from '../utils/storage';

type AuthContextValue = {
  loading: boolean;
  user: Me | null;
  isAnonymous: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Me | null>(null);

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
        // Anonymous user - allow to continue
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

  // Periodic authentication check (every 5 minutes)
  useEffect(() => {
    if (!isBackendEnabled()) return;
    
    const interval = setInterval(() => {
      refresh().catch((e) => {
        console.error('[auth] periodic refresh failed', e);
      });
    }, 5 * 60 * 1000); // 5 minutes
    
    return () => {
      clearInterval(interval);
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

