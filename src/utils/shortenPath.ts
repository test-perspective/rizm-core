/**
 * Returns the last two path segments (directory + filename).
 * Supports both forward and backslash separators.
 */
export function shortenPath(path: string): string {
  if (!path || typeof path !== 'string') return path;
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 2) return path.trim();
  return parts.slice(-2).join('/');
}
