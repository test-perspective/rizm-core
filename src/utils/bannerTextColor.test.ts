import { describe, expect, it } from 'vitest';
import { parseCssColorRgb, pickContrastingTextColor } from './bannerTextColor';

describe('bannerTextColor', () => {
  it('parses hex and rgb', () => {
    expect(parseCssColorRgb('#fff')).toEqual([255, 255, 255]);
    expect(parseCssColorRgb('#aabbcc')).toEqual([170, 187, 204]);
    expect(parseCssColorRgb('rgb(10, 20, 30)')).toEqual([10, 20, 30]);
    expect(parseCssColorRgb('rgb( 1 , 2 , 3 )')).toEqual([1, 2, 3]);
    expect(parseCssColorRgb('nope')).toBeNull();
  });

  it('picks light text on dark background', () => {
    expect(pickContrastingTextColor('#000000')).toBe('#fafafa');
  });

  it('picks dark text on light background', () => {
    expect(pickContrastingTextColor('#ffffff')).toBe('#0a0a0a');
  });
});
