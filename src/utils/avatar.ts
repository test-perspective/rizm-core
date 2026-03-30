/**
 * Avatar utilities: generate initial letter and color classes from email.
 */

/**
 * Extract the first letter of email (uppercase), or '?' if empty/invalid.
 */
export function getAvatarInitial(email: string): string {
  if (!email || typeof email !== 'string') return '?';
  const trimmed = email.trim();
  if (trimmed.length === 0) return '?';
  return trimmed[0].toUpperCase();
}

/**
 * Simple hash function (djb2-like) to convert string to number.
 */
function hashStringToIndex(str: string, max: number): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % max;
}

/**
 * Color palette: colors that are visible on dark backgrounds.
 * Each entry is [bgClass, textClass, borderClass] for Tailwind.
 */
const AVATAR_COLOR_PALETTE: Array<[string, string, string]> = [
  ['bg-emerald-500/20', 'text-emerald-300', 'border-emerald-500/30'],
  ['bg-blue-500/20', 'text-blue-300', 'border-blue-500/30'],
  ['bg-violet-500/20', 'text-violet-300', 'border-violet-500/30'],
  ['bg-rose-500/20', 'text-rose-300', 'border-rose-500/30'],
  ['bg-amber-500/20', 'text-amber-300', 'border-amber-500/30'],
  ['bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/30'],
  ['bg-lime-500/20', 'text-lime-300', 'border-lime-500/30'],
  ['bg-fuchsia-500/20', 'text-fuchsia-300', 'border-fuchsia-500/30'],
  ['bg-indigo-500/20', 'text-indigo-300', 'border-indigo-500/30'],
  ['bg-teal-500/20', 'text-teal-300', 'border-teal-500/30'],
  ['bg-orange-500/20', 'text-orange-300', 'border-orange-500/30'],
  ['bg-pink-500/20', 'text-pink-300', 'border-pink-500/30'],
];

/**
 * Get deterministic color classes for an email.
 * Returns space-separated Tailwind classes: bg, text, border.
 */
export function getAvatarColorClasses(email: string): string {
  if (!email || typeof email !== 'string') {
    // Fallback to first palette entry
    const [bg, text, border] = AVATAR_COLOR_PALETTE[0];
    return `${bg} ${text} ${border}`;
  }
  const index = hashStringToIndex(email.trim().toLowerCase(), AVATAR_COLOR_PALETTE.length);
  const [bg, text, border] = AVATAR_COLOR_PALETTE[index];
  return `${bg} ${text} ${border}`;
}
