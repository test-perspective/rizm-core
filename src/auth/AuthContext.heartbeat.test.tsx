import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { AuthProvider } from './AuthContext';
import { __resetActivityTrackingForTests, markActivity } from './activity';

const POLL_MS = 5 * 60 * 1000;

function heartbeatCalls(fetchMock: ReturnType<typeof vi.fn>): unknown[][] {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/auth/heartbeat'));
}

describe('AuthProvider idle heartbeat', () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.VITE_KEEL_BACKEND_URL = 'http://localhost:48888';
    vi.useFakeTimers();
    __resetActivityTrackingForTests(Date.now() - 60_000);

    fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({ userId: 'u-1', email: 'a@b.c', role: 'admin', lastLoginAt: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ expiresAt: Date.now() + 1000 }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env.VITE_KEEL_BACKEND_URL;
  });

  async function mount() {
    await act(async () => {
      root.render(<AuthProvider>{null}</AuthProvider>);
    });
  }

  it('sends no heartbeat while the user is idle', async () => {
    await mount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2 + 1000);
    });

    // This is the whole point of REQ-320's design: an untouched tab keeps
    // polling /api/auth/me but must never extend the session.
    expect(heartbeatCalls(fetchMock)).toHaveLength(0);
  });

  it('sends a heartbeat on the first tick after the user interacts', async () => {
    await mount();

    markActivity(Date.now() + 1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS + 1000);
    });

    expect(heartbeatCalls(fetchMock)).toHaveLength(1);
    const [, init] = heartbeatCalls(fetchMock)[0] as [string, RequestInit];
    expect(init.method).toBe('POST');

    // ...and not again until there is fresh activity.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS + 1000);
    });
    expect(heartbeatCalls(fetchMock)).toHaveLength(1);
  });
});
