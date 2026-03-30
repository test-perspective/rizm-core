import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeTextToClipboard } from './clipboard';

describe('writeTextToClipboard', () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  it('returns true and writes text when clipboard API succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    const ok = await writeTextToClipboard('hello');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns false when writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    const ok = await writeTextToClipboard('x');
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('returns false for empty string', async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    const ok = await writeTextToClipboard('');
    expect(ok).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});
