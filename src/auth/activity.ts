/**
 * User-activity tracking for the idle auto-logout (REQ-320).
 *
 * The session's idle window is only reset when the *user* did something, never
 * by the app's own background polling. Several pollers (table view state, wiki
 * sync, entity detail panel, the auth refresh itself) keep firing on an open
 * tab regardless of the user, so renewal must be driven from here rather than
 * from "an authenticated request arrived".
 */

/** Ignore repeated mousemove noise: one timestamp update per 30s is plenty. */
const MOUSEMOVE_THROTTLE_MS = 30_000;

let lastActivityAt = Date.now();
let tracking = false;
let listeners: Array<() => void> = [];

export function markActivity(at: number = Date.now()): void {
  if (at > lastActivityAt) lastActivityAt = at;
}

export function getLastActivityAt(): number {
  return lastActivityAt;
}

function onActivity(): void {
  lastActivityAt = Date.now();
}

function onMouseMove(): void {
  const now = Date.now();
  if (now - lastActivityAt > MOUSEMOVE_THROTTLE_MS) lastActivityAt = now;
}

/**
 * Attach the activity listeners once per document.
 *
 * Guarded at module scope instead of using a `useEffect` cleanup: StrictMode
 * double-invokes effects in dev, and `AuthProvider` never unmounts anyway, so
 * the listeners' natural lifetime is the document's.
 *
 * Deliberately NOT listening to `scroll` (programmatic scrolls from re-renders
 * and virtualized grids would look like user activity) or `visibilitychange`
 * (merely surfacing a tab is not user work, and would make the timeout
 * effectively unreachable on a multi-monitor setup).
 */
export function ensureActivityTracking(): void {
  if (tracking) return;
  if (typeof window === 'undefined') return;
  tracking = true;

  const opts: AddEventListenerOptions = { passive: true, capture: true };
  const simple: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
  for (const type of simple) {
    window.addEventListener(type, onActivity, opts);
    listeners.push(() => window.removeEventListener(type, onActivity, opts));
  }
  window.addEventListener('mousemove', onMouseMove, opts);
  listeners.push(() => window.removeEventListener('mousemove', onMouseMove, opts));
}

export type HeartbeatDecision = {
  lastActivityAt: number;
  lastHeartbeatAt: number;
  now: number;
  minIntervalMs: number;
};

/**
 * Compare timestamps rather than consuming a boolean flag: background tabs get
 * their timers throttled and eventually frozen, so a tick that never fires must
 * not lose the activity signal — the next tick still sees it.
 */
export function shouldSendHeartbeat({
  lastActivityAt: activityAt,
  lastHeartbeatAt,
  now,
  minIntervalMs,
}: HeartbeatDecision): boolean {
  if (activityAt <= lastHeartbeatAt) return false;
  return now - lastHeartbeatAt >= minIntervalMs;
}

/** Test-only: drop the listeners and reset the module state. */
export function __resetActivityTrackingForTests(at: number = Date.now()): void {
  for (const off of listeners) off();
  listeners = [];
  tracking = false;
  lastActivityAt = at;
}
