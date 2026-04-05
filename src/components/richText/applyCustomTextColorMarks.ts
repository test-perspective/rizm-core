/**
 * BlockNote's default stylesheet only defines [data-style-type="textColor"] for preset names
 * (gray, red, …). Hex and rgb() values from Jira import only set data-value, so the text
 * stays uncolored until we mirror the value into an inline color style.
 */
const BLOCKNOTE_PRESET_TEXT_COLORS = new Set([
  'default',
  'gray',
  'brown',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
]);

export function applyHexRgbTextColorFromDataValue(root: HTMLElement | null): void {
  if (!root) return;
  root.querySelectorAll('[data-style-type="textColor"]').forEach((node) => {
    const el = node as HTMLElement;
    const v = el.getAttribute('data-value');
    if (!v) return;
    if (BLOCKNOTE_PRESET_TEXT_COLORS.has(v)) {
      el.style.removeProperty('color');
      return;
    }
    const trimmed = v.trim();
    if (/^#[0-9A-Fa-f]{3,8}$/.test(trimmed) || /^rgba?\(/i.test(trimmed)) {
      el.style.setProperty('color', trimmed);
      return;
    }
    if (/^[a-zA-Z]+$/.test(trimmed)) {
      el.style.setProperty('color', trimmed);
      return;
    }
    el.style.removeProperty('color');
  });
}
