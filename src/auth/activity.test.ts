import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetActivityTrackingForTests,
  ensureActivityTracking,
  getLastActivityAt,
  markActivity,
  shouldSendHeartbeat,
} from './activity';

describe('shouldSendHeartbeat', () => {
  const minIntervalMs = 5 * 60 * 1000;

  it('does not fire when there was no activity since the last heartbeat', () => {
    expect(
      shouldSendHeartbeat({
        lastActivityAt: 1_000,
        lastHeartbeatAt: 1_000,
        now: 1_000 + minIntervalMs,
        minIntervalMs,
      }),
    ).toBe(false);
  });

  it('fires when the user acted after the last heartbeat', () => {
    expect(
      shouldSendHeartbeat({
        lastActivityAt: 2_000,
        lastHeartbeatAt: 1_000,
        now: 1_000 + minIntervalMs,
        minIntervalMs,
      }),
    ).toBe(true);
  });

  it('does not fire again inside the minimum interval', () => {
    expect(
      shouldSendHeartbeat({
        lastActivityAt: 2_000,
        lastHeartbeatAt: 1_000,
        now: 1_500,
        minIntervalMs,
      }),
    ).toBe(false);
  });
});

describe('activity tracking', () => {
  beforeEach(() => {
    __resetActivityTrackingForTests(0);
  });

  it('advances the timestamp on keyboard and pointer input', () => {
    ensureActivityTracking();
    expect(getLastActivityAt()).toBe(0);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    const afterKey = getLastActivityAt();
    expect(afterKey).toBeGreaterThan(0);

    __resetActivityTrackingForTests(0);
    ensureActivityTracking();
    window.dispatchEvent(new Event('pointerdown'));
    expect(getLastActivityAt()).toBeGreaterThan(0);
  });

  it('attaches listeners only once even when called repeatedly (StrictMode)', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    ensureActivityTracking();
    ensureActivityTracking();
    ensureActivityTracking();

    const keydownRegistrations = spy.mock.calls.filter(([type]) => type === 'keydown');
    expect(keydownRegistrations).toHaveLength(1);
    spy.mockRestore();
  });

  it('never moves the timestamp backwards', () => {
    markActivity(5_000);
    markActivity(1_000);
    expect(getLastActivityAt()).toBe(5_000);
  });
});
