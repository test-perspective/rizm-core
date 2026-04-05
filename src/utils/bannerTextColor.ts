/** Parse hex / rgb() for relative luminance (banner contrast). */

function parseRgbFromHex(hex: string): [number, number, number] | null {
  const h = hex.replace(/^#/, '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length === 4) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length === 6 || h.length === 8) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return null;
}

export function parseCssColorRgb(input: string): [number, number, number] | null {
  const t = input.trim();
  if (t.startsWith('#')) {
    const v = parseRgbFromHex(t);
    if (!v) return null;
    if (v.some((n) => Number.isNaN(n))) return null;
    return v;
  }
  const m = t.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Light text on dark bg, dark text on light bg. */
export function pickContrastingTextColor(backgroundCss: string): string {
  const rgb = parseCssColorRgb(backgroundCss);
  if (!rgb) return '#fafafa';
  const [r, g, b] = rgb;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? '#0a0a0a' : '#fafafa';
}
