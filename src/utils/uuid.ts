/**
 * UUID v4 generator with graceful fallbacks.
 *
 * - Prefer `crypto.randomUUID()` when available
 * - Fallback to `crypto.getRandomValues()`-based RFC4122 v4
 * - Last resort: Math.random() (non-cryptographic, but keeps the app functional)
 *
 * Note: Some browsers gate `crypto.randomUUID()` behind secure contexts (HTTPS).
 */
export function randomUUID(): string {
  const c: Crypto | undefined = (globalThis as any).crypto;
  const rnd = (c as any)?.randomUUID;
  if (typeof rnd === 'function') return String(rnd.call(c));

  const bytes = new Uint8Array(16);
  const grv = (c as any)?.getRandomValues;
  if (typeof grv === 'function') {
    grv.call(c, bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  // RFC4122 v4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

