import { describe, expect, it } from 'vitest';
import { applyHexRgbTextColorFromDataValue } from './applyCustomTextColorMarks';

describe('applyHexRgbTextColorFromDataValue', () => {
  it('sets inline color for hex data-value', () => {
    const root = document.createElement('div');
    const span = document.createElement('span');
    span.setAttribute('data-style-type', 'textColor');
    span.setAttribute('data-value', '#FF5630');
    span.textContent = 'x';
    root.appendChild(span);
    applyHexRgbTextColorFromDataValue(root);
    expect(span.style.color).toBe('rgb(255, 86, 48)');
  });

  it('does not set inline color for preset red (library CSS)', () => {
    const root = document.createElement('div');
    const span = document.createElement('span');
    span.setAttribute('data-style-type', 'textColor');
    span.setAttribute('data-value', 'red');
    span.style.color = 'rgb(1, 2, 3)';
    root.appendChild(span);
    applyHexRgbTextColorFromDataValue(root);
    expect(span.style.color).toBe('');
  });
});
