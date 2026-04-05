import { afterEach, describe, expect, it } from 'vitest';
import { shouldSuppressAdjacentEntityNavigation } from './entityDetailKeyboardGuards';

describe('shouldSuppressAdjacentEntityNavigation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.focus();
  });

  it('returns true for non-arrow keys', () => {
    expect(
      shouldSuppressAdjacentEntityNavigation(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      )
    ).toBe(true);
  });

  it('returns true when defaultPrevented', () => {
    const e = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
    e.preventDefault();
    expect(shouldSuppressAdjacentEntityNavigation(e)).toBe(true);
  });

  it('returns true when focus is in an input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const e = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
    expect(shouldSuppressAdjacentEntityNavigation(e)).toBe(true);
  });

  it('returns false when focus is on body and key is ArrowRight', () => {
    document.body.focus();
    const e = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    expect(shouldSuppressAdjacentEntityNavigation(e)).toBe(false);
  });
});
