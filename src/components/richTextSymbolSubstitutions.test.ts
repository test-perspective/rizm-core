import { describe, it, expect } from 'vitest';
import {
  replaceTrailingSymbols,
  findTrailingSymbol,
  revertTrailingSymbol,
} from './richTextSymbolSubstitutions';

const text = (s: string, styles: Record<string, unknown> = {}) => ({ type: 'text', text: s, styles });

describe('richTextSymbolSubstitutions', () => {
  it('replaces single text element at end: -> to →', () => {
    const result = replaceTrailingSymbols([text('a ->')]);
    expect(result.changed).toBe(true);
    expect(result.content).toEqual([text('a →')]);
  });

  it('replaces single text element at end: <- to ←', () => {
    const result = replaceTrailingSymbols([text('b <-')]);
    expect(result.changed).toBe(true);
    expect(result.content).toEqual([text('b ←')]);
  });

  it('replaces single text element at end: (c) to ©', () => {
    const result = replaceTrailingSymbols([text('Copyright (c)')]);
    expect(result.changed).toBe(true);
    expect(result.content).toEqual([text('Copyright ©')]);
  });

  it('replaces single text element at end: (tm) to ™', () => {
    const result = replaceTrailingSymbols([text('Brand (tm)')]);
    expect(result.changed).toBe(true);
    expect(result.content).toEqual([text('Brand ™')]);
  });

  it('replaces when pattern spans multiple inline text elements', () => {
    const result = replaceTrailingSymbols([text('-'), text('>')]);
    expect(result.changed).toBe(true);
    expect(result.content).toEqual([text('→')]);
  });

  it('replaces when pattern spans multiple elements with prefix', () => {
    const result = replaceTrailingSymbols([text('a '), text('-'), text('>')]);
    expect(result.changed).toBe(true);
    expect(result.content).toEqual([text('a →')]);
  });

  it('does not replace when pattern is not at end', () => {
    const result = replaceTrailingSymbols([text('-> more text')]);
    expect(result.changed).toBe(false);
    expect(result.content).toEqual([text('-> more text')]);
  });

  it('replaces => to ⇒', () => {
    const result = replaceTrailingSymbols([text('x =>')]);
    expect(result.changed).toBe(true);
    expect(result.content).toEqual([text('x ⇒')]);
  });

  it('replaces <= to ⇐', () => {
    const result = replaceTrailingSymbols([text('y <=')]);
    expect(result.changed).toBe(true);
    expect(result.content).toEqual([text('y ⇐')]);
  });

  it('replaces >> to »', () => {
    const result = replaceTrailingSymbols([text('next >>')]);
    expect(result.changed).toBe(true);
    expect(result.content).toEqual([text('next »')]);
  });

  it('replaces << to «', () => {
    const result = replaceTrailingSymbols([text('prev <<')]);
    expect(result.changed).toBe(true);
    expect(result.content).toEqual([text('prev «')]);
  });

  it('replaces (r) to ®', () => {
    const result = replaceTrailingSymbols([text('Registered (r)')]);
    expect(result.changed).toBe(true);
    expect(result.content).toEqual([text('Registered ®')]);
  });

  it('preserves styles from last text item', () => {
    const styled = { type: 'text' as const, text: '->', styles: { bold: true } };
    const result = replaceTrailingSymbols([styled]);
    expect(result.changed).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: '→', styles: { bold: true } }]);
  });

  it('returns unchanged for empty content', () => {
    const result = replaceTrailingSymbols([]);
    expect(result.changed).toBe(false);
    expect(result.content).toEqual([]);
  });

  it('returns unchanged when no trailing text items', () => {
    const content = [{ type: 'taskLink', props: { taskKey: 'REQ-1' } }];
    const result = replaceTrailingSymbols(content);
    expect(result.changed).toBe(false);
    expect(result.content).toEqual(content);
  });

  it('does not replace when trailing item is not text', () => {
    const content = [text('see '), { type: 'taskLink', props: { taskKey: 'REQ-1' } }];
    const result = replaceTrailingSymbols(content);
    expect(result.changed).toBe(false);
    expect(result.content).toEqual(content);
  });
});

describe('findTrailingSymbol and revertTrailingSymbol (ESC undo)', () => {
  it('finds trailing → and reverts to ->', () => {
    const content = [text('a →')];
    expect(findTrailingSymbol(content)).toBe('→');
    const reverted = revertTrailingSymbol(content, '→');
    expect(reverted.changed).toBe(true);
    expect(reverted.content).toEqual([text('a ->')]);
  });

  it('finds trailing © and reverts to (c)', () => {
    const content = [text('Copyright ©')];
    expect(findTrailingSymbol(content)).toBe('©');
    const reverted = revertTrailingSymbol(content, '©');
    expect(reverted.changed).toBe(true);
    expect(reverted.content).toEqual([text('Copyright (c)')]);
  });

  it('returns null when no trailing symbol', () => {
    expect(findTrailingSymbol([text('plain text')])).toBeNull();
    expect(findTrailingSymbol([text('a ->')])).toBeNull();
  });
});
