import { beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';

// Silence React act() warnings when using react-dom/test-utils-style harnesses in Vitest.
// https://react.dev/reference/react/act
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Polyfill crypto.randomUUID when missing in jsdom
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto as any;
}
if (typeof (globalThis as any).crypto.randomUUID !== 'function') {
  let i = 0;
  (globalThis as any).crypto.randomUUID = () => `test-uuid-${++i}`;
}

beforeEach(() => {
  // Avoid persisted state leaking between tests
  localStorage.clear();
});

