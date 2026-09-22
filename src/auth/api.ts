import { getBackendUrl, isBackendEnabled } from '../utils/storage';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Global auth refresh function to avoid circular dependency
let globalAuthRefresh: (() => Promise<void>) | null = null;

export function setAuthRefresh(refresh: () => Promise<void>): void {
  globalAuthRefresh = refresh;
}

export const apiBaseUrl = (): string => {
  const base = getBackendUrl();
  if (!base) throw new Error('Backend is not enabled (VITE_KEEL_BACKEND_URL not set)');
  return base;
};

export async function apiFetch(path: string, init?: RequestInit, skipAuthRefresh = false): Promise<Response> {
  if (!isBackendEnabled()) throw new Error('Backend is not enabled');
  const base = apiBaseUrl();
  const res = await fetch(`${base}${path}`, {
    ...init,
    credentials: 'include',
  });
  
  // Handle 401 errors globally (skip for /api/auth/me to avoid infinite recursion)
  if (res.status === 401 && globalAuthRefresh && !skipAuthRefresh) {
    try {
      await globalAuthRefresh();
    } catch (e) {
      // If refresh fails, continue to throw the 401 error
      console.error('[api] auth refresh failed on 401 error', e);
    }
  }
  
  return res;
}

/**
 * Reset the server-side idle countdown (REQ-320).
 *
 * `skipAuthRefresh` is required: a 401 here means the session is already gone,
 * and the caller's own refresh handles the redirect. Letting the global 401
 * handler fire would re-enter refresh twice on the same tick.
 */
export async function postHeartbeat(): Promise<Response> {
  return apiFetch('/api/auth/heartbeat', { method: 'POST' }, true);
}

export async function apiJson<T>(path: string, init?: RequestInit, skipAuthRefresh = false): Promise<T> {
  const res = await apiFetch(path, init, skipAuthRefresh);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

